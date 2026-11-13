/* Diagnóstico de equipos (/diagnostico): in ~30 s checks that a computer can
 * run the Aula — secure context, browser, storage, server, camera, hand engine
 * and speed — says how to fix each problem, and reports the technical result
 * (no learner identity, no images) so the teacher panel can summarise the lab.
 * The decision logic is DOM-free and exported for node tests. */
(function (root) {
  'use strict';

  // ── Thresholds ──────────────────────────────────────────────────────────
  const FPS_GOOD = 15;          // the Aula feels fluid from here
  const FPS_MIN = 8;            // below this, recognition lags too much to practise
  const SLOW_LOAD_MS = 15000;   // first download of the engine (~20 MB)
  const LOW_RES_H = 360;
  const MIN_VERSION = { Chrome: 100, Edge: 100, Firefox: 115, Safari: 16.4, Opera: 86 };

  /** What to tell the person for each issue code. level: fail | warn. */
  const ISSUES = {
    insecure_context: ['fail', 'La página no se abrió con https://',
      'Abre la dirección de la plataforma que empieza por https://. Sin conexión segura el navegador no permite la cámara.'],
    in_iframe: ['warn', 'La página está dentro de otra página',
      'Si la cámara falla, ábrela en una pestaña nueva. En Moodle, la actividad debe abrirse en una ventana nueva.'],
    browser_old: ['warn', 'El navegador está desactualizado',
      'Actualiza Chrome, Edge o Firefox a la última versión.'],
    browser_unknown: ['warn', 'Navegador no probado',
      'Usa Chrome, Edge o Firefox actualizado.'],
    no_wasm: ['fail', 'El navegador no puede ejecutar el motor de manos (WebAssembly)',
      'Usa Chrome, Edge o Firefox actualizado. Algunas políticas de TI bloquean WebAssembly: pide que lo permitan para este sitio.'],
    no_webgl: ['warn', 'Sin aceleración gráfica (WebGL)',
      'Funcionará con el procesador, más lento. Activa la «aceleración por hardware» en la configuración del navegador o actualiza el controlador de video.'],
    storage_blocked: ['warn', 'El navegador no guarda datos de este sitio',
      'No se recordará el perfil del estudiante. Sal del modo incógnito o permite las cookies y los datos de este sitio.'],
    server_unreachable: ['fail', 'No se llega al servidor de HandsOnEdu',
      'Revisa la conexión a internet o el proxy de la red. Si persiste, avisa a TI.'],
    camera_denied: ['fail', 'El permiso de la cámara está bloqueado',
      'Pulsa el icono de la cámara o del candado junto a la dirección, elige «Permitir» y repite el diagnóstico. En equipos administrados, TI puede tener la cámara bloqueada por política.'],
    camera_missing: ['fail', 'No se encontró ninguna cámara',
      'Conecta una cámara web o revisa que esté habilitada en el sistema (en portátiles, a veces hay una tecla o tapa que la desactiva).'],
    camera_busy: ['fail', 'La cámara está en uso por otro programa',
      'Cierra Zoom, Teams, Meet u otras pestañas que usen la cámara y repite el diagnóstico.'],
    camera_error: ['fail', 'La cámara no pudo iniciarse',
      'Desconecta y vuelve a conectar la cámara, o reinicia el navegador. Si persiste, prueba otra cámara.'],
    camera_low_res: ['warn', 'La imagen de la cámara es muy pequeña',
      'Las señas se reconocen peor. Usa una cámara de al menos 640×480.'],
    engine_failed: ['fail', 'El motor de reconocimiento no cargó',
      'Recarga la página. Si persiste, el proxy o el firewall pueden estar bloqueando /vendor/ o /models/: avisa a TI (check-install.py lo detecta).'],
    engine_server: ['warn', 'El reconocimiento funciona en el servidor, no en este equipo',
      'Funciona, pero depende de la red y carga el servidor. Actualiza el navegador para usar el motor local.'],
    slow_load: ['warn', 'La primera carga del motor fue lenta',
      'Se descarga una vez (unos 20 MB) y queda guardado. Si todo el laboratorio carga a la vez, que cada equipo abra el diagnóstico antes de la clase.'],
    slow: ['warn', 'El equipo es algo lento',
      'Servirá, pero el reconocimiento tardará un poco. Cierra otros programas y pestañas.'],
    too_slow: ['fail', 'El equipo es demasiado lento para practicar',
      'Cierra otros programas y pestañas y repite. Si sigue igual, usa otro equipo o activa la aceleración por hardware del navegador.'],
    no_hand: ['warn', 'No se vio ninguna mano durante la prueba',
      'Repite mostrando una mano abierta a la cámara, con buena luz de frente y sin contraluz.'],
  };

  /** Browser and OS from the user agent (good enough for a lab report). */
  function parseUA(ua) {
    ua = String(ua || '');
    let name = null, version = null, m;
    if ((m = /Edg(?:e|A|iOS)?\/(\d+)/.exec(ua))) { name = 'Edge'; version = +m[1]; }
    else if ((m = /OPR\/(\d+)/.exec(ua))) { name = 'Opera'; version = +m[1]; }
    else if ((m = /Firefox\/(\d+)/.exec(ua))) { name = 'Firefox'; version = +m[1]; }
    else if ((m = /(?:Chrome|CriOS)\/(\d+)/.exec(ua))) { name = 'Chrome'; version = +m[1]; }
    else if ((m = /Version\/(\d+(?:\.\d+)?).*Safari\//.exec(ua))) { name = 'Safari'; version = parseFloat(m[1]); }
    let os = null;
    if (/Windows NT/.test(ua)) os = 'Windows';
    else if (/CrOS/.test(ua)) os = 'ChromeOS';
    else if (/Android/.test(ua)) os = 'Android';
    else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
    else if (/Mac OS X/.test(ua)) os = 'macOS';
    else if (/Linux/.test(ua)) os = 'Linux';
    return { name, version, os, label: name ? name + ' ' + version : 'Desconocido' };
  }

  function browserIssue(b) {
    if (!b.name) return 'browser_unknown';
    return b.version < MIN_VERSION[b.name] ? 'browser_old' : null;
  }

  /** getUserMedia error → camera status. */
  function cameraStatus(err) {
    const n = err && err.name;
    if (n === 'NotAllowedError' || n === 'SecurityError' || n === 'PermissionDeniedError') return 'denied';
    if (n === 'NotFoundError' || n === 'OverconstrainedError' || n === 'DevicesNotFoundError') return 'missing';
    if (n === 'NotReadableError' || n === 'TrackStartError' || n === 'AbortError') return 'busy';
    return 'error';
  }

  /** Issue codes and overall verdict from the measured facts. */
  function evaluate(r) {
    const issues = [];
    const add = (code, cond) => { if (code && cond && !issues.includes(code)) issues.push(code); };
    add('insecure_context', r.secure === false);
    add('in_iframe', r.inIframe);
    add(browserIssue(r.browser || {}), true);
    add('no_wasm', r.wasm === false);
    add('no_webgl', r.webgl === false);
    add('storage_blocked', r.storage === false);
    add('server_unreachable', r.server === false);
    if (r.camera && r.camera !== 'ok') add(r.camera === 'insecure' ? 'insecure_context' : 'camera_' + r.camera, true);
    add('camera_low_res', r.camera === 'ok' && r.videoHeight > 0 && r.videoHeight < LOW_RES_H);
    if (r.camera === 'ok') {
      add('engine_failed', r.engine === 'none');
      add('engine_server', r.engine === 'server');
      add('slow_load', r.engine !== 'none' && r.loadMs > SLOW_LOAD_MS);
      if (r.engine !== 'none' && r.fps != null) {
        add('too_slow', r.fps < FPS_MIN);
        add('slow', r.fps >= FPS_MIN && r.fps < FPS_GOOD);
      }
      add('no_hand', r.engine !== 'none' && r.handSeen === false);
    }
    const level = (c) => ISSUES[c][0];
    const verdict = issues.some((c) => level(c) === 'fail') ? 'fail'
      : issues.some((c) => level(c) === 'warn') ? 'warn' : 'ok';
    issues.sort((a, b) => (level(a) === level(b) ? 0 : level(a) === 'fail' ? -1 : 1));
    return { verdict, issues };
  }

  /** One line the teacher can copy into a spreadsheet or a chat. */
  function summaryLine(r, ev, labels) {
    const where = [labels && labels.room, labels && labels.station].filter(Boolean).join(' / ');
    const mark = { ok: '✔ Listo', warn: '⚠ Con avisos', fail: '✗ No apto' }[ev.verdict];
    return [where || 'Equipo', mark, (r.browser || {}).label, r.camera === 'ok' ? 'cámara ' + (r.videoWidth || '?') + '×' + (r.videoHeight || '?') : 'cámara: ' + r.camera,
      r.engine && r.engine !== 'none' ? 'motor ' + (r.engine === 'browser' ? (r.device || 'local') : 'servidor') : null,
      r.fps != null ? Math.round(r.fps) + ' cuadros/s' : null,
      ev.issues.length ? 'avisos: ' + ev.issues.join(', ') : null].filter(Boolean).join(' · ');
  }

  /** Body for POST /api/diagnostics. */
  function report(r, ev, labels) {
    return {
      room: (labels && labels.room) || null,
      station: (labels && labels.station) || null,
      verdict: ev.verdict,
      browser: (r.browser || {}).label ? String(r.browser.label).slice(0, 60) : null,
      os: (r.browser || {}).os || null,
      camera: r.camera || 'error',
      camera_res: r.videoWidth ? r.videoWidth + 'x' + r.videoHeight : null,
      engine: r.engine || null,
      device: r.device || null,
      load_ms: r.loadMs != null ? Math.round(r.loadMs) : null,
      fps: r.fps != null ? Math.round(r.fps * 10) / 10 : null,
      hand_seen: r.handSeen == null ? null : !!r.handSeen,
      issues: ev.issues,
    };
  }

  const api = { ISSUES, FPS_GOOD, FPS_MIN, parseUA, browserIssue, cameraStatus, evaluate, summaryLine, report };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  root.HO = root.HO || {};
  root.HO.Diag = api;                     // the teacher panel reuses ISSUES
  if (!document.getElementById('dg-steps')) return;

  // ── Page ────────────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const LS_ROOM = 'ho.diag.room';
  const LS_STATION = 'ho.diag.station';
  const MEASURE_MS = 6000;
  const WARMUP_MS = 1500;
  const ENGINE_TIMEOUT_MS = 90000;
  const D = { stream: null, source: null, anim: null, running: false };

  function lsGet(k) { try { return root.localStorage.getItem(k); } catch (_) { return null; } }
  function lsSet(k, v) { try { root.localStorage.setItem(k, v); } catch (_) { /* */ } }

  const STEPS = [
    ['env', 'Navegador y conexión segura'],
    ['server', 'Conexión con el servidor'],
    ['camera', 'Cámara'],
    ['engine', 'Motor de reconocimiento de manos'],
    ['speed', 'Velocidad (muestra una mano a la cámara)'],
  ];

  function renderSteps() {
    $('dg-steps').replaceChildren(...STEPS.map(([id, label]) => {
      const li = document.createElement('li');
      li.id = 'dg-step-' + id;
      li.className = 'dg-step';
      li.innerHTML = '<span class="dg-step-icon" aria-hidden="true">○</span><span class="dg-step-label"></span><span class="dg-step-detail"></span>';
      li.querySelector('.dg-step-label').textContent = label;
      return li;
    }));
  }

  function step(id, state, detail) {
    const li = $('dg-step-' + id);
    li.dataset.state = state;
    li.querySelector('.dg-step-icon').textContent = { run: '…', ok: '✔', warn: '⚠', fail: '✗', skip: '–' }[state];
    li.querySelector('.dg-step-detail').textContent = detail || '';
  }

  function webglAvailable() {
    try { return !!document.createElement('canvas').getContext('webgl2'); } catch (_) { return false; }
  }

  function storageWorks() {
    try {
      root.localStorage.setItem('ho.diag.probe', '1');
      const ok = root.localStorage.getItem('ho.diag.probe') === '1';
      root.localStorage.removeItem('ho.diag.probe');
      return ok;
    } catch (_) { return false; }
  }

  function stop() {
    if (D.anim) cancelAnimationFrame(D.anim);
    D.anim = null;
    if (D.source) { try { D.source.close(); } catch (_) { /* */ } }
    D.source = null;
    if (D.stream) D.stream.getTracks().forEach((t) => t.stop());
    D.stream = null;
    $('dg-video-wrap').hidden = true;
  }

  function waitEngine(source) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), ENGINE_TIMEOUT_MS);
      source.__resolve = (ok) => { clearTimeout(timer); resolve(ok); };
    });
  }

  function measure(source, video, canvas) {
    const ctx = canvas.getContext('2d');
    return new Promise((resolve) => {
      const start = performance.now();
      let frames = 0, hands = 0;
      D.onResult = (data) => {
        const t = performance.now() - start;
        if (t >= WARMUP_MS) {
          frames++;
          if ((data.hands || []).length) hands++;
        }
        D.lastHands = data.hands || [];
      };
      function loop() {
        D.anim = requestAnimationFrame(loop);
        const t = performance.now() - start;
        if (video.readyState >= 2) {
          HO.drawMirroredVideo(ctx, video, canvas.width, canvas.height);
          source.sendFrame(canvas, 0.6);
          for (const h of D.lastHands || []) HO.drawSkeleton(ctx, h.landmarks, canvas.width, canvas.height);
        }
        const left = Math.max(0, Math.ceil((WARMUP_MS + MEASURE_MS - t) / 1000));
        step('speed', 'run', left ? 'midiendo… ' + left + ' s' : 'midiendo…');
        if (t >= WARMUP_MS + MEASURE_MS) {
          cancelAnimationFrame(D.anim);
          D.anim = null;
          resolve({ fps: frames / (MEASURE_MS / 1000), handSeen: hands > 0 });
        }
      }
      loop();
    });
  }

  async function run() {
    if (D.running) return;
    D.running = true;
    $('dg-start').disabled = true;
    $('dg-result').hidden = true;
    renderSteps();
    const labels = { room: $('dg-room').value.trim(), station: $('dg-station').value.trim() };
    lsSet(LS_ROOM, labels.room);
    lsSet(LS_STATION, labels.station);

    const r = { browser: parseUA(navigator.userAgent), secure: root.isSecureContext !== false };
    try { r.inIframe = root.self !== root.top; } catch (_) { r.inIframe = true; }
    r.wasm = typeof WebAssembly === 'object';
    r.webgl = webglAvailable();
    r.storage = storageWorks();
    const envIssues = evaluate({ secure: r.secure, inIframe: r.inIframe, browser: r.browser, wasm: r.wasm, webgl: r.webgl, storage: r.storage });
    step('env', envIssues.verdict, r.browser.label + (r.browser.os ? ' · ' + r.browser.os : ''));

    step('server', 'run');
    try {
      const t0 = performance.now();
      const res = await fetch('/health', { cache: 'no-store' });
      const h = await res.json();
      r.server = res.ok;
      step('server', res.ok ? 'ok' : 'fail', 'HandsOnEdu ' + h.version + ' · ' + Math.round(performance.now() - t0) + ' ms');
    } catch (_) {
      r.server = false;
      step('server', 'fail', 'sin respuesta');
    }

    step('camera', 'run', 'si el navegador lo pide, pulsa «Permitir»');
    const video = $('dg-video');
    const canvas = $('dg-canvas');
    if (!r.secure || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      r.camera = r.secure ? 'error' : 'insecure';
    } else {
      try {
        D.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
        video.srcObject = D.stream;
        await video.play();
        r.camera = 'ok';
        r.videoWidth = video.videoWidth;
        r.videoHeight = video.videoHeight;
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        $('dg-video-wrap').hidden = false;
      } catch (err) {
        r.camera = cameraStatus(err);
      }
    }
    step('camera', r.camera === 'ok' ? 'ok' : 'fail',
      r.camera === 'ok' ? r.videoWidth + '×' + r.videoHeight : ISSUES[r.camera === 'insecure' ? 'insecure_context' : 'camera_' + r.camera][1]);

    if (r.camera === 'ok') {
      step('engine', 'run', 'cargando (la primera vez puede tardar)…');
      const t0 = performance.now();
      let ready = false;
      const source = HO.createHandSource({
        onResult: (data) => { if (D.onResult) D.onResult(data); },
        onStatus: (s) => {
          if (s === 'connected' && source.__resolve) source.__resolve(true);
          if (s === 'disconnected' && source.__resolve) source.__resolve(false);
        },
      });
      D.source = source;
      const wait = waitEngine(source);
      source.connect();
      ready = await wait;
      r.loadMs = performance.now() - t0;
      r.engine = !ready ? 'none' : (typeof source.engine === 'function' ? source.engine() : 'server');
      if (ready) {
        step('engine', r.engine === 'browser' ? 'ok' : 'warn',
          (r.engine === 'browser' ? 'en este equipo' : 'en el servidor') + ' · ' + (r.loadMs / 1000).toFixed(1) + ' s');
        const m = await measure(source, video, canvas);
        r.fps = m.fps;
        r.handSeen = m.handSeen;
        r.device = typeof source.device === 'function' ? source.device() : null;
        step('speed', r.fps >= FPS_GOOD ? 'ok' : r.fps >= FPS_MIN ? 'warn' : 'fail',
          Math.round(r.fps) + ' cuadros/s' + (r.device ? ' · ' + (r.device === 'GPU' ? 'tarjeta gráfica' : 'procesador') : '')
          + (r.handSeen ? ' · mano detectada' : ' · no se vio ninguna mano'));
      } else {
        step('engine', 'fail', 'no cargó');
        step('speed', 'skip');
      }
    } else {
      step('engine', 'skip');
      step('speed', 'skip');
    }
    stop();

    const ev = evaluate(r);
    showResult(r, ev, labels);
    D.running = false;
    $('dg-start').disabled = false;
    $('dg-start').textContent = 'Repetir diagnóstico';
  }

  async function showResult(r, ev, labels) {
    const box = $('dg-result');
    box.hidden = false;
    box.dataset.verdict = ev.verdict;
    $('dg-verdict').textContent = {
      ok: '✔ Este equipo está listo para el Aula de Señas',
      warn: '⚠ Funciona, con algunos avisos',
      fail: '✗ Este equipo todavía no puede usarse',
    }[ev.verdict];
    $('dg-issues').replaceChildren(...ev.issues.map((code) => {
      const [level, title, fix] = ISSUES[code];
      const li = document.createElement('li');
      li.className = 'dg-issue dg-issue-' + level;
      const b = document.createElement('strong');
      b.textContent = (level === 'fail' ? '✗ ' : '⚠ ') + title;
      const p = document.createElement('span');
      p.textContent = fix;
      li.append(b, p);
      return li;
    }));
    $('dg-summary').value = summaryLine(r, ev, labels);
    $('dg-sent').textContent = '';
    try {
      const res = await fetch('/api/diagnostics', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report(r, ev, labels)),
      });
      $('dg-sent').textContent = res.ok ? 'Resultado enviado al panel docente (sin imágenes ni datos del estudiante).' : '';
    } catch (_) { /* the summary can still be copied */ }
  }

  function init() {
    renderSteps();
    const q = new URLSearchParams(root.location.search);
    $('dg-room').value = q.get('sala') || lsGet(LS_ROOM) || '';
    $('dg-station').value = q.get('puesto') || lsGet(LS_STATION) || '';
    $('dg-start').addEventListener('click', run);
    $('dg-copy').addEventListener('click', async () => {
      const t = $('dg-summary');
      try { await navigator.clipboard.writeText(t.value); } catch (_) { t.select(); document.execCommand('copy'); }
      $('dg-copy').textContent = 'Copiado ✔';
      setTimeout(() => { $('dg-copy').textContent = 'Copiar'; }, 2000);
    });
    root.addEventListener('pagehide', stop);
  }

  init();
})(typeof window !== 'undefined' ? window : globalThis);
