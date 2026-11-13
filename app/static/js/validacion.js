/* Validación con intérprete (/validacion, REQ-023): an LSEC interpreter tests
 * each sign of the units used in class — is the content right, is the sign
 * accepted when done well, is it REJECTED when done with typical learner
 * mistakes — with exactly the Aula's evaluation rule (HO.Curriculum.QUIZ +
 * HoldVerifier, same templates and trained model). Each result is saved as it
 * is made; the report gives the pilot's R1/R2 and a JSON the catalog script
 * (scripts/apply-sign-reviews.py) turns into `validated` / `assess` flags.
 * The decision logic is DOM-free and exported for node tests. */
(function (root) {
  'use strict';

  const TRIALS = 3;               // per step: done well, done wrong
  const COUNTDOWN_MS = 3000;      // time to get ready before each trial
  const MIN_CONFIDENCE = 0.6;     // same hand filter as the Aula
  const LS_REVIEWER = 'ho.review.reviewer';

  const DECISIONS = {
    ok: { icon: '✔', label: 'Correcta', help: 'Contenido correcto; el sistema la acepta bien hecha y la rechaza mal hecha.' },
    regrabar: { icon: '🎬', label: 'Grabar más plantillas', help: 'El sistema no la acepta siempre bien hecha: grabar plantillas con varias personas.' },
    corregir: { icon: '✏️', label: 'Corregir el contenido', help: 'La descripción, la pista o el video tienen errores.' },
    retirar: { icon: '⛔', label: 'Retirar de la evaluación', help: 'El sistema acepta la seña mal hecha: enseñaría una seña incorrecta.' },
  };
  const PRIORITY = ['corregir', 'retirar', 'regrabar'];

  /**
   * Suggested decision for one sign. r: {content_ok, recognizable, good_ok,
   * good_trials, bad_ok, bad_trials}. Content errors come first (fix the sign
   * before judging the engine), then accepting a wrong sign (the worst for
   * learning), then rejecting a right one.
   */
  function decide(r) {
    const reasons = [];
    if (r.content_ok === false) reasons.push(['corregir', 'La descripción, la pista o el video no son correctos.']);
    if (r.bad_ok > 0) {
      reasons.push(['retirar', 'Aceptó la seña mal hecha ' + r.bad_ok + ' de ' + r.bad_trials + ' veces: enseñaría una seña incorrecta.']);
    }
    if (r.recognizable === false) {
      reasons.push(['regrabar', 'Aún no tiene plantillas: el sistema no la puede reconocer.']);
    } else if (r.good_trials > 0 && r.good_ok < r.good_trials) {
      reasons.push(['regrabar', 'Aceptó la seña bien hecha solo ' + r.good_ok + ' de ' + r.good_trials + ' veces.']);
    }
    const codes = reasons.map((x) => x[0]);
    const decision = PRIORITY.find((c) => codes.includes(c)) || 'ok';
    return { decision: decision, reasons: reasons.map((x) => ({ code: x[0], text: x[1] })) };
  }

  /** Whether the review has what its decision needs before it can be saved. */
  function complete(r) {
    if (r.content_ok == null) return false;
    if (r.content_ok === false || r.recognizable === false) return true;
    return r.good_trials >= TRIALS && r.bad_trials >= TRIALS;
  }

  /**
   * Pilot figures from the latest review of each sign (report, kit 09 §4.2):
   * R1 = share of tested signs accepted every time done well;
   * R2 = number of signs accepted at least once done wrong.
   */
  function summarize(rows) {
    rows = rows || [];
    const decisions = { ok: 0, regrabar: 0, corregir: 0, retirar: 0 };
    for (const r of rows) if (decisions[r.decision] != null) decisions[r.decision] += 1;
    const tested = rows.filter((r) => r.recognizable !== false && r.good_trials > 0);
    const goodAll = tested.filter((r) => r.good_ok === r.good_trials).length;
    return {
      reviewed: rows.length,
      decisions: decisions,
      contentOk: rows.filter((r) => r.content_ok === true).length,
      contentWrong: rows.filter((r) => r.content_ok === false).length,
      tested: tested.length,
      goodAll: goodAll,
      r1: tested.length ? goodAll / tested.length : null,
      badAccepted: rows.filter((r) => r.bad_ok > 0).length,
      badTested: rows.filter((r) => r.bad_trials > 0).length,
    };
  }

  /** Signs of the chosen units in catalog order (each once) as [{sign, unit}]. */
  function planSigns(catalog, unitIds, opts) {
    opts = opts || {};
    const chosen = unitIds && unitIds.length ? new Set(unitIds) : null;
    const byId = {};
    for (const s of catalog.signs || []) byId[s.id] = s;
    const skip = new Set(opts.skip || []);
    const seen = new Set();
    const out = [];
    for (const unit of catalog.units || []) {
      if (chosen && !chosen.has(unit.id)) continue;
      for (const id of unit.signs) {
        if (seen.has(id) || skip.has(id) || !byId[id]) continue;
        seen.add(id);
        out.push({ sign: byId[id], unit: unit });
      }
    }
    return out;
  }

  function unitOf(catalog, signId) {
    return (catalog.units || []).find((u) => u.signs.includes(signId)) || null;
  }

  function csvCell(v) {
    const s = v == null ? '' : String(v);
    return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  const CSV_COLUMNS = ['sena', 'glosa', 'unidad', 'contenido_ok', 'nota_contenido', 'reconocible',
    'bien_aceptadas', 'bien_intentos', 'mal_aceptadas', 'mal_intentos', 'errores_probados',
    'decision', 'nota', 'revisor', 'fecha', 'plantillas', 'modelo'];

  /** Spreadsheet of the reviews (semicolon + BOM: opens in columns in Excel es). */
  function toCSV(rows, catalog) {
    const gloss = {};
    for (const s of catalog.signs || []) gloss[s.id] = s.gloss;
    const yn = (b) => (b === true ? 'sí' : b === false ? 'no' : '');
    const lines = [CSV_COLUMNS.join(';')];
    for (const r of rows) {
      const unit = unitOf(catalog, r.sign_id);
      const e = r.engine || {};
      lines.push([
        r.sign_id, gloss[r.sign_id] || r.sign_id, unit ? unit.title : '', yn(r.content_ok), r.content_note,
        yn(r.recognizable), r.good_ok, r.good_trials, r.bad_ok, r.bad_trials, r.bad_note,
        r.decision, r.note, r.reviewer, String(r.created_at || '').slice(0, 10),
        e.templates == null ? '' : e.templates, e.model || '',
      ].map(csvCell).join(';'));
    }
    return '﻿' + lines.join('\r\n') + '\r\n';
  }

  /**
   * One timed attempt with the Aula's evaluation rule: a countdown to get
   * ready, then `timeoutMs` to hold the sign (HoldVerifier). `verifier` is a
   * HO.Curriculum.HoldVerifier (or anything with reset/update).
   */
  function Trial(opts) {
    this.verifier = opts.verifier;
    this.timeoutMs = opts.timeoutMs;
    this.countdownMs = opts.countdownMs == null ? COUNTDOWN_MS : opts.countdownMs;
    this.phase = 'idle';
    this.accepted = null;
    this.last = null;
  }

  Trial.prototype.start = function (t) {
    this.phase = this.countdownMs > 0 ? 'countdown' : 'running';
    this.t0 = t;
    this.runStart = this.phase === 'running' ? t : null;
    if (this.phase === 'running') this.verifier.reset();
    this.accepted = null;
    return this.state(t);
  };

  Trial.prototype.update = function (hands, t) {
    if (this.phase === 'countdown' && t - this.t0 >= this.countdownMs) {
      this.phase = 'running';
      this.runStart = t;
      this.verifier.reset();
    }
    if (this.phase === 'running') {
      this.last = this.verifier.update(hands, t);
      if (this.last.done) { this.phase = 'done'; this.accepted = true; }
      else if (t - this.runStart >= this.timeoutMs) { this.phase = 'done'; this.accepted = false; }
    }
    return this.state(t);
  };

  Trial.prototype.state = function (t) {
    const s = this.last || {};
    return {
      phase: this.phase,
      countdown: this.phase === 'countdown' ? Math.max(1, Math.ceil((this.countdownMs - (t - this.t0)) / 1000)) : 0,
      remaining: this.phase === 'running' ? Math.max(0, this.timeoutMs - (t - this.runStart)) : 0,
      progress: s.progress || 0,
      score: s.score || 0,
      feedback: s.feedback || [],
      accepted: this.accepted,
    };
  };

  const api = {
    TRIALS, COUNTDOWN_MS, DECISIONS, CSV_COLUMNS,
    decide, complete, summarize, planSigns, unitOf, toCSV, Trial,
  };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  root.HO = root.HO || {};
  root.HO.Review = api;
  if (!document.getElementById('vl-app')) return;

  // ── Page ────────────────────────────────────────────────────────────────
  const C = root.HO.Curriculum;
  const L = root.HO.Learning;
  const $ = (id) => document.getElementById(id);
  const V = {
    lang: new URLSearchParams(root.location.search).get('lang') || 'lsec',
    catalog: null, templates: [], model: null, recognizer: null,
    latest: [],            // latest review of each sign (server)
    plan: [], idx: 0, cur: null, sitting: null,
    stream: null, source: null, raf: null, hands: [], trial: null, video: null, canvas: null, ctx: null,
  };

  function lsGet(k) { try { return root.localStorage.getItem(k) || ''; } catch (_) { return ''; } }
  function lsSet(k, v) { try { root.localStorage.setItem(k, v); } catch (_) { /* blocked */ } }

  let toastTimer = null;
  function toast(msg, isError) {
    const el = $('vl-toast');
    el.textContent = msg;
    el.className = 'vl-toast' + (isError ? ' vl-toast-error' : '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 4000);
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function show(id) {
    for (const s of ['vl-setup', 'vl-review', 'vl-report']) $(s).hidden = s !== id;
    root.scrollTo(0, 0);
  }

  function signOf(id) { return V.recognizer.signs[id] || { id: id, gloss: id }; }
  function latestOf(id) { return V.latest.find((r) => r.sign_id === id) || null; }
  function templateCount(id) { return V.templates.filter((t) => t.sign_id === id).length; }

  async function loadReviews() {
    V.latest = await L.request('/api/signs/' + V.lang + '/reviews', { admin: true });
  }

  // ── Setup ───────────────────────────────────────────────────────────────
  function renderUnits() {
    const box = $('vl-units');
    box.innerHTML = '';
    (V.catalog.units || []).forEach((u, i) => {
      const label = el('label', 'vl-unit');
      const input = el('input');
      input.type = 'checkbox';
      input.value = u.id;
      input.addEventListener('change', refreshEstimate);
      const text = el('span');
      text.appendChild(el('strong', null, 'Unidad ' + (i + 1) + ': ' + u.title));
      const done = u.signs.filter((id) => latestOf(id)).length;
      const pending = u.signs.filter((id) => !V.recognizer.isRecognizable(id)).length;
      text.appendChild(el('small', null, u.signs.map((id) => signOf(id).gloss).join(' · ')));
      text.appendChild(el('small', 'vl-muted',
        u.signs.length + ' señas · ' + (done ? done + ' ya revisada(s)' : 'sin revisar')
        + (pending ? ' · ' + pending + ' sin plantillas' : '')));
      label.append(input, text);
      box.appendChild(label);
    });
    refreshEstimate();
  }

  function chosenUnits() {
    return Array.from(document.querySelectorAll('#vl-units input:checked')).map((i) => i.value);
  }

  function buildPlan() {
    const skip = $('vl-only-new').checked ? V.latest.map((r) => r.sign_id) : [];
    return planSigns(V.catalog, chosenUnits(), { skip: skip });
  }

  function refreshEstimate() {
    const n = chosenUnits().length ? buildPlan().length : 0;
    $('vl-estimate').textContent = n
      ? n + ' seña(s) · unos ' + Math.max(1, Math.round(n * 2)) + ' minutos'
      : 'Elige al menos una unidad.';
    $('vl-start').disabled = !n || !$('vl-reviewer').value.trim();
  }

  async function start() {
    lsSet(LS_REVIEWER, $('vl-reviewer').value.trim());
    V.plan = buildPlan();
    if (!V.plan.length) return;
    V.sitting = new Date().toISOString().slice(0, 16) + '-' + Math.random().toString(36).slice(2, 6);
    V.idx = 0;
    show('vl-review');
    openSign();            // the interpreter reads the sign while the engine loads
    await startCamera();
    renderTrials();
  }

  // ── Camera ──────────────────────────────────────────────────────────────
  async function startCamera() {
    if (V.stream) return;
    try {
      V.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
    } catch (err) {
      $('vl-cam-status').textContent = '⚠️ Sin cámara: ' + err.message + '. Abre /diagnostico para ver cómo arreglarlo.';
      return;
    }
    V.video.srcObject = V.stream;
    await V.video.play();
    V.canvas.width = V.video.videoWidth || 640;
    V.canvas.height = V.video.videoHeight || 480;
    $('vl-cam-status').textContent = 'Cargando el reconocimiento de manos…';
    V.source = root.HO.createHandSource({
      onResult: (data) => {
        V.hands = (data.hands || []).filter((h) => typeof h.confidence !== 'number' || h.confidence >= MIN_CONFIDENCE);
      },
      onStatus: (s) => {
        $('vl-cam-status').textContent = s === 'connected' ? '' : s === 'disconnected' ? '⚠️ El reconocimiento se detuvo. Recarga la página.' : 'Cargando el reconocimiento de manos…';
        renderTrials();
      },
    });
    V.source.connect();
    loop();
  }

  function engineReady() {
    return !!(V.source && (typeof V.source.isOpen !== 'function' || V.source.isOpen()));
  }

  function loop() {
    V.raf = requestAnimationFrame(loop);
    if (!V.stream || V.video.readyState < 2) return;
    root.HO.drawMirroredVideo(V.ctx, V.video, V.canvas.width, V.canvas.height);
    V.source.sendFrame(V.canvas, 0.6);
    for (const h of V.hands) root.HO.drawSkeleton(V.ctx, h.landmarks, V.canvas.width, V.canvas.height);
    if (V.trial) renderTrialState(V.trial.update(V.hands, performance.now()));
  }

  function stopCamera() {
    if (V.raf) cancelAnimationFrame(V.raf);
    V.raf = null;
    if (V.source) V.source.close();
    V.source = null;
    if (V.stream) V.stream.getTracks().forEach((t) => t.stop());
    V.stream = null;
    V.trial = null;
  }

  // ── One sign ────────────────────────────────────────────────────────────
  function openSign() {
    const item = V.plan[V.idx];
    const s = item.sign;
    V.cur = {
      sign_id: s.id, content_ok: null, content_note: '', recognizable: V.recognizer.isRecognizable(s.id),
      good: [], bad: [], bad_note: '', decision: null, note: '',
    };
    V.trial = null;
    $('vl-progress').textContent = 'Seña ' + (V.idx + 1) + ' de ' + V.plan.length + ' · ' + item.unit.title;
    $('vl-gloss').textContent = s.gloss;
    $('vl-kind').textContent = s.kind === 'dynamic' ? 'Seña con movimiento' : 'Seña estática';
    $('vl-desc').textContent = s.description || '—';
    $('vl-hint').textContent = s.hint || '—';
    const prev = latestOf(s.id);
    $('vl-prev').textContent = prev
      ? ' · Revisión anterior: ' + DECISIONS[prev.decision].label + ' (' + prev.reviewer + ', ' + String(prev.created_at).slice(0, 10) + ')'
      : '';
    const media = $('vl-media');
    const info = C.mediaInfo(s, { teacher: true });
    $('vl-media-box').hidden = !(info && info.show);
    if (info && info.show) {
      media.src = info.src;
      if (info.poster) media.poster = info.poster; else media.removeAttribute('poster');
      $('vl-media-note').textContent = info.notice;
    } else {
      media.removeAttribute('src');
      media.load();
    }
    $('vl-content-yes').setAttribute('aria-pressed', 'false');
    $('vl-content-no').setAttribute('aria-pressed', 'false');
    $('vl-content-note-box').hidden = true;
    $('vl-content-note').value = '';
    $('vl-bad-note').value = '';
    $('vl-note').value = '';
    $('vl-not-recognizable').hidden = V.cur.recognizable;
    $('vl-step-good').hidden = $('vl-step-bad').hidden = !V.cur.recognizable;
    renderTrials();
    renderDecision();
    $('vl-gloss').focus();
  }

  function setContent(ok) {
    V.cur.content_ok = ok;
    $('vl-content-yes').setAttribute('aria-pressed', String(ok === true));
    $('vl-content-no').setAttribute('aria-pressed', String(ok === false));
    $('vl-content-note-box').hidden = ok !== false;
    renderDecision();
    // Keyboard flow: the next thing to do is the first trial (Space starts it).
    if (ok === false) $('vl-content-note').focus();
    else if (!$('vl-good-start').disabled && !$('vl-step-good').hidden) $('vl-good-start').focus();
  }

  function counts() {
    const c = V.cur;
    return {
      content_ok: c.content_ok, recognizable: c.recognizable,
      good_ok: c.good.filter(Boolean).length, good_trials: c.good.length,
      bad_ok: c.bad.filter(Boolean).length, bad_trials: c.bad.length,
    };
  }

  function nextKind() {
    if (!V.cur || !V.cur.recognizable) return null;
    if (V.cur.good.length < TRIALS) return 'good';
    if (V.cur.bad.length < TRIALS) return 'bad';
    return null;
  }

  function renderDots(box, list, kind) {
    box.innerHTML = '';
    for (let i = 0; i < TRIALS; i++) {
      const v = list[i];
      // Good trials: accepted is right. Bad trials: rejected is right.
      const right = v == null ? null : kind === 'good' ? v : !v;
      const d = el('li', 'vl-dot' + (right === true ? ' vl-dot-ok' : right === false ? ' vl-dot-fail' : ''));
      d.textContent = v == null ? String(i + 1) : (right ? '✔ ' : '✗ ') + (v ? 'aceptada' : 'rechazada');
      d.setAttribute('aria-label', 'Intento ' + (i + 1) + ': ' + (v == null ? 'pendiente' : v ? 'aceptada' : 'rechazada'));
      box.appendChild(d);
    }
  }

  function renderTrials() {
    if (!V.cur) return;
    renderDots($('vl-good-dots'), V.cur.good, 'good');
    renderDots($('vl-bad-dots'), V.cur.bad, 'bad');
    const running = !!(V.trial && V.trial.phase !== 'done');
    for (const kind of ['good', 'bad']) {
      const list = V.cur[kind];
      const btn = $('vl-' + kind + '-start');
      btn.disabled = running || list.length >= TRIALS || !engineReady() || (kind === 'bad' && V.cur.good.length < TRIALS);
      btn.textContent = list.length >= TRIALS ? 'Hecho'
        : '▶ Intento ' + (list.length + 1) + ' de ' + TRIALS + (nextKind() === kind ? ' (barra espaciadora)' : '');
      $('vl-' + kind + '-undo').hidden = running || !list.length;
    }
  }

  function startTrial(kind) {
    if (!V.cur || (V.trial && V.trial.phase !== 'done') || V.cur[kind].length >= TRIALS || !engineReady()) return;
    const verifier = new C.HoldVerifier({ recognizer: V.recognizer, signId: V.cur.sign_id, holdMs: C.QUIZ.holdMs });
    V.trial = new Trial({ verifier: verifier, timeoutMs: C.QUIZ.timeoutMs });
    V.trial.kind = kind;
    renderTrialState(V.trial.start(performance.now()));
    renderTrials();
  }

  function renderTrialState(st) {
    const over = $('vl-overlay');
    const kind = V.trial.kind;
    if (st.phase === 'countdown') {
      over.hidden = false;
      over.className = 'vl-overlay';
      over.textContent = (kind === 'good' ? 'Hazla bien · ' : 'Hazla con el error · ') + st.countdown;
    } else if (st.phase === 'running') {
      over.hidden = false;
      over.className = 'vl-overlay vl-overlay-run';
      over.textContent = '⏱ ' + Math.ceil(st.remaining / 1000) + ' s';
      $('vl-meter-fill').style.width = Math.round(st.progress * 100) + '%';
    } else if (st.phase === 'done') {
      const trial = V.trial;
      V.trial = null;
      V.cur[kind].push(st.accepted);
      $('vl-meter-fill').style.width = '0%';
      const right = kind === 'good' ? st.accepted : !st.accepted;
      over.className = 'vl-overlay ' + (right ? 'vl-overlay-ok' : 'vl-overlay-fail');
      over.textContent = kind === 'good'
        ? (st.accepted ? '✔ Aceptada' : '✗ No la aceptó')
        : (st.accepted ? '✗ La aceptó (no debía)' : '✔ Rechazada');
      setTimeout(() => { if (!V.trial) over.hidden = true; }, 1200);
      $('vl-live').textContent = 'Intento ' + V.cur[kind].length + ' ' + (kind === 'good' ? 'bien hecha' : 'con error')
        + ': ' + (st.accepted ? 'aceptada' : 'no aceptada') + '.';
      renderTrials();
      renderDecision();
      return trial;
    }
    return null;
  }

  function undo(kind) {
    if (V.trial) return;
    V.cur[kind].pop();
    renderTrials();
    renderDecision();
  }

  function renderDecision() {
    const c = counts();
    const d = decide(c);
    const reasons = $('vl-reasons');
    reasons.innerHTML = '';
    if (!complete(c)) {
      reasons.appendChild(el('li', 'vl-muted', c.content_ok == null
        ? 'Responde primero si el contenido es correcto.'
        : 'Faltan intentos: ' + Math.max(0, TRIALS - c.good_trials) + ' bien hecha y ' + Math.max(0, TRIALS - c.bad_trials) + ' con errores.'));
    } else if (!d.reasons.length) {
      reasons.appendChild(el('li', null, DECISIONS.ok.help));
    } else {
      for (const r of d.reasons) reasons.appendChild(el('li', null, DECISIONS[r.code].icon + ' ' + r.text));
    }
    const sel = $('vl-decision');
    if (!V.cur.decisionTouched) sel.value = d.decision;
    $('vl-decision-help').textContent = DECISIONS[sel.value].help;
    $('vl-save').disabled = !complete(c);
  }

  async function save() {
    const c = counts();
    if (!complete(c)) return;
    const body = Object.assign({}, c, {
      sign_id: V.cur.sign_id,
      reviewer: $('vl-reviewer').value.trim(),
      sitting: V.sitting,
      content_note: $('vl-content-note').value.trim() || null,
      bad_note: $('vl-bad-note').value.trim() || null,
      decision: $('vl-decision').value,
      note: $('vl-note').value.trim() || null,
      engine: {
        templates: templateCount(V.cur.sign_id),
        model: V.model ? V.model.id : null,
        engine: V.source && typeof V.source.engine === 'function' ? V.source.engine() : 'server',
      },
    });
    $('vl-save').disabled = true;
    try {
      const row = await L.request('/api/signs/' + V.lang + '/reviews', { admin: true, body: body });
      V.latest = [row].concat(V.latest.filter((r) => r.sign_id !== row.sign_id));
      toast('Guardada: ' + signOf(row.sign_id).gloss + ' — ' + DECISIONS[row.decision].label);
      next();
    } catch (err) {
      toast('No se pudo guardar: ' + err.message + '. Vuelve a intentarlo.', true);
      $('vl-save').disabled = false;
    }
  }

  function next() {
    V.idx += 1;
    if (V.idx >= V.plan.length) { finish(); return; }
    openSign();
  }

  function finish() {
    stopCamera();
    renderReport();
    show('vl-report');
  }

  // ── Report ──────────────────────────────────────────────────────────────
  function tile(value, label, cls) {
    const t = el('div', 'vl-tile' + (cls ? ' ' + cls : ''));
    t.append(el('strong', null, value), el('span', null, label));
    return t;
  }

  function sortedLatest() {
    const order = {};
    planSigns(V.catalog, []).forEach((p, i) => { order[p.sign.id] = i; });
    return V.latest.slice().sort((a, b) => (order[a.sign_id] ?? 1e9) - (order[b.sign_id] ?? 1e9));
  }

  function renderReport() {
    const rows = sortedLatest();
    const s = summarize(rows);
    const total = (V.catalog.signs || []).length;
    const tiles = $('vl-tiles');
    tiles.innerHTML = '';
    tiles.append(
      tile(s.reviewed + ' / ' + total, 'señas revisadas'),
      tile(String(s.decisions.ok), 'correctas'),
      tile(s.r1 == null ? '—' : Math.round(s.r1 * 100) + ' %', 'aceptadas bien hechas 3 de 3 (R1)', s.r1 != null && s.r1 < 0.85 ? 'vl-tile-warn' : ''),
      tile(String(s.badAccepted), 'aceptadas mal hechas (R2)', s.badAccepted ? 'vl-tile-fail' : 'vl-tile-ok'),
      tile(String(s.contentWrong), 'con contenido a corregir', s.contentWrong ? 'vl-tile-warn' : ''),
    );
    const tbody = $('vl-table-body');
    tbody.innerHTML = '';
    for (const r of rows) {
      const tr = el('tr', 'vl-row-' + r.decision);
      const unit = unitOf(V.catalog, r.sign_id);
      const content = r.content_ok === true ? '✔' : r.content_ok === false ? '✗ ' + (r.content_note || '') : '—';
      const good = r.recognizable === false ? 'sin plantillas' : r.good_trials ? r.good_ok + ' / ' + r.good_trials : '—';
      const bad = !r.bad_trials ? '—' : r.bad_ok + ' / ' + r.bad_trials + (r.bad_note ? ' (' + r.bad_note + ')' : '');
      [signOf(r.sign_id).gloss, unit ? unit.title : '', content, good, bad,
        DECISIONS[r.decision].icon + ' ' + DECISIONS[r.decision].label + (r.note ? ' — ' + r.note : ''),
        r.reviewer + ' · ' + String(r.created_at).slice(0, 10)]
        .forEach((v) => tr.appendChild(el('td', null, v)));
      tbody.appendChild(tr);
    }
    $('vl-table-empty').hidden = rows.length > 0;
  }

  function download(name, text, type) {
    const a = el('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function stamp() { return new Date().toISOString().slice(0, 10); }

  async function openReport() {
    stopCamera();
    try { await loadReviews(); } catch (err) { toast('No se pudieron cargar las revisiones: ' + err.message, true); }
    renderReport();
    show('vl-report');
  }

  async function backToSetup() {
    stopCamera();
    try { await loadReviews(); } catch (_) { /* keep what we have */ }
    renderUnits();
    show('vl-setup');
  }

  // ── Boot ────────────────────────────────────────────────────────────────
  async function boot() {
    V.video = $('vl-video');
    V.canvas = $('vl-canvas');
    V.ctx = V.canvas.getContext('2d');
    const [catalog, templates, modelJson] = await Promise.all([
      L.request('/api/signs/' + V.lang + '/catalog'),
      L.request('/api/signs/' + V.lang + '/templates'),
      fetch('/api/signs/' + V.lang + '/model').then((r) => (r.status === 200 ? r.json() : null)).catch(() => null),
    ]);
    V.catalog = catalog;
    V.templates = templates;
    V.model = modelJson;
    const model = modelJson && root.HO.SignModel ? root.HO.SignModel.load(modelJson) : null;
    V.recognizer = new root.HO.Signs.SignRecognizer({ catalog: catalog, templates: templates, model: model });
    $('vl-lang').textContent = catalog.language.short_name || catalog.language.name;
    $('vl-engine').textContent = templates.length + ' plantillas'
      + (modelJson ? ' · modelo entrenado activo' : ' · sin modelo entrenado');
    try {
      await loadReviews();
    } catch (err) {
      $('vl-auth').hidden = false;
      $('vl-auth').textContent = '🔒 ' + err.message + '. Esta página es para docentes: pide el token de administrador (ADMIN_TOKEN) y recarga.';
      $('vl-start').disabled = true;
      return;
    }
    $('vl-reviewer').value = lsGet(LS_REVIEWER);
    renderUnits();
  }

  function init() {
    $('vl-reviewer').addEventListener('input', refreshEstimate);
    $('vl-only-new').addEventListener('change', refreshEstimate);
    $('vl-start').addEventListener('click', start);
    $('vl-open-report').addEventListener('click', openReport);
    $('vl-content-yes').addEventListener('click', () => setContent(true));
    $('vl-content-no').addEventListener('click', () => setContent(false));
    for (const kind of ['good', 'bad']) {
      $('vl-' + kind + '-start').addEventListener('click', () => startTrial(kind));
      $('vl-' + kind + '-undo').addEventListener('click', () => undo(kind));
    }
    $('vl-decision').addEventListener('change', () => { V.cur.decisionTouched = true; renderDecision(); });
    $('vl-save').addEventListener('click', save);
    $('vl-skip').addEventListener('click', next);
    $('vl-stop').addEventListener('click', finish);
    $('vl-back').addEventListener('click', backToSetup);
    $('vl-csv').addEventListener('click', () => download('revision-senas-' + V.lang + '-' + stamp() + '.csv', toCSV(sortedLatest(), V.catalog), 'text/csv;charset=utf-8'));
    $('vl-json').addEventListener('click', () => download('revision-senas-' + V.lang + '-' + stamp() + '.json',
      JSON.stringify({ language: V.lang, exported_at: new Date().toISOString(), reviews: sortedLatest() }, null, 2), 'application/json'));
    $('vl-print').addEventListener('click', () => root.print());
    document.addEventListener('keydown', (e) => {
      if (e.code !== 'Space' || $('vl-review').hidden) return;
      const tag = (e.target && e.target.tagName) || '';
      if (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(tag)) return;
      const kind = nextKind();
      if (kind) { e.preventDefault(); startTrial(kind); }
    });
    root.addEventListener('pagehide', stopCamera);
    boot().catch((err) => toast('No se pudo cargar: ' + err.message, true));
  }

  init();
})(typeof window !== 'undefined' ? window : globalThis);
