/**
 * Estudio de Señas — teacher tool (REQ-017)
 *
 * Browse a sign-language catalog, test live recognition of any sign (with
 * didactic feedback), and record reference templates that teach the engine
 * signs it cannot recognize from descriptors alone (movement, two hands,
 * signs pending linguistic documentation). Templates can be exported/imported
 * as JSON so institutions can share datasets.
 */
(function () {
  'use strict';

  const MIN_CONFIDENCE = 0.6;
  const STATIC_SAMPLES = 12;
  const STATIC_SAMPLE_EVERY_MS = 110;
  const STATIC_TIMEOUT_MS = 5000;
  const COUNTDOWN_S = 3;
  const DYNAMIC_EVAL_EVERY_MS = 250;
  const LS_AUTHOR = 'ho.studio.author';
  const LS_TOKEN = 'ho.adminToken';

  // ── State ──────────────────────────────────────────────────────────────────
  const S = {
    lang: null,
    catalog: null,
    templates: [],
    recognizer: null,
    category: null,
    signId: null,
    search: '',
    stream: null,
    source: null,
    animFrame: null,
    lastHands: [],
    smoothScore: 0,
    lastDynamicEval: 0,
    recording: null,  // {kind, start, frames, lastSample, need, duration}
    busy: false,
    model: null,      // active trained model, as served (REQ-010)
    pending: null,    // {model, report} trained in this page, not yet published
    training: false,
  };

  const $ = (id) => document.getElementById(id);
  let video, canvas, ctx;

  // ── Utilities ──────────────────────────────────────────────────────────────

  function lsGet(key) { try { return localStorage.getItem(key) || ''; } catch (_) { return ''; } }
  function lsSet(key, v) { try { localStorage.setItem(key, v); } catch (_) { /* blocked */ } }

  let toastTimer = null;
  function toast(msg, isError) {
    const el = $('ss-toast');
    el.textContent = msg;
    el.className = 'ss-toast' + (isError ? ' error' : '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }

  async function api(path, opts, retried) {
    opts = opts || {};
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    const token = lsGet(LS_TOKEN);
    if (token) headers['X-Admin-Token'] = token;
    const res = await fetch(path, Object.assign({}, opts, { headers }));
    if (res.status === 401 && !retried) {
      const t = window.prompt('Esta acción requiere el token de docente (ADMIN_TOKEN):');
      if (t) { lsSet(LS_TOKEN, t.trim()); return api(path, opts, true); }
    }
    if (!res.ok) {
      let detail = res.statusText;
      try { const j = await res.json(); detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail); } catch (_) { /* not json */ }
      throw new Error(detail || ('HTTP ' + res.status));
    }
    return res.status === 204 ? null : res.json();
  }

  const r5 = (v) => Math.round(v * 1e5) / 1e5;
  const pts = (list) => (list || []).map((p) => [r5(p.x), r5(p.y), r5(p.z || 0)]);

  function serializeHand(h) {
    return {
      handedness: h.handedness || 'Unknown',
      landmarks: pts(h.landmarks),
      world: h.world_landmarks ? pts(h.world_landmarks) : null,
    };
  }

  function sign() { return S.catalog && S.catalog.signs.find((s) => s.id === S.signId); }
  function glossOf(id) { const s = S.catalog.signs.find((x) => x.id === id); return s ? s.gloss : id; }

  // ── Catalog loading & rendering ────────────────────────────────────────────

  async function loadLanguages() {
    const langs = await api('/api/languages');
    const sel = $('ss-language');
    sel.innerHTML = '';
    for (const l of langs) {
      const o = document.createElement('option');
      o.value = l.code;
      o.textContent = (l.short_name || l.code.toUpperCase()) + ' — ' + l.name;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => loadLanguage(sel.value));
    if (langs.length) await loadLanguage(langs[0].code);
  }

  async function loadLanguage(code) {
    const [catalog, templates] = await Promise.all([
      api('/api/signs/' + code + '/catalog'),
      api('/api/signs/' + code + '/templates'),
    ]);
    S.lang = code;
    S.catalog = catalog;
    S.templates = templates;
    S.recognizer = new HO.Signs.SignRecognizer({ catalog, templates });
    await loadModel();
    const banner = $('ss-validation');
    banner.hidden = !catalog.language.validation_note;
    banner.textContent = '⚠️ ' + (catalog.language.validation_note || '');
    const cats = (catalog.categories || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    S.category = cats.length ? cats[0].id : null;
    renderCategories(cats);
    renderList();
    const first = catalog.signs.find((s) => s.category === S.category);
    selectSign(first ? first.id : null);
  }

  function renderCategories(cats) {
    const box = $('ss-categories');
    box.innerHTML = '';
    for (const c of cats) {
      const b = document.createElement('button');
      b.className = 'ss-tab';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(c.id === S.category));
      b.textContent = (c.icon ? c.icon + ' ' : '') + c.name;
      b.addEventListener('click', () => {
        S.category = c.id;
        box.querySelectorAll('.ss-tab').forEach((t) => t.setAttribute('aria-selected', String(t === b)));
        renderList();
      });
      box.appendChild(b);
    }
  }

  function chip(text, cls, title) {
    const c = document.createElement('span');
    c.className = 'ss-chip ' + cls;
    c.textContent = text;
    if (title) c.title = title;
    return c;
  }

  function renderList() {
    const list = $('ss-sign-list');
    list.innerHTML = '';
    const q = S.search.trim().toLowerCase();
    const signs = S.catalog.signs.filter((s) => (q
      ? (s.gloss.toLowerCase().includes(q) || s.id.includes(q))
      : s.category === S.category));
    // Exact gloss matches first ("V" before "POR FAVOR").
    if (q) signs.sort((a, b) => (b.gloss.toLowerCase() === q) - (a.gloss.toLowerCase() === q));
    for (const s of signs) {
      const li = document.createElement('li');
      li.className = 'ss-sign-item';
      li.dataset.id = s.id;
      li.tabIndex = 0;
      li.setAttribute('aria-current', String(s.id === S.signId));
      const g = document.createElement('span');
      g.className = 'ss-gloss';
      g.textContent = s.gloss;
      li.appendChild(g);
      const chips = document.createElement('span');
      chips.className = 'ss-chips';
      if (s.kind === 'dynamic') chips.appendChild(chip('Mov.', 'ss-chip-dyn', 'Seña con movimiento'));
      if (s.handshape) chips.appendChild(chip('Descriptor', 'ss-chip-spec', 'Reconocible sin grabaciones'));
      const n = S.recognizer.templateCount(s.id);
      if (n) chips.appendChild(chip(String(n), 'ss-chip-tpl', n + ' plantilla(s)'));
      if (!S.recognizer.isRecognizable(s.id)) chips.appendChild(chip('—', 'ss-chip-none', 'Necesita una grabación'));
      li.appendChild(chips);
      const pick = () => selectSign(s.id);
      li.addEventListener('click', pick);
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter') pick(); });
      list.appendChild(li);
    }
    if (!signs.length) {
      const li = document.createElement('li');
      li.className = 'ss-empty';
      li.textContent = 'Sin resultados';
      list.appendChild(li);
    }
  }

  function selectSign(id) {
    S.signId = id;
    S.smoothScore = 0;
    if (S.recognizer) S.recognizer.clearHistory();
    document.querySelectorAll('.ss-sign-item').forEach((li) => {
      li.setAttribute('aria-current', String(li.dataset.id === id));
    });
    renderDetail();
    renderTemplates();
    updateRecordUI();
  }

  function renderDetail() {
    const s = sign();
    $('ss-sign-gloss').textContent = s ? s.gloss : '—';
    $('ss-sign-desc').textContent = s ? (s.description || '') : 'Elige una seña del catálogo.';
    $('ss-sign-hint').textContent = s && s.hint ? '👉 ' + s.hint : '';
    const cat = s && S.catalog.categories.find((c) => c.id === s.category);
    $('ss-sign-meta').textContent = s
      ? [cat ? cat.name : s.category, s.kind === 'dynamic' ? 'con movimiento' : 'estática', (s.hands || 1) + ' mano(s)'].join(' · ')
      : '';
    renderMedia(s);
    const flags = $('ss-sign-flags');
    flags.innerHTML = '';
    if (!s) return;
    if (!s.validated) flags.appendChild(chip('Sin validar', 'ss-chip-warn', 'Pendiente de validación por intérpretes / comunidad sorda'));
    if (s.handshape) flags.appendChild(chip('Descriptor', 'ss-chip-spec'));
    if (!S.recognizer.isRecognizable(s.id)) flags.appendChild(chip('Necesita grabación', 'ss-chip-none'));
    for (const c of s.confusable || []) flags.appendChild(chip('≈ ' + glossOf(c), 'ss-chip-none', 'Se confunde con'));
  }

  /** Reference video with its AI / interpreter-validation notice (teachers see pending ones too). */
  function renderMedia(s) {
    const box = $('ss-media-box');
    const video = $('ss-media');
    const info = s ? HO.Curriculum.mediaInfo(s, { teacher: true }) : null;
    box.hidden = !info;
    if (!info) {
      video.pause();
      video.removeAttribute('src');
      video.load();
      $('ss-media-note').textContent = '';
      return;
    }
    video.src = info.src;
    if (info.poster) video.poster = info.poster; else video.removeAttribute('poster');
    const note = $('ss-media-note');
    note.textContent = info.notice;
    note.classList.toggle('pending', !info.validated);
  }

  function renderTemplates() {
    const ul = $('ss-templates');
    ul.innerHTML = '';
    const mine = S.templates.filter((t) => t.sign_id === S.signId);
    $('ss-tpl-count').textContent = String(mine.length);
    if (!mine.length) {
      const li = document.createElement('li');
      li.className = 'ss-empty';
      li.textContent = 'Aún no hay grabaciones de esta seña.';
      ul.appendChild(li);
      return;
    }
    for (const t of mine) {
      const li = document.createElement('li');
      const meta = document.createElement('span');
      meta.className = 'ss-tpl-meta';
      const when = new Date(t.created_at).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' });
      meta.textContent = (t.kind === 'dynamic' ? '🎞 ' : '📸 ') + t.frames.length + ' cuadros · ' + (t.author || 'anónimo') + ' · ' + when;
      const del = document.createElement('button');
      del.className = 'ss-btn ss-btn-icon';
      del.title = 'Eliminar plantilla';
      del.textContent = '🗑';
      del.addEventListener('click', () => deleteTemplate(t));
      li.append(meta, del);
      ul.appendChild(li);
    }
  }

  function updateRecordUI() {
    const s = sign();
    const ready = !!(s && S.source && !S.recording);
    $('ss-btn-record').disabled = !ready;
    $('ss-duration-field').style.visibility = s && s.kind === 'dynamic' ? 'visible' : 'hidden';
    let help = '';
    if (!S.source) help = 'Activa la cámara para grabar y probar el reconocimiento.';
    else if (s && s.kind === 'dynamic') help = 'Tras la cuenta regresiva, realiza la seña completa una vez. Barra espaciadora: grabar.';
    else if (s) help = 'Tras la cuenta regresiva, mantén la seña quieta ~1,5 s (' + STATIC_SAMPLES + ' muestras). Barra espaciadora: grabar.';
    $('ss-rec-help').textContent = help;
  }

  // ── Templates CRUD ─────────────────────────────────────────────────────────

  async function saveTemplate(kind, frames) {
    const s = sign();
    const body = { sign_id: s.id, kind, frames, author: $('ss-author').value.trim() || null };
    const saved = await api('/api/signs/' + S.lang + '/templates', { method: 'POST', body: JSON.stringify(body) });
    S.templates.push(saved);
    S.recognizer.addTemplate(saved);
    renderTemplates();
    renderList();
    renderDetail();
    renderModelStatus();
    toast('✅ Plantilla guardada para «' + s.gloss + '»');
  }

  async function deleteTemplate(t) {
    if (!window.confirm('¿Eliminar esta plantilla de «' + glossOf(t.sign_id) + '»?')) return;
    try {
      await api('/api/signs/' + S.lang + '/templates/' + t.id, { method: 'DELETE' });
      S.templates = S.templates.filter((x) => x.id !== t.id);
      S.recognizer.setTemplates(S.templates);
      renderTemplates();
      renderList();
      renderDetail();
      renderModelStatus();
      toast('Plantilla eliminada');
    } catch (err) {
      toast('No se pudo eliminar: ' + err.message, true);
    }
  }

  function exportDataset() {
    const payload = {
      format: 'handsonedu.sign-templates/v1',
      language: S.lang,
      exported_at: new Date().toISOString(),
      templates: S.templates.map((t) => ({ sign_id: t.sign_id, kind: t.kind, frames: t.frames, author: t.author })),
    };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'plantillas-' + S.lang + '-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function importDataset(file) {
    try {
      const data = JSON.parse(await file.text());
      if (data.language && data.language !== S.lang) throw new Error('el archivo es de otra lengua (' + data.language + ')');
      const res = await api('/api/signs/' + S.lang + '/templates/import', {
        method: 'POST', body: JSON.stringify({ templates: data.templates || [] }),
      });
      toast('✅ ' + res.imported + ' plantillas importadas');
      const keep = S.signId;
      await loadLanguage(S.lang);
      selectSign(keep);
    } catch (err) {
      toast('Importación fallida: ' + err.message, true);
    }
  }

  // ── Trained model (REQ-010) ────────────────────────────────────────────────

  const pct = (v) => (v == null ? '—' : Math.round(v * 100) + ' %');

  async function loadModel() {
    S.model = null;
    try {
      const res = await fetch('/api/signs/' + S.lang + '/model');
      if (res.status === 200) S.model = await res.json();
    } catch (_) { /* offline: engine without model */ }
    S.recognizer.setModel(S.model ? HO.SignModel.load(S.model) : null);
    renderModelStatus();
  }

  /** Usable recordings for the model (static one-hand signs). */
  function usableTemplates() {
    const g = HO.SignModel.groupTemplates(S.templates, S.catalog, 1);
    return Object.values(g.bySign).flat();
  }

  function renderModelStatus() {
    if (!S.catalog) return;
    const chipEl = $('ss-model-chip');
    const status = $('ss-model-status');
    const off = $('ss-btn-model-off');
    const m = S.model;
    off.hidden = !m;
    if (!m) {
      chipEl.className = 'ss-chip ss-chip-none';
      chipEl.textContent = 'Sin modelo';
      const n = usableTemplates().length;
      status.textContent = 'El reconocimiento usa los descriptores y las plantillas. Con grabaciones de varias señas '
        + 'estáticas de una mano (al menos 2 por seña) puedes entrenar un modelo y ver si mejora. Grabaciones utilizables: ' + n + '.';
      return;
    }
    chipEl.className = 'ss-chip ss-chip-ok';
    chipEl.textContent = 'Activo';
    const trained = m.trained_on || {};
    const when = new Date(m.created_at).toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' });
    const usable = usableTemplates();
    const newer = trained.last_template_at ? usable.filter((t) => t.created_at > trained.last_template_at).length : 0;
    const fewer = Math.max(0, (trained.templates || 0) - usable.length);
    let text = 'Entrenado el ' + when + ' con ' + (trained.templates || '?') + ' grabaciones de ' + m.classes.length + ' señas.';
    if (newer || fewer) text += ' ⚠️ Desde entonces hay ' + (newer ? newer + ' grabaciones nuevas' : '') + (newer && fewer ? ' y ' : '')
      + (fewer ? fewer + ' eliminadas' : '') + ': vuelve a entrenar para incluirlas.';
    status.textContent = text;
  }

  function openModelDialog() {
    const dlg = $('ss-model-dialog');
    $('ss-md-report').replaceChildren();
    $('ss-md-publish').hidden = true;
    S.pending = null;
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    trainAndEvaluate();
  }

  function closeModelDialog() {
    const dlg = $('ss-model-dialog');
    if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open');
  }

  async function trainAndEvaluate() {
    if (S.training) return;
    S.training = true;
    $('ss-btn-train').disabled = true;
    const prog = $('ss-md-progress');
    prog.hidden = false;
    const bar = $('ss-md-bar');
    const step = $('ss-md-step');
    const setProgress = (frac, text) => { bar.style.width = Math.round(frac * 100) + '%'; step.textContent = text; };
    setProgress(0, 'Preparando las grabaciones…');
    try {
      const report = await HO.SignModel.crossValidate(S.templates, S.catalog, {}, (p) => {
        const frac = ((p.fold - 1) + p.epoch / p.epochs) / p.folds;
        setProgress(0.85 * frac, 'Evaluando: partición ' + p.fold + ' de ' + p.folds + '…');
      });
      const model = await HO.SignModel.trainModel(S.templates, S.catalog, { weight: report.best.weight }, (p) => {
        setProgress(0.85 + 0.15 * (p.epoch / p.epochs), 'Entrenando el modelo final…');
      });
      setProgress(1, 'Listo.');
      S.pending = { model, report };
      renderReport(report, model);
    } catch (err) {
      setProgress(0, '');
      $('ss-md-report').replaceChildren(el('p', 'ss-md-verdict no', '⚠️ ' + err.message + '.'));
    } finally {
      S.training = false;
      $('ss-btn-train').disabled = false;
      setTimeout(() => { prog.hidden = true; }, 600);
    }
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function tile(label, before, after, higherIsBetter) {
    const t = el('div', 'ss-md-tile');
    const diff = after - before;
    const good = higherIsBetter ? diff > 0 : diff < 0;
    const b = el('b', null, pct(after));
    const delta = el('small', Math.abs(diff) < 0.0005 ? '' : (good ? 'up' : 'down'),
      ' (sin modelo: ' + pct(before) + ')');
    t.append(el('span', null, label), b, delta);
    return t;
  }

  function renderReport(r, model) {
    const box = $('ss-md-report');
    const authors = new Set(usableTemplates().map((t) => t.author || '')).size;
    const verdict = r.recommended
      ? el('p', 'ss-md-verdict ok', '✔ El modelo mejora el reconocimiento con grabaciones que no vio al entrenar. Puedes publicarlo: el Aula y este Estudio lo usarán.')
      : el('p', 'ss-md-verdict no', 'El modelo no mejora el reconocimiento actual con estos datos, así que no se recomienda publicarlo. Graba más ejemplos (varias personas, distintas distancias e iluminación) y vuelve a entrenar.');
    const tiles = el('div', 'ss-md-tiles');
    tiles.append(
      tile('Seña correcta aceptada', r.baseline.accept, r.best.accept, true),
      tile('Seña equivocada aceptada', r.baseline.false_accept, r.best.false_accept, false),
      tile('Acierto (1.ª opción)', r.baseline.accuracy, r.best.accuracy, true),
    );
    const note = el('p', 'ss-md-note',
      'Evaluado con ' + r.frames + ' cuadros de ' + r.templates + ' grabaciones de ' + r.classes.length + ' señas, en ' + r.folds
      + ' particiones: cada grabación se prueba con un modelo que no la vio. Peso del modelo: ' + r.best.weight + '.'
      + (authors <= 1 ? ' Todas las grabaciones son de la misma persona: con estudiantes reales la cifra será menor.' : ''));

    const table = el('table', 'ss-md-table');
    table.append(el('caption', null, 'Por seña (peor primero)'));
    const head = el('tr');
    ['Seña', 'Grabaciones', 'Aceptada sin modelo', 'Con modelo'].forEach((h, i) => head.append(el('th', i ? 'num' : null, h)));
    table.append(head);
    r.per_sign.slice().sort((a, b) => (a.model.accept ?? 1) - (b.model.accept ?? 1)).forEach((p) => {
      const tr = el('tr');
      tr.append(el('td', null, glossOf(p.sign_id)), el('td', 'num', String(p.templates)),
        el('td', 'num', pct(p.baseline.accept)), el('td', 'num', pct(p.model.accept)));
      table.append(tr);
    });
    const wrap = el('div', 'ss-md-table-wrap');
    wrap.append(table);

    const parts = [verdict, tiles, note, wrap];
    if (r.confusions.length) {
      parts.push(el('p', 'ss-md-note', 'Confusiones más frecuentes: ' + r.confusions.slice(0, 5)
        .map((c) => glossOf(c.true) + ' → ' + glossOf(c.predicted) + ' (' + c.count + ')').join(' · ')));
    }
    if (r.too_few.length) {
      parts.push(el('p', 'ss-md-note', 'Con una sola grabación (no entran en el modelo): '
        + r.too_few.map(glossOf).join(', ') + '. Grábalas al menos dos veces.'));
    }
    box.replaceChildren(...parts);
    const pub = $('ss-md-publish');
    pub.hidden = !r.recommended;
    pub.disabled = false;
    pub.textContent = 'Publicar modelo (' + model.classes.length + ' señas)';
  }

  async function publishModel() {
    if (!S.pending) return;
    const { model, report } = S.pending;
    const pub = $('ss-md-publish');
    pub.disabled = true;
    try {
      await api('/api/signs/' + S.lang + '/models', {
        method: 'POST',
        body: JSON.stringify({ model, metrics: report, author: $('ss-author').value.trim() || null }),
      });
      S.pending = null;
      closeModelDialog();
      await loadModel();
      toast('✅ Modelo publicado: el Aula lo usará desde ahora');
    } catch (err) {
      pub.disabled = false;
      toast('No se pudo publicar: ' + err.message, true);
    }
  }

  async function deactivateModel() {
    if (!window.confirm('¿Desactivar el modelo? El reconocimiento volverá a usar solo descriptores y plantillas.')) return;
    try {
      await api('/api/signs/' + S.lang + '/model', { method: 'DELETE' });
      await loadModel();
      toast('Modelo desactivado');
    } catch (err) {
      toast('No se pudo desactivar: ' + err.message, true);
    }
  }

  // ── Recording ──────────────────────────────────────────────────────────────

  function startRecording() {
    const s = sign();
    if (!s || !S.source || S.recording || S.busy) return;
    S.busy = true;
    $('ss-btn-record').disabled = true;
    const cd = $('ss-countdown');
    let n = COUNTDOWN_S;
    cd.hidden = false;
    cd.textContent = String(n);
    const tick = setInterval(() => {
      n -= 1;
      if (n > 0) { cd.textContent = String(n); return; }
      clearInterval(tick);
      cd.hidden = true;
      $('ss-rec-indicator').hidden = false;
      S.recording = {
        kind: s.kind,
        need: s.hands || 1,
        start: performance.now(),
        lastSample: 0,
        frames: [],
        duration: s.kind === 'dynamic' ? Number($('ss-duration').value) : STATIC_TIMEOUT_MS,
      };
    }, 1000);
  }

  function captureFrame(hands) {
    const rec = S.recording;
    const now = performance.now();
    const t = Math.round(now - rec.start);
    const aspect = canvas.width / canvas.height;
    if (rec.kind === 'static') {
      if (hands.length >= rec.need && now - rec.lastSample >= STATIC_SAMPLE_EVERY_MS) {
        rec.lastSample = now;
        rec.frames.push({ t, aspect, hands: hands.slice(0, rec.need).map(serializeHand) });
      }
      if (rec.frames.length >= STATIC_SAMPLES || t >= rec.duration) finishRecording();
    } else {
      if (hands.length) rec.frames.push({ t, aspect, hands: hands.slice(0, 2).map(serializeHand) });
      if (t >= rec.duration) finishRecording();
    }
  }

  async function finishRecording() {
    const rec = S.recording;
    S.recording = null;
    $('ss-rec-indicator').hidden = true;
    const min = rec.kind === 'static' ? 3 : 5;
    try {
      if (rec.frames.length < min) {
        throw new Error(rec.need === 2 ? 'no se detectaron las dos manos' : 'no se detectó la mano');
      }
      await saveTemplate(rec.kind, rec.frames.slice(0, 150));
    } catch (err) {
      toast('Grabación descartada: ' + err.message, true);
    } finally {
      S.busy = false;
      updateRecordUI();
    }
  }

  // ── Live recognition panel ─────────────────────────────────────────────────

  function updateLive(hands) {
    const s = sign();
    if (!s || !S.recognizer) return;
    const now = performance.now();
    S.recognizer.pushFrame(hands, now);

    if (s.kind === 'dynamic' && now - S.lastDynamicEval < DYNAMIC_EVAL_EVERY_MS) return;
    if (s.kind === 'dynamic') S.lastDynamicEval = now;

    const verdict = $('ss-verdict');
    const fill = $('ss-meter-fill');
    const fb = $('ss-feedback');
    const candList = $('ss-candidates');

    if (!S.recognizer.isRecognizable(s.id)) {
      verdict.textContent = 'Graba una plantilla para reconocerla';
      verdict.className = 'ss-verdict';
      fill.style.width = '0%';
      $('ss-score').textContent = '—';
      fb.innerHTML = '';
      candList.innerHTML = '';
      return;
    }

    const res = (hands.length || s.kind === 'dynamic') ? S.recognizer.verify(hands, s.id) : null;
    const raw = res ? res.score : 0;
    S.smoothScore = 0.6 * S.smoothScore + 0.4 * raw;
    const pct = Math.round(S.smoothScore * 100);
    fill.style.width = pct + '%';
    fill.className = 'ss-meter-fill' + (res && res.ok ? ' ok' : pct >= 40 ? ' mid' : '');
    $('ss-score').textContent = pct + '%';
    verdict.className = 'ss-verdict' + (res && res.ok ? ' ok' : '');
    verdict.textContent = !hands.length && s.kind === 'static' ? 'Sin mano'
      : res && res.ok ? '✔ ¡Correcto!' : 'Intentando…';

    fb.innerHTML = '';
    for (const m of (res && res.feedback) || []) {
      const li = document.createElement('li');
      li.textContent = m;
      fb.appendChild(li);
    }

    const pool = S.catalog.signs
      .filter((x) => x.kind === s.kind && S.recognizer.isRecognizable(x.id))
      .map((x) => x.id);
    const ranked = s.kind === 'dynamic'
      ? S.recognizer.scoreDynamic({ candidates: pool })
      : S.recognizer.scoreStatic(hands, { candidates: pool });
    candList.innerHTML = '';
    for (const r of ranked.slice(0, 5)) {
      const li = document.createElement('li');
      li.textContent = glossOf(r.sign_id) + ' — ' + Math.round(r.score * 100) + '% ';
      const src = document.createElement('span');
      src.className = 'ss-src';
      src.textContent = '(' + r.source + (r.distance != null ? ', d=' + r.distance.toFixed(2) : '') + ')';
      li.appendChild(src);
      candList.appendChild(li);
    }
  }

  // ── Camera & engine ────────────────────────────────────────────────────────

  function setBadge(status) {
    const el = $('ss-connection');
    const engine = S.source && S.source.engine ? S.source.engine() : 'server';
    const map = {
      disconnected: ['⚫ Desconectado', 'ss-conn-disconnected'],
      connecting: ['🟡 Cargando motor…', 'ss-conn-connecting'],
      connected: [engine === 'browser'
        ? '🟢 Detección en el navegador' + (S.source.device && S.source.device() ? ' (' + S.source.device() + ')' : '')
        : '🟢 Detección en servidor', 'ss-conn-connected'],
    };
    const [text, cls] = map[status] || map.disconnected;
    el.className = 'ss-conn-badge ' + cls;
    el.textContent = text;
    updateRecordUI();
  }

  async function startCamera() {
    const btn = $('ss-btn-camera');
    btn.disabled = true;
    try {
      S.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
      video.srcObject = S.stream;
      await video.play();
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      btn.hidden = true;
      S.source = HO.createHandSource({
        onResult: (data) => {
          const hands = (data.hands || []).filter((h) => typeof h.confidence !== 'number' || h.confidence >= MIN_CONFIDENCE);
          S.lastHands = hands;
          if (S.recording) captureFrame(hands);
          updateLive(hands);
        },
        onStatus: setBadge,
      });
      S.source.connect();
      loop();
    } catch (err) {
      btn.disabled = false;
      toast('Cámara no disponible: ' + err.message, true);
    }
  }

  function loop() {
    S.animFrame = requestAnimationFrame(loop);
    if (!S.stream || video.readyState < 2) return;
    HO.drawMirroredVideo(ctx, video, canvas.width, canvas.height);
    S.source.sendFrame(canvas, 0.6);
    for (const h of S.lastHands) HO.drawSkeleton(ctx, h.landmarks, canvas.width, canvas.height);
  }

  function shutdown() {
    if (S.animFrame) cancelAnimationFrame(S.animFrame);
    S.animFrame = null;
    if (S.source) S.source.close();
    S.source = null;
    if (S.stream) S.stream.getTracks().forEach((t) => t.stop());
    S.stream = null;
  }

  // ── Boot ───────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', () => {
    video = $('ss-video');
    canvas = $('ss-canvas');
    ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0b1020';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const author = $('ss-author');
    author.value = lsGet(LS_AUTHOR);
    author.addEventListener('change', () => lsSet(LS_AUTHOR, author.value.trim()));

    $('ss-search').addEventListener('input', (e) => { S.search = e.target.value; renderList(); });
    $('ss-btn-camera').addEventListener('click', startCamera);
    $('ss-btn-record').addEventListener('click', startRecording);
    $('ss-btn-export').addEventListener('click', exportDataset);
    $('ss-btn-train').addEventListener('click', openModelDialog);
    $('ss-btn-model-off').addEventListener('click', deactivateModel);
    $('ss-md-publish').addEventListener('click', publishModel);
    $('ss-md-close').addEventListener('click', closeModelDialog);
    $('ss-md-cancel').addEventListener('click', closeModelDialog);
    $('ss-import').addEventListener('change', (e) => {
      if (e.target.files[0]) importDataset(e.target.files[0]);
      e.target.value = '';
    });
    document.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (e.code === 'Space' && !$('ss-model-dialog').open && !['input', 'select', 'textarea', 'button'].includes(tag)) {
        e.preventDefault();
        startRecording();
      }
    });
    window.addEventListener('pagehide', shutdown);

    loadLanguages().catch((err) => toast('No se pudo cargar el catálogo: ' + err.message, true));
    updateRecordUI();
  });
})();
