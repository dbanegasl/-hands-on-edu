/**
 * HandsOnEdu — in-browser hand engine (REQ-016)
 *
 * Runs MediaPipe Hand Landmarker (Tasks JS / WASM) directly in the browser so
 * webcam video never leaves the learner's device and the server no longer has
 * to process one video stream per student.
 *
 * - Pure gesture logic (`fingerStates`, `detectGesture`, `GestureSmoother`,
 *   `buildResponse`) is a line-by-line port of app/core/hand_tracker.py and
 *   app/api/ws.py; parity is enforced by tests/fixtures/gesture_parity.json,
 *   checked from both pytest and `node --test`.
 * - `LocalHandEngine` exposes the same interface as `HO.HandSocket`
 *   (connect / sendFrame / close / isOpen / isBusy, onResult / onStatus) and
 *   emits the same result JSON, so modules switch engines by changing a
 *   constructor call: `HO.createHandSource({...})`.
 * - If the engine cannot load (no WASM/WebGL, blocked download) it falls back
 *   transparently to the server WebSocket. `?engine=server` forces the server.
 *
 * Load after ho-common.js.
 */
(function (global) {
  'use strict';

  const MP_VERSION = '0.10.35';
  // Served under its version (cached for a year by the browser); a server with
  // another version answers 404 and the CDN copy of this version is used.
  const VENDOR_BASE = '/vendor/mediapipe@' + MP_VERSION + '/';
  const CDN_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + MP_VERSION + '/';
  const MODEL_LOCAL = '/models/hand_landmarker.task';
  const MODEL_CDN = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

  // Same thresholds as app/core/hand_tracker.py
  const MIN_DETECTION_CONFIDENCE = 0.7;
  const MIN_PRESENCE_CONFIDENCE = 0.6;
  const MIN_TRACKING_CONFIDENCE = 0.6;
  const FINGER_EXT_RATIO = 1.15;
  const THUMB_EXT_RATIO = 1.10;
  const PINCH_RATIO = 0.6;

  const WRIST = 0, THUMB_IP = 3, THUMB_TIP = 4;
  const INDEX_MCP = 5, INDEX_PIP = 6, INDEX_TIP = 8;
  const MIDDLE_PIP = 10, MIDDLE_TIP = 12;
  const RING_PIP = 14, RING_TIP = 16;
  const PINKY_MCP = 17, PINKY_PIP = 18, PINKY_TIP = 20;

  // ── Pure gesture logic (port of hand_tracker.py) ───────────────────────────

  function dist2d(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function fingerStates(lm) {
    const wrist = lm[WRIST];
    const ext = (tip, pip) => dist2d(lm[tip], wrist) > FINGER_EXT_RATIO * dist2d(lm[pip], wrist);
    const anchor = lm[PINKY_MCP];
    return {
      index: ext(INDEX_TIP, INDEX_PIP),
      middle: ext(MIDDLE_TIP, MIDDLE_PIP),
      ring: ext(RING_TIP, RING_PIP),
      pinky: ext(PINKY_TIP, PINKY_PIP),
      thumb: dist2d(lm[THUMB_TIP], anchor) > THUMB_EXT_RATIO * dist2d(lm[THUMB_IP], anchor),
    };
  }

  function isPinch(lm) {
    const palm = dist2d(lm[INDEX_MCP], lm[PINKY_MCP]);
    return dist2d(lm[THUMB_TIP], lm[INDEX_TIP]) < PINCH_RATIO * palm;
  }

  function detectGesture(lm) {
    const s = fingerStates(lm);
    const count = s.index + s.middle + s.ring + s.pinky;
    if (s.middle && s.ring && s.pinky && isPinch(lm)) return 'ok';
    if (s.index && s.pinky && !s.middle && !s.ring && s.thumb) return 'i_love_you';
    if (count === 0) return s.thumb ? 'thumbs_up' : 'fist';
    if (count === 1 && s.index && !s.thumb) return 'pointing';
    if (count === 1 && s.pinky && s.thumb) return 'shaka';
    if (count === 2 && s.index && s.middle && !s.ring && !s.pinky) return 'peace';
    if (count === 4) return s.thumb ? 'open_hand' : '4_fingers';
    return count + '_fingers';
  }

  /** Per-hand majority vote over a short window (port of GestureSmoother). */
  function GestureSmoother(windowSize, minVotes) {
    this._window = windowSize || 5;
    this._minVotes = minVotes || 3;
    this._gestures = {};
    this._counts = {};
    this._last = {};
  }
  GestureSmoother.prototype.smooth = function (key, gestureRaw, fingerCount) {
    const gq = this._gestures[key] || (this._gestures[key] = []);
    const cq = this._counts[key] || (this._counts[key] = []);
    gq.push(gestureRaw); if (gq.length > this._window) gq.shift();
    cq.push(fingerCount); if (cq.length > this._window) cq.shift();

    // Counter.most_common(1): highest count, ties → first inserted.
    const counts = new Map();
    for (const g of gq) counts.set(g, (counts.get(g) || 0) + 1);
    let top = null, votes = 0;
    for (const [g, n] of counts) { if (n > votes) { top = g; votes = n; } }
    if (votes >= this._minVotes) this._last[key] = top;
    const gesture = Object.prototype.hasOwnProperty.call(this._last, key) ? this._last[key] : top;

    const ordered = cq.slice().sort((a, b) => a - b);
    return [gesture, ordered[Math.floor(ordered.length / 2)]];
  };

  function toPoints(list) {
    return list.map((p) => ({ x: +p.x, y: +p.y, z: +p.z }));
  }

  /**
   * Serialize a MediaPipe JS HandLandmarkerResult into the shared hand-result
   * JSON (same shape as app/api/ws.py:build_response). `aspect` (frame
   * width / height) lets geometry consumers undo the normalized-axis stretch.
   */
  function buildResponse(result, smoother, aspect) {
    const all = result.landmarks || [];
    const world = result.worldLandmarks || [];
    const hd = result.handedness || result.handednesses || [];
    const hands = [];
    for (let i = 0; i < all.length; i++) {
      const lm = all[i];
      let handedness = 'Unknown';
      let confidence = 1.0;
      if (hd[i] && hd[i][0]) {
        handedness = hd[i][0].categoryName || hd[i][0].displayName || 'Unknown';
        const sc = Number(hd[i][0].score);
        confidence = Number.isFinite(sc) ? sc : 1.0;
      }
      const states = fingerStates(lm);
      let fingerCount = states.thumb + states.index + states.middle + states.ring + states.pinky;
      const gestureRaw = detectGesture(lm);
      const key = handedness !== 'Unknown' ? handedness : '_' + i;
      const smoothed = smoother.smooth(key, gestureRaw, fingerCount);
      const hand = {
        handedness: handedness,
        confidence: confidence,
        landmarks: toPoints(lm),
        fingers_up: states,
        finger_count: smoothed[1],
        gesture: smoothed[0],
        gesture_raw: gestureRaw,
      };
      if (aspect) hand.aspect = aspect;
      if (world[i]) hand.world_landmarks = toPoints(world[i]);
      hands.push(hand);
    }
    return { hands_detected: all.length, hands: hands, engine: 'browser' };
  }

  // ── MediaPipe loader (one shared landmarker per page) ──────────────────────
  //
  // Delegate choice matters a lot on school hardware: with a software WebGL
  // renderer (no GPU driver → SwiftShader/llvmpipe) the GPU delegate measured
  // 180 ms/frame vs 44 ms on CPU. So: software renderer → CPU first; otherwise
  // GPU first, and LocalHandEngine switches to CPU at runtime if GPU is slow.

  const SLOW_GPU_MS = 60;     // mean detect time above which GPU is abandoned
  const SLOW_GPU_SAMPLES = 15;

  let _landmarkerPromise = null;
  let _vision = null;         // {mod, fileset, model}

  async function _importVision() {
    try {
      return { mod: await import(VENDOR_BASE + 'vision_bundle.mjs'), base: VENDOR_BASE };
    } catch (_) {
      return { mod: await import(CDN_BASE + 'vision_bundle.mjs'), base: CDN_BASE };
    }
  }

  function softwareRenderer() {
    try {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
      return /swiftshader|llvmpipe|software|basic render/i.test(name);
    } catch (_) {
      return true;
    }
  }

  async function _create(delegate) {
    const lm = await _vision.mod.HandLandmarker.createFromOptions(_vision.fileset, {
      baseOptions: { modelAssetPath: _vision.model, delegate: delegate },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: MIN_DETECTION_CONFIDENCE,
      minHandPresenceConfidence: MIN_PRESENCE_CONFIDENCE,
      minTrackingConfidence: MIN_TRACKING_CONFIDENCE,
    });
    lm.__delegate = delegate;
    return lm;
  }

  async function _loadLandmarker() {
    const { mod, base } = await _importVision();
    const fileset = await mod.FilesetResolver.forVisionTasks(base + 'wasm');
    const delegates = softwareRenderer() ? ['CPU'] : ['GPU', 'CPU'];
    let lastErr = null;
    for (const model of [MODEL_LOCAL, MODEL_CDN]) {
      for (const delegate of delegates) {
        _vision = { mod: mod, fileset: fileset, model: model };
        try {
          return await _create(delegate);
        } catch (err) {
          lastErr = err;
        }
      }
    }
    throw lastErr || new Error('HandLandmarker unavailable');
  }

  function getLandmarker() {
    if (!_landmarkerPromise) {
      _landmarkerPromise = _loadLandmarker().catch((err) => {
        _landmarkerPromise = null; // allow a later retry
        throw err;
      });
    }
    return _landmarkerPromise;
  }

  /** Replace a slow GPU landmarker with a CPU one (shared by the whole page). */
  function _switchToCpu(slow) {
    const next = _create('CPU').then((lm) => {
      try { slow.close(); } catch (_) { /* already closed */ }
      return lm;
    });
    _landmarkerPromise = next.catch(() => slow); // keep GPU if CPU creation fails
    return _landmarkerPromise;
  }

  // ── LocalHandEngine ─────────────────────────────────────────────────────────

  let _lastTs = 0;

  function LocalHandEngine(options) {
    options = options || {};
    this._onResult = options.onResult || function () {};
    this._onStatus = options.onStatus || function () {};
    this._minInterval = 1000 / (options.targetFps || 30);
    this._landmarker = null;
    this._delegate = null; // server HandSocket when falling back
    this._closing = false;
    this._lastSend = 0;
    this._smoother = new GestureSmoother();
    this._warned = false;
    this._timings = [];
    this._switching = false;
  }

  LocalHandEngine.prototype.connect = function () {
    this._closing = false;
    this._onStatus('connecting');
    const self = this;
    getLandmarker().then(function (lm) {
      if (self._closing) return;
      self._landmarker = lm;
      self._onStatus('connected');
    }).catch(function (err) {
      if (self._closing) return;
      console.warn('[HO] Motor de manos en el navegador no disponible; usando servidor.', err);
      self._fallback();
    });
  };

  LocalHandEngine.prototype._fallback = function () {
    this._delegate = new global.HO.HandSocket({ onResult: this._onResult, onStatus: this._onStatus });
    this._delegate.connect();
  };

  LocalHandEngine.prototype.engine = function () {
    if (this._delegate) return 'server';
    return this._landmarker ? 'browser' : 'loading';
  };

  /** 'GPU' | 'CPU' | null — which MediaPipe delegate is running. */
  LocalHandEngine.prototype.device = function () {
    return this._landmarker ? this._landmarker.__delegate : null;
  };

  LocalHandEngine.prototype._track = function (ms) {
    if (this._switching || this.device() !== 'GPU') return;
    this._timings.push(ms);
    if (this._timings.length < SLOW_GPU_SAMPLES) return;
    const mean = this._timings.reduce((a, b) => a + b, 0) / this._timings.length;
    this._timings = [];
    if (mean <= SLOW_GPU_MS) { this._switching = true; return; } // GPU is fine; stop measuring
    this._switching = true;
    console.info('[HO] GPU lenta (' + mean.toFixed(0) + ' ms/cuadro); cambiando a CPU.');
    const self = this;
    _switchToCpu(this._landmarker).then(function (lm) {
      if (!self._closing) self._landmarker = lm;
    });
  };

  LocalHandEngine.prototype.isOpen = function () {
    if (this._delegate) return this._delegate.isOpen();
    return !!this._landmarker && !this._closing;
  };

  LocalHandEngine.prototype.isBusy = function () {
    return this._delegate ? this._delegate.isBusy() : false;
  };

  /** Detect on the (already mirrored) canvas; result is delivered async like the WS. */
  LocalHandEngine.prototype.sendFrame = function (canvas, quality) {
    if (this._delegate) return this._delegate.sendFrame(canvas, quality);
    if (!this._landmarker || this._closing) return false;
    const now = performance.now();
    if (now - this._lastSend < this._minInterval) return false;
    this._lastSend = now;
    // detectForVideo requires strictly increasing timestamps (shared landmarker).
    const ts = Math.max(now, _lastTs + 1);
    _lastTs = ts;
    let data;
    try {
      const aspect = canvas.height ? canvas.width / canvas.height : null;
      const t0 = performance.now();
      const result = this._landmarker.detectForVideo(canvas, ts);
      this._track(performance.now() - t0);
      data = buildResponse(result, this._smoother, aspect);
    } catch (err) {
      if (!this._warned) { console.warn('[HO] detectForVideo falló', err); this._warned = true; }
      return false;
    }
    const cb = this._onResult;
    const self = this;
    queueMicrotask(function () { if (!self._closing) cb(data); });
    return true;
  };

  LocalHandEngine.prototype.close = function () {
    this._closing = true;
    if (this._delegate) { this._delegate.close(); this._delegate = null; }
    // The shared landmarker is kept for the page lifetime (cheap re-entry).
    this._landmarker = null;
    this._smoother = new GestureSmoother();
  };

  function preferredEngine() {
    try {
      const q = new URLSearchParams(global.location.search).get('engine');
      if (q === 'server' || q === 'browser') return q;
      const stored = global.localStorage && global.localStorage.getItem('ho.engine');
      if (stored === 'server' || stored === 'browser') return stored;
    } catch (_) { /* storage blocked */ }
    return 'browser';
  }

  /** Factory used by every module: in-browser engine, server as fallback. */
  function createHandSource(options) {
    if (preferredEngine() === 'server' || typeof WebAssembly !== 'object') {
      return new global.HO.HandSocket(options);
    }
    return new LocalHandEngine(options);
  }

  const api = {
    fingerStates: fingerStates,
    detectGesture: detectGesture,
    GestureSmoother: GestureSmoother,
    buildResponse: buildResponse,
    LocalHandEngine: LocalHandEngine,
    createHandSource: createHandSource,
    getLandmarker: getLandmarker,
    MP_VERSION: MP_VERSION,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global.HO) Object.assign(global.HO, api);
  else global.HO = api;
})(typeof window !== 'undefined' ? window : globalThis);
