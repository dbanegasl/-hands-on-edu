/**
 * Aula de Señas — learner course (REQ-018)
 *
 * Learning path over the catalog units: lesson (see + practise each sign with
 * didactic feedback), quiz (pass ≥ 70% to unlock the next unit), spaced review
 * of weak/stale signs, and fingerspelling practice. Every attempt is stored via
 * /api/sessions/* so mastery drives review and, later, LMS grades (REQ-019).
 *
 * Teacher shortcut: ?unlock=all opens every unit. ?lang=<code> picks a catalog.
 */
(function () {
  'use strict';

  const PARAMS = new URLSearchParams(location.search);
  const LANG = PARAMS.get('lang') || 'lsec';
  const UNLOCK_ALL = PARAMS.get('unlock') === 'all';
  const SS_LTI = 'ho.lti.token';
  const MODULE = 'aula_senas';
  const MIN_CONFIDENCE = 0.6;
  const RING_CIRC = 2 * Math.PI * 52;
  const FEEDBACK_MS = 950;
  const LS_PROFILES = 'ho.aula.profiles';
  const LS_CURRENT = 'ho.aula.current';
  const LS_MUTED = 'ho.aula.muted';

  const MODES = {
    lesson: { title: 'Lección', info: true, timeoutMs: 0, skipAfterMs: 6000, holdMs: 1200, hintAfterMs: 0 },
    quiz: { title: 'Evaluación', info: false, timeoutMs: 12000, skipAfterMs: 0, holdMs: 1200, hintAfterMs: -1 },
    review: { title: 'Repaso', info: false, timeoutMs: 15000, skipAfterMs: 0, holdMs: 1000, hintAfterMs: 6000 },
    spell: { title: 'Deletreo', info: false, timeoutMs: 0, skipAfterMs: 5000, holdMs: 700, hintAfterMs: 5000 },
  };

  const C = HO.Curriculum;
  const A = {
    learner: null, catalog: null, templates: [], recognizer: null,
    progress: null, sessions: [], status: [], passed: new Set(),
    stream: null, source: null, anim: null, lastHands: [],
    act: null, lastWord: null,
    teacher: UNLOCK_ALL,
    lti: null,               // {token, launch} when opened from an LMS (LTI 1.3)
  };
  const audio = typeof AudioFeedback === 'function' ? new AudioFeedback() : null;
  const $ = (id) => document.getElementById(id);
  let video, canvas, ctx;

  // ── Utilities ──────────────────────────────────────────────────────────────

  function lsGet(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* blocked */ } }

  let toastTimer = null;
  function toast(msg, isError) {
    const el = $('au-toast');
    el.textContent = msg;
    el.className = 'au-toast' + (isError ? ' error' : '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
  }

  async function api(path, opts) {
    const headers = { 'Content-Type': 'application/json' };
    if (A.lti) headers.Authorization = 'Bearer ' + A.lti.token;
    else if (A.learnerToken) headers['X-Learner-Token'] = A.learnerToken;   // local profile (TD-013)
    const res = await fetch(path, Object.assign({ headers: headers }, opts || {}));
    if (res.status === 401 && A.lti) {
      toast('Tu sesión de la plataforma expiró: vuelve a abrir la actividad desde Moodle', true);
    }
    if (!res.ok) {
      let detail = res.statusText;
      try { const j = await res.json(); detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail); } catch (_) { /* */ }
      const err = new Error(detail);
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }

  function play(sound) { if (audio) audio.play(sound); }
  const sign = (id) => A.recognizer.signs[id] || { id: id, gloss: id };

  function show(screenId) {
    document.querySelectorAll('.au-screen').forEach((s) => s.classList.toggle('active', s.id === screenId));
    window.scrollTo(0, 0);
  }

  // ── LTI (opened from Moodle) ───────────────────────────────────────────────

  /** Launch token from the URL fragment (#lti=…), kept per tab; removed from the address bar. */
  function readLtiToken() {
    const m = /(?:^|[#&])lti=([^&]+)/.exec(location.hash);
    if (m) {
      try { sessionStorage.setItem(SS_LTI, m[1]); } catch (_) { /* storage blocked */ }
      history.replaceState(null, '', location.pathname + location.search);
      return m[1];
    }
    try { return sessionStorage.getItem(SS_LTI); } catch (_) { return null; }
  }

  async function bootLti(token) {
    A.lti = { token: token, launch: null };
    try {
      const me = await api('/api/lti/me');
      A.lti.launch = me.launch;
      A.teacher = UNLOCK_ALL || me.launch.is_instructor;
      await selectLearner(me.learner);
      return true;
    } catch (err) {
      A.lti = null;
      try { sessionStorage.removeItem(SS_LTI); } catch (_) { /* */ }
      if (err.status !== 401) toast('No se pudo conectar con la plataforma: ' + err.message, true);
      return false;
    }
  }

  function renderLtiBanner() {
    const el = $('au-lti');
    const l = A.lti && A.lti.launch;
    el.hidden = !l;
    if (!l) return;
    const unit = l.unit && A.status.find((u) => u.unit.id === l.unit);
    const where = [l.context_title, l.resource_link_title].filter(Boolean).join(' · ');
    let text = '🎓 Conectado desde ' + (l.platform || 'tu plataforma educativa') + (where ? ': ' + where : '') + '.';
    if (unit) text += ' Actividad: ' + unit.unit.title + '.';
    if (l.graded && !l.is_instructor) {
      text += unit
        ? ' Tu mejor nota en la evaluación de esta unidad se envía al libro de calificaciones.'
        : ' Tu mejor nota en las evaluaciones se envía al libro de calificaciones.';
    }
    if (l.is_instructor) text += ' Modo docente: todas las unidades están abiertas y tus evaluaciones no se califican.';
    el.textContent = text;
    if (l.is_instructor) {
      const link = document.createElement('a');
      link.className = 'au-btn au-btn-ghost au-panel-link';
      link.href = '/panel';
      link.textContent = '📊 Panel del curso';
      el.append(' ', link);
    }
  }

  async function syncGrade(sessionId) {
    const el = $('au-res-lms');
    el.hidden = false;
    el.className = 'au-res-lms';
    el.textContent = '⏳ Enviando tu nota a la plataforma…';
    for (let i = 0; i < 6; i++) {
      let g;
      try { g = await api('/api/lti/sessions/' + sessionId + '/grade'); } catch (_) { break; }
      if (g.status === 'none') { await new Promise((r) => setTimeout(r, 1000)); continue; }
      if (g.status === 'sent') {
        el.className = 'au-res-lms ok';
        el.textContent = '✔ Nota enviada a la plataforma: ' + g.score_given + '/' + g.score_maximum;
      } else if (g.status === 'skipped') {
        el.textContent = 'ℹ️ ' + g.detail + '.';
      } else if (g.status === 'failed') {
        el.className = 'au-res-lms bad';
        el.textContent = '⚠️ No se pudo enviar la nota a la plataforma. Tu resultado quedó guardado; avisa a tu docente.';
      } else {
        el.hidden = true;
      }
      return;
    }
    el.textContent = 'ℹ️ Tu nota se enviará a la plataforma en unos momentos.';
  }

  // ── Boot & profile ─────────────────────────────────────────────────────────

  async function boot() {
    const [catalog, templates, modelJson] = await Promise.all([
      api('/api/signs/' + LANG + '/catalog'),
      api('/api/signs/' + LANG + '/templates'),
      // Trained classifier (REQ-010): optional, the engine works without it.
      api('/api/signs/' + LANG + '/model').catch(() => null),
    ]);
    A.catalog = catalog;
    A.templates = templates;
    const model = modelJson && HO.SignModel ? HO.SignModel.load(modelJson) : null;
    A.recognizer = new HO.Signs.SignRecognizer({ catalog, templates, model });
    $('au-lang-name').textContent = catalog.language.short_name || catalog.language.name;
    const banner = $('au-validation');
    banner.hidden = !catalog.language.validation_note;
    banner.textContent = '⚠️ ' + (catalog.language.validation_note || '');

    const ltiToken = readLtiToken();
    if (ltiToken && await bootLti(ltiToken)) return;

    renderProfiles();
    const current = lsGet(LS_CURRENT, null);
    if (current) {
      try {
        await selectLearner(await openProfile(current));
        return;
      } catch (err) {
        if (!lostProfile(err)) throw err;
        forgetProfile(current);
        renderProfiles();
      }
    }
    show('screen-profile');
    $('au-name').focus();
  }

  function renderProfiles() {
    const profiles = lsGet(LS_PROFILES, []);
    $('au-profiles').hidden = !profiles.length;
    const list = $('au-profile-list');
    list.innerHTML = '';
    for (const p of profiles) {
      const b = document.createElement('button');
      b.className = 'au-btn';
      b.type = 'button';
      b.textContent = '👤 ' + p.name;
      b.addEventListener('click', async () => {
        try { await selectLearner(await openProfile(p.id)); } catch (err) {
          if (lostProfile(err)) {
            forgetProfile(p.id); renderProfiles();
            toast(err.status === 404 ? 'Ese perfil ya no existe' : 'Ese perfil se usa en otro navegador', true);
          } else toast(err.message, true);
        }
      });
      list.appendChild(b);
    }
  }

  // ── Local profile credentials (TD-013) ─────────────────────────────────────
  // The server hands out a secret per profile; this browser keeps it with the
  // profile and sends it as X-Learner-Token. Profiles saved before v0.17 have
  // none: they claim it once (the first browser that asks gets it).
  function profileToken(id) {
    const p = lsGet(LS_PROFILES, []).find((x) => x.id === id);
    return (p && p.token) || null;
  }

  function storeProfileToken(id, token) {
    lsSet(LS_PROFILES, lsGet(LS_PROFILES, []).map((p) => (p.id === id ? Object.assign({}, p, { token: token }) : p)));
  }

  /** The learner behind a stored profile, claiming its credential if needed. */
  async function openProfile(id) {
    let token = profileToken(id);
    if (!token) {
      A.learnerToken = null;
      token = (await api('/api/learners/' + encodeURIComponent(id) + '/claim', { method: 'POST' })).token;
      storeProfileToken(id, token);
    }
    A.learnerToken = token;
    return api('/api/learners/' + encodeURIComponent(id));
  }

  /** Not found, or its credential belongs to another browser: drop it from this one. */
  const lostProfile = (err) => [403, 404, 409].includes(err.status);

  function forgetProfile(id) {
    lsSet(LS_PROFILES, lsGet(LS_PROFILES, []).filter((p) => p.id !== id));
    if (lsGet(LS_CURRENT, null) === id) lsSet(LS_CURRENT, null);
  }

  async function createProfile(e) {
    e.preventDefault();
    const name = $('au-name').value.trim();
    if (!name) return;
    try {
      const learner = await api('/api/learners', { method: 'POST', body: JSON.stringify({ display_name: name }) });
      const profiles = lsGet(LS_PROFILES, []).filter((p) => p.id !== learner.id);
      profiles.unshift({ id: learner.id, name: learner.display_name, token: learner.token });
      A.learnerToken = learner.token;
      lsSet(LS_PROFILES, profiles.slice(0, 8));
      await selectLearner(learner);
    } catch (err) {
      toast('No se pudo crear el perfil: ' + err.message, true);
    }
  }

  async function selectLearner(learner) {
    A.learner = learner;
    const el = $('au-learner');
    el.hidden = false;
    if (A.lti) {
      el.textContent = '🎓 ' + learner.display_name;
      el.title = 'Conectado desde la plataforma educativa';
      el.style.cursor = 'default';
    } else {
      lsSet(LS_CURRENT, learner.id);
      el.textContent = '👤 ' + learner.display_name;
      el.title = 'Cambiar de perfil';
      el.style.cursor = 'pointer';
    }
    await goPath();
  }

  // ── Learning path ──────────────────────────────────────────────────────────

  async function goPath() {
    stopCamera();
    A.act = null;
    const [progress, sessions] = await Promise.all([
      api('/api/learners/' + A.learner.id + '/progress?language=' + encodeURIComponent(LANG)),
      api('/api/learners/' + A.learner.id + '/sessions?finished=true&module=' + MODULE + '&limit=500'),
    ]);
    A.progress = progress;
    A.sessions = sessions;
    A.passed = C.passedUnits(sessions);
    const mastery = {};
    for (const s of progress.signs) mastery[s.sign_id] = s.mastery;
    A.status = C.unitStatus(A.catalog, A.recognizer, mastery, A.passed, { unlockAll: A.teacher, open: A.lti && A.lti.launch && A.lti.launch.unit ? [A.lti.launch.unit] : [] });
    renderPath(mastery);
    show('screen-path');
    const focus = document.querySelector('.au-unit.focus');
    if (focus) focus.scrollIntoView({ block: 'center' });
  }

  function renderPath(mastery) {
    $('au-path-sub').textContent = 'Hola, ' + A.learner.display_name + '. Practica cada unidad y aprueba su evaluación para avanzar.'
      + (A.teacher && !A.lti ? ' (Modo docente: todo desbloqueado)' : '');
    renderLtiBanner();
    $('au-stat-mastered').textContent = String(A.progress.signs_mastered);
    $('au-stat-units').textContent = String(A.passed.size);
    $('au-stat-attempts').textContent = String(A.progress.total_attempts);

    const review = C.pickReview(A.progress.signs, A.recognizer, 8);
    $('au-btn-review').disabled = !review.length;
    $('au-review-sub').textContent = review.length
      ? review.length + ' seña(s) para reforzar: ' + review.slice(0, 5).map((id) => sign(id).gloss).join(', ')
      : 'Haz una lección primero: aquí aparecerán las señas que más te cuestan';

    const words = C.spellableWords(A.catalog, A.recognizer);
    $('au-btn-spell').disabled = !words.length;
    $('au-spell-sub').textContent = words.length
      ? words.length + ' palabras disponibles, p. ej. ' + words.slice(0, 3).map((w) => w.word).join(', ')
      : 'Aún no hay palabras con letras reconocibles';

    const box = $('au-units');
    box.innerHTML = '';
    A.status.forEach((st, i) => {
      const card = document.createElement('article');
      const focus = A.lti && A.lti.launch && A.lti.launch.unit === st.unit.id;
      card.className = 'au-unit' + (st.passed ? ' passed' : '') + (st.locked ? ' locked' : '') + (!st.playable ? ' soon' : '') + (focus ? ' focus' : '');
      const head = document.createElement('div');
      head.className = 'au-unit-head';
      const num = document.createElement('div');
      num.className = 'au-unit-num';
      num.textContent = 'Unidad ' + (i + 1);
      const chip = document.createElement('span');
      chip.className = 'au-chip' + (st.passed ? ' ok' : !st.playable ? ' soon' : st.locked ? ' lock' : '');
      chip.textContent = st.passed ? '✅ Aprobada' : !st.playable ? '⏳ Próximamente' : st.locked ? '🔒 Bloqueada' : '▶ Disponible';
      head.append(num, chip);
      const h = document.createElement('h2');
      h.textContent = st.unit.title;

      const glosses = document.createElement('div');
      glosses.className = 'au-glosses';
      for (const id of st.unit.signs) {
        const g = document.createElement('span');
        g.textContent = sign(id).gloss;
        if (st.pending.includes(id)) { g.className = 'pending'; g.title = 'Necesita una grabación del docente'; }
        else if ((mastery[id] || 0) >= C.MASTERED) { g.className = 'm'; g.title = 'Dominada'; }
        glosses.appendChild(g);
      }

      const bar = document.createElement('div');
      bar.className = 'au-bar';
      bar.title = 'Dominio promedio: ' + Math.round(st.mastery * 100) + '%';
      const fill = document.createElement('div');
      fill.style.width = Math.round(st.mastery * 100) + '%';
      bar.appendChild(fill);

      const actions = document.createElement('div');
      actions.className = 'au-unit-actions';
      const lesson = document.createElement('button');
      lesson.className = 'au-btn';
      lesson.textContent = '📖 Lección';
      const quiz = document.createElement('button');
      quiz.className = 'au-btn au-btn-primary';
      quiz.textContent = '📝 Evaluación';
      lesson.disabled = quiz.disabled = st.locked || !st.playable;
      lesson.addEventListener('click', () => startActivity('lesson', { unit: st }));
      quiz.addEventListener('click', () => startActivity('quiz', { unit: st }));
      actions.append(lesson, quiz);

      const note = document.createElement('p');
      note.className = 'au-muted';
      note.style.fontSize = '0.8rem';
      note.textContent = !st.playable
        ? 'Necesita que un docente grabe estas señas en el Estudio de Señas.'
        : st.locked ? 'Aprueba la evaluación de la unidad anterior para desbloquearla.'
          : st.pending.length ? st.pending.length + ' seña(s) aún sin grabación se omiten.' : '';

      card.append(head, h, glosses, bar, actions);
      if (note.textContent) card.appendChild(note);
      box.appendChild(card);
    });
  }

  // ── Activity ───────────────────────────────────────────────────────────────

  async function startActivity(mode, opts) {
    opts = opts || {};
    let items = [];
    let activity = mode;
    let word = null;
    if (mode === 'lesson') {
      items = opts.unit.available.slice();
      activity = 'lesson:' + opts.unit.unit.id;
    } else if (mode === 'quiz') {
      items = C.buildQuiz(opts.unit.available, 5);
      activity = C.QUIZ_ACTIVITY_PREFIX + opts.unit.unit.id;
    } else if (mode === 'review') {
      items = C.pickReview(A.progress.signs, A.recognizer, 8);
    } else if (mode === 'spell') {
      const words = C.spellableWords(A.catalog, A.recognizer);
      const pool = words.length > 1 ? words.filter((w) => w.word !== A.lastWord) : words;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      if (pick) { word = pick.word; items = pick.letters; activity = 'spell:' + word; A.lastWord = word; }
    }
    if (!items.length) { toast('No hay señas disponibles para esta actividad', true); return; }

    let session;
    try {
      session = await api('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({ learner_id: A.learner.id, module: MODULE, activity: activity, language: LANG }),
      });
    } catch (err) {
      toast('No se pudo iniciar la actividad: ' + err.message, true);
      return;
    }

    A.act = {
      mode: mode, cfg: MODES[mode], unit: opts.unit || null, word: word, items: items, idx: -1,
      results: [], sessionId: session.id, pending: [], verifier: null, itemStart: 0, phase: 'practice',
      replay: () => startActivity(mode, opts),
    };
    $('au-act-title').textContent = MODES[mode].title + (opts.unit ? ' · ' + opts.unit.unit.title : word ? ' · ' + word : '');
    renderDots();
    show('screen-activity');
    startCamera();
    nextItem();
  }

  function renderDots() {
    const act = A.act;
    const box = $('au-dots');
    box.innerHTML = '';
    act.items.forEach((_, i) => {
      const d = document.createElement('span');
      const r = act.results[i];
      d.className = r ? (r.correct ? 'ok' : 'bad') : i === act.idx ? 'cur' : '';
      box.appendChild(d);
    });
    const wordBox = $('au-word');
    wordBox.hidden = act.mode !== 'spell';
    if (act.mode === 'spell') {
      wordBox.innerHTML = '';
      act.items.forEach((id, i) => {
        const s = document.createElement('span');
        s.textContent = sign(id).gloss;
        s.className = i < act.idx ? 'done' : i === act.idx ? 'cur' : '';
        wordBox.appendChild(s);
      });
    }
  }

  function nextItem() {
    const act = A.act;
    act.idx += 1;
    if (act.idx >= act.items.length) { finishActivity(); return; }
    const id = act.items[act.idx];
    act.verifier = new C.HoldVerifier({ recognizer: A.recognizer, signId: id, holdMs: act.cfg.holdMs });
    act.itemStart = performance.now();
    act.phase = 'practice';
    renderPrompt(id);
    renderDots();
  }

  function renderPrompt(id) {
    const act = A.act;
    const s = sign(id);
    $('au-gloss').textContent = s.gloss;
    $('au-desc').textContent = act.cfg.info ? (s.description || '') : '';
    $('au-hint').textContent = act.cfg.hintAfterMs === 0 && s.hint ? '👉 ' + s.hint : '';
    $('au-feedback').innerHTML = '';
    $('au-meter-fill').style.width = '0%';
    $('au-ring-fill').style.strokeDashoffset = String(RING_CIRC);
    $('au-overlay').hidden = true;
    $('au-timer').hidden = !act.cfg.timeoutMs;
    $('au-btn-skip').disabled = act.cfg.skipAfterMs > 0;
    const media = $('au-media');
    const info = act.cfg.info ? C.mediaInfo(s, { teacher: A.teacher }) : null;
    const showMedia = !!(info && info.show);
    $('au-media-box').hidden = !showMedia;
    if (showMedia) {
      media.src = info.src;
      if (info.poster) media.poster = info.poster; else media.removeAttribute('poster');
      media.play().catch(() => { /* autoplay may be blocked; controls remain */ });
      const note = $('au-media-note');
      note.textContent = info.notice;
      note.classList.toggle('pending', !info.validated);
    } else {
      media.pause();
      media.removeAttribute('src');
      media.load();
      $('au-media-note').textContent = '';
    }
    drawReference(id, act.cfg.info || act.mode === 'review');
  }

  /** Draw the first frame of a teacher-recorded template as a reference skeleton. */
  function drawReference(id, enabled) {
    const ref = $('au-ref');
    const tpl = enabled && A.templates.find((t) => t.sign_id === id);
    ref.hidden = !tpl;
    if (!tpl) return;
    const rctx = ref.getContext('2d');
    rctx.clearRect(0, 0, ref.width, ref.height);
    const frame = tpl.frames[Math.floor(tpl.frames.length / 2)] || tpl.frames[0];
    const aspect = frame.aspect || 4 / 3;
    const all = frame.hands.flatMap((h) => h.landmarks.map((p) => [p[0] * aspect, p[1]]));
    const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const range = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1;
    for (const h of frame.hands) {
      const pts = h.landmarks.map((p) => ({ x: 0.5 + ((p[0] * aspect - cx) / range) * 0.8, y: 0.5 + ((p[1] - cy) / range) * 0.8 }));
      HO.drawSkeleton(rctx, pts, ref.width, ref.height, { tipRadius: 5, dotRadius: 3, lineWidth: 3, lineColor: '#a78bfa', tipColor: '#fbbf24', dotColor: '#f1f5f9' });
    }
    ref.title = 'Referencia grabada' + (tpl.author ? ' por ' + tpl.author : '');
  }

  function onHands(hands) {
    const act = A.act;
    if (!act || act.phase !== 'practice') return;
    const st = act.verifier.update(hands, performance.now());
    const pct = Math.round(st.score * 100);
    const meter = $('au-meter-fill');
    meter.style.width = pct + '%';
    meter.className = 'au-meter-fill' + (st.holding || st.done ? ' ok' : pct >= 40 ? ' mid' : '');
    $('au-ring-fill').style.strokeDashoffset = String(RING_CIRC * (1 - st.progress));
    document.querySelector('.au-cam').classList.toggle('ok', st.holding || st.done);
    const fb = $('au-feedback');
    const msgs = !hands.length ? ['Muestra tu mano a la cámara'] : st.holding ? ['¡Así! Mantén la seña…'] : st.feedback;
    if (fb.dataset.msgs !== msgs.join('|')) {
      fb.dataset.msgs = msgs.join('|');
      fb.innerHTML = '';
      for (const m of msgs) { const li = document.createElement('li'); li.textContent = m; fb.appendChild(li); }
    }
    if (st.done) completeItem(true);
  }

  /** Per-frame timers (timeouts, skip unlock, delayed hints). */
  function tickActivity() {
    const act = A.act;
    if (!act || act.phase !== 'practice') return;
    const el = performance.now() - act.itemStart;
    if (act.cfg.skipAfterMs && el >= act.cfg.skipAfterMs) $('au-btn-skip').disabled = false;
    if (act.cfg.hintAfterMs > 0 && el >= act.cfg.hintAfterMs && !$('au-hint').textContent) {
      const s = sign(act.items[act.idx]);
      if (s.hint) $('au-hint').textContent = '👉 ' + s.hint;
    }
    if (act.cfg.timeoutMs) {
      $('au-timer-fill').style.width = Math.max(0, 100 - (el / act.cfg.timeoutMs) * 100) + '%';
      if (el >= act.cfg.timeoutMs) completeItem(false);
    }
  }

  function completeItem(correct) {
    const act = A.act;
    if (!act || act.phase !== 'practice') return;
    act.phase = 'feedback';
    const id = act.items[act.idx];
    const ms = Math.round(performance.now() - act.itemStart);
    const conf = Math.min(1, Math.max(0, act.verifier.bestScore));
    act.results[act.idx] = { sign_id: id, correct: correct };
    sendAttempts([{ sign_id: id, correct: correct, confidence: Math.round(conf * 1000) / 1000, response_ms: ms }]);
    play(correct ? 'ding' : 'buzz');
    const ov = $('au-overlay');
    ov.hidden = false;
    ov.className = 'au-overlay ' + (correct ? 'ok' : 'bad');
    ov.textContent = correct ? '✔ ¡Bien!' : '✘ ' + sign(id).gloss;
    renderDots();
    setTimeout(() => { if (A.act === act) { ov.hidden = true; nextItem(); } }, FEEDBACK_MS);
  }

  function sendAttempts(batch) {
    const act = A.act;
    return api('/api/sessions/' + act.sessionId + '/attempts', { method: 'POST', body: JSON.stringify({ attempts: batch }) })
      .catch(() => { act.pending.push(...batch); });
  }

  async function closeSession(act) {
    if (act.pending.length) {
      const batch = act.pending.splice(0);
      try {
        await api('/api/sessions/' + act.sessionId + '/attempts', { method: 'POST', body: JSON.stringify({ attempts: batch }) });
      } catch (_) { /* best effort */ }
    }
    const done = act.results.filter(Boolean);
    const score = done.filter((r) => r.correct).length;
    try {
      await api('/api/sessions/' + act.sessionId + '/finish', {
        method: 'POST',
        body: JSON.stringify({
          score: score,
          max_score: act.items.length,
          details: { mode: act.mode, unit: act.unit ? act.unit.unit.id : null, word: act.word, items: done, completed: done.length === act.items.length },
        }),
      });
    } catch (err) {
      toast('No se pudo guardar el resultado: ' + err.message, true);
    }
    return score;
  }

  async function finishActivity() {
    const act = A.act;
    act.phase = 'done';
    stopCamera();
    const score = await closeSession(act);
    const ratio = score / act.items.length;
    const g = C.grade(ratio);
    const gradeEl = $('au-res-grade');
    gradeEl.textContent = act.mode === 'quiz' ? g.letter : Math.round(ratio * 100) + '%';
    gradeEl.className = 'au-grade' + (g.passed ? ' pass' : '') + (act.mode === 'quiz' ? '' : ' pct');
    let title = g.label;
    let sub = score + ' de ' + act.items.length + ' correctas.';
    if (act.mode === 'quiz') {
      const wasPassed = A.passed.has(act.unit.unit.id);
      if (g.passed && !wasPassed) {
        sub += ' ¡Unidad aprobada! La siguiente unidad ya está disponible.';
        play('fanfare');
      } else if (!g.passed) {
        sub += ' Necesitas ' + Math.round(C.PASS_RATIO * 100) + '% para aprobar. Repasa la lección y vuelve a intentarlo.';
      }
    } else if (act.mode === 'spell') {
      title = ratio === 1 ? '¡Deletreaste «' + act.word + '»!' : 'Palabra: ' + act.word;
    } else if (act.mode === 'lesson') {
      title = ratio === 1 ? '¡Lección completada!' : 'Lección terminada';
      sub += ' Cuando te sientas listo/a, haz la evaluación.';
    }
    $('au-res-title').textContent = title;
    $('au-res-sub').textContent = sub;
    const list = $('au-res-items');
    list.innerHTML = '';
    act.items.forEach((id, i) => {
      const li = document.createElement('li');
      const r = act.results[i];
      li.className = r && r.correct ? 'ok' : 'bad';
      li.textContent = (r && r.correct ? '✔ ' : '✘ ') + sign(id).gloss;
      list.appendChild(li);
    });
    $('au-res-lms').hidden = true;
    show('screen-results');
    if (A.lti && act.mode === 'quiz') syncGrade(act.sessionId);
  }

  async function exitActivity() {
    const act = A.act;
    if (act && act.phase !== 'done') {
      act.phase = 'done';
      A.act = null;
      stopCamera();
      if (act.results.length) await closeSession(act);
      else {
        try { await api('/api/sessions/' + act.sessionId + '/finish', { method: 'POST', body: JSON.stringify({ score: 0, max_score: act.items.length, details: { mode: act.mode, abandoned: true } }) }); } catch (_) { /* */ }
      }
    }
    await goPath();
  }

  // ── Camera ─────────────────────────────────────────────────────────────────

  function setCamStatus(status) {
    const el = $('au-cam-status');
    const dev = A.source && A.source.device && A.source.device();
    const eng = A.source && A.source.engine ? A.source.engine() : 'server';
    el.textContent = status === 'connected'
      ? (eng === 'browser' ? '🟢 Detección en tu equipo' + (dev ? ' (' + dev + ')' : '') : '🟢 Detección en servidor')
      : status === 'connecting' ? '🟡 Cargando detector de manos…' : '⚫ Detector desconectado';
  }

  async function startCamera() {
    if (A.stream) return;
    setCamStatus('connecting');
    try {
      A.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
      video.srcObject = A.stream;
      await video.play();
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      A.source = HO.createHandSource({
        onResult: (data) => {
          A.lastHands = (data.hands || []).filter((h) => typeof h.confidence !== 'number' || h.confidence >= MIN_CONFIDENCE);
          onHands(A.lastHands);
        },
        onStatus: setCamStatus,
      });
      A.source.connect();
      loop();
    } catch (err) {
      $('au-cam-status').textContent = '⚠️ Cámara no disponible: ' + err.message;
      toast('Necesitas permitir la cámara para practicar', true);
    }
  }

  function loop() {
    A.anim = requestAnimationFrame(loop);
    tickActivity();
    if (!A.stream || video.readyState < 2) return;
    HO.drawMirroredVideo(ctx, video, canvas.width, canvas.height);
    A.source.sendFrame(canvas, 0.6);
    for (const h of A.lastHands) HO.drawSkeleton(ctx, h.landmarks, canvas.width, canvas.height);
  }

  function stopCamera() {
    if (A.anim) cancelAnimationFrame(A.anim);
    A.anim = null;
    if (A.source) A.source.close();
    A.source = null;
    if (A.stream) A.stream.getTracks().forEach((t) => t.stop());
    A.stream = null;
    A.lastHands = [];
  }

  // ── Wiring ─────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', () => {
    video = $('au-video');
    canvas = $('au-canvas');
    ctx = canvas.getContext('2d');

    $('au-profile-form').addEventListener('submit', createProfile);
    $('au-learner').addEventListener('click', () => {
      if (A.lti) return; // identity comes from the LMS
      stopCamera(); A.act = null; renderProfiles(); show('screen-profile');
    });
    $('au-btn-review').addEventListener('click', () => startActivity('review'));
    $('au-btn-spell').addEventListener('click', () => startActivity('spell'));
    $('au-btn-exit').addEventListener('click', exitActivity);
    $('au-btn-skip').addEventListener('click', () => completeItem(false));
    $('au-btn-path').addEventListener('click', () => goPath());
    $('au-btn-again').addEventListener('click', () => { if (A.act) A.act.replay(); });

    const mute = $('au-btn-mute');
    const applyMute = (m) => { if (audio) { if (m) audio.mute(); else audio.unmute(); } mute.textContent = m ? '🔇' : '🔊'; };
    applyMute(lsGet(LS_MUTED, false));
    mute.addEventListener('click', () => { const m = !lsGet(LS_MUTED, false); lsSet(LS_MUTED, m); applyMute(m); });

    window.addEventListener('pagehide', stopCamera);
    boot().catch((err) => toast('No se pudo cargar el Aula: ' + err.message, true));
  });
})();
