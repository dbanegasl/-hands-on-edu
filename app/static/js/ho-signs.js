/**
 * HandsOnEdu — sign recognition engine (REQ-017)
 *
 * Language-agnostic recognizer for sign-language catalogs
 * (app/content/<lang>/catalog.json). Three complementary scorers:
 *
 *  1. Handshape specs   — declarative descriptors in the catalog (finger states,
 *                         thumb position, contacts, spread, crossing, palm and
 *                         finger orientation). Work with zero training data and
 *                         produce *didactic feedback* ("Extiende el meñique").
 *  2. Static templates  — k-nearest-neighbour over normalized 3D landmarks
 *                         recorded by teachers in the Sign Studio.
 *  3. Dynamic templates — DTW over (handshape + wrist trajectory) sequences for
 *                         signs with movement (J, Z, Ñ, HOLA…).
 *
 * Geometry is computed on image landmarks made isotropic with the frame aspect
 * ratio (world landmarks are stored with templates for future ML use but their
 * depth is unreliable for flexion). Hands are canonicalized: translated to the wrist,
 * scaled by palm length and, for left hands, mirrored on x, so one template
 * serves both right- and left-handed signers. Orientation is NOT normalized:
 * in sign languages it is phonologically meaningful.
 *
 * Usable in the browser (window.HO.Signs) and in Node (module.exports) for tests.
 */
(function (global) {
  'use strict';

  // ── Tunables ───────────────────────────────────────────────────────────────
  const CFG = {
    acceptScore: 0.6,     // min score for a positive verification
    tieMargin: 0.05,      // target accepted if within this of the best candidate
    staticSigma: 0.32,    // kNN distance → similarity scale (palm-length units)
    dynamicSigma: 0.45,   // DTW distance → similarity scale
    resampleN: 20,        // frames per sequence for DTW
    dtwBand: 5,           // Sakoe-Chiba band
    bufferMs: 3000,       // live history kept for dynamic matching
    windowScales: [0.75, 1.0, 1.3],
    templateWeight: 0.7,  // blend when a sign has both templates and a spec
  };

  const WRIST = 0;
  const FINGERS = {
    thumb: [1, 2, 3, 4],
    index: [5, 6, 7, 8],
    middle: [9, 10, 11, 12],
    ring: [13, 14, 15, 16],
    pinky: [17, 18, 19, 20],
  };
  const POINT = {
    wrist: 0, thumb_tip: 4, thumb_ip: 3, thumb_mcp: 2,
    index_mcp: 5, index_pip: 6, index_tip: 8,
    middle_mcp: 9, middle_pip: 10, middle_tip: 12,
    ring_mcp: 13, ring_pip: 14, ring_tip: 16,
    pinky_mcp: 17, pinky_pip: 18, pinky_tip: 20,
  };
  const TIPS = [4, 8, 12, 16, 20];

  const NAME_ES = {
    thumb: 'pulgar', index: 'índice', middle: 'medio', ring: 'anular', pinky: 'meñique',
    thumb_tip: 'pulgar', index_tip: 'índice', middle_tip: 'medio', ring_tip: 'anular', pinky_tip: 'meñique',
  };

  // ── Vector helpers ─────────────────────────────────────────────────────────
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = (a) => Math.sqrt(dot(a, a));
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const unit = (a) => { const n = norm(a) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };
  const dist = (a, b) => norm(sub(a, b));
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  /** Linear ramp: 0 at `from`, 1 at `to` (works for ascending or descending). */
  function ramp(v, from, to) {
    return clamp01((v - from) / (to - from));
  }

  function angleDeg(a, b) {
    const c = dot(a, b) / ((norm(a) * norm(b)) || 1);
    return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
  }

  function toArr(p) {
    return Array.isArray(p) ? [+p[0], +p[1], +(p[2] || 0)] : [+p.x, +p.y, +(p.z || 0)];
  }

  // ── Canonical hand ─────────────────────────────────────────────────────────

  /**
   * Canonicalize a hand ({handedness, landmarks, aspect?}).
   * Image landmarks are made isotropic with the frame aspect ratio (x and z are
   * in image-width units, y in height units). World landmarks are stored but not
   * used for geometry: on real photos their depth inflates finger flexion by
   * 40-70° (see docs/sign-engine.md, "Validación con fotos reales").
   * Returns {pts: [[x,y,z]*21], scale, mirrored} or null.
   */
  function canonical(hand) {
    const raw = (hand.landmarks || []).map(toArr);
    if (raw.length !== 21) return null;
    const k = hand.aspect > 0 ? hand.aspect : 4 / 3;
    // MediaPipe Tasks labels hands as seen in a NON-mirrored image, so on our
    // mirrored canvas "Right" is the learner's real left hand. Either way, the
    // canonical frame is "a hand labelled Right"; "Left" hands are flipped.
    const mirrored = hand.handedness === 'Left';
    const w = raw[WRIST];
    const rel = raw.map((p) => [(mirrored ? -1 : 1) * (p[0] - w[0]) * k, p[1] - w[1], (p[2] - w[2]) * k]);
    const scale = norm(rel[POINT.middle_mcp]) || 1e-6;
    return {
      pts: rel.map((p) => [p[0] / scale, p[1] / scale, p[2] / scale]),
      scale: scale,
      mirrored: mirrored,
    };
  }

  // ── Geometric features ─────────────────────────────────────────────────────

  /** Bend angles (0° = straight) at the base, middle and distal joints of a digit. */
  function jointAngles(pts, name) {
    const [a, b, c, d] = FINGERS[name];
    const v0 = sub(pts[a], pts[WRIST]);
    const v1 = sub(pts[b], pts[a]);
    const v2 = sub(pts[c], pts[b]);
    const v3 = sub(pts[d], pts[c]);
    const j = [angleDeg(v0, v1), angleDeg(v1, v2), angleDeg(v2, v3)];
    return { base: j[0], mid: j[1], distal: j[2], total: j[0] + j[1] + j[2] };
  }

  function features(hand) {
    const can = canonical(hand);
    if (!can) return null;
    const p = can.pts;
    const palmWidth = dist(p[POINT.index_mcp], p[POINT.pinky_mcp]) || 1e-6;
    const a = p[POINT.index_mcp];
    const b = p[POINT.pinky_mcp];
    // Normal pointing out of the palm. Validated on real photos: a palm facing
    // the camera gives z < 0 (MediaPipe z decreases toward the camera).
    const palmNormal = unit(cross(a, b));
    const fingerDir = unit(p[POINT.middle_mcp]);
    const lateral = unit(sub(b, a));
    const joints = {};
    const curl = {};
    const reach = {};
    for (const f of Object.keys(FINGERS)) {
      joints[f] = jointAngles(p, f);
      curl[f] = joints[f].total;
      const [mcp, , , tip] = FINGERS[f];
      reach[f] = norm(p[tip]) / (norm(p[mcp]) || 1e-6);
    }
    // Thumb tip along the index→pinky axis, in palm widths: < 0 beyond the
    // index side (extended: L, Y), ≈ 0 beside the index (A), > 0 over the palm (B, S).
    const thumbLateral = dot(sub(p[POINT.thumb_tip], a), lateral) / palmWidth;
    return {
      pts: p, can: can, palmWidth: palmWidth, palmNormal: palmNormal, fingerDir: fingerDir,
      lateral: lateral, joints: joints, curl: curl, reach: reach, thumbLateral: thumbLateral,
    };
  }

  // ── Handshape spec scoring ─────────────────────────────────────────────────

  // Finger states combine two signals (thresholds calibrated on real photos,
  // see docs/sign-engine.md): total flexion along the chain, and "reach" — tip
  // to wrist distance over MCP to wrist distance (extended ≥ 1.66, fist ≤ 0.92,
  // folded-under-thumb ≈ 1.3). In frontal views the base-joint angle is
  // foreshortened, so neither signal alone is reliable.
  function fingerState(f, name, state) {
    const total = f.curl[name];
    const reach = f.reach[name];
    const extended = Math.min(ramp(total, 95, 60), ramp(reach, 1.3, 1.55));
    const flex = ramp(total, 70, 120);
    const low = ramp(reach, 1.5, 1.1);
    switch (state) {
      case 'extended': return extended;
      case 'curled': return Math.max(flex, low);
      case 'bent': return Math.min(flex, ramp(reach, 0.85, 1.05));
      case 'not_extended': return 1 - extended;
      default: return 1;
    }
  }

  // Thumb states from its tip position along the index→pinky axis
  // (real photos: thumbs-up −0.80, open hand −0.76, over folded fingers +0.85).
  function thumbScore(f, state) {
    const lat = f.thumbLateral;
    switch (state) {
      case 'extended': return ramp(lat, -0.35, -0.6);
      case 'side': return Math.min(ramp(lat, -0.75, -0.45), ramp(lat, 0.35, 0.1));
      case 'across': return ramp(lat, 0.1, 0.35);
      case 'folded': return ramp(lat, -0.6, -0.35);
      default: return 1;
    }
  }

  const DIR = {
    forward: [0, 0, -1], back: [0, 0, 1], up: [0, -1, 0], down: [0, 1, 0],
  };

  function orientationScore(vec, label) {
    if (!label || label === 'any') return 1;
    if (label === 'side') return ramp(Math.abs(vec[0]), 0.3, 0.65);
    const d = DIR[label];
    return d ? ramp(dot(vec, d), 0.2, 0.6) : 1;
  }

  function pairDist(f, pair) {
    return dist(f.pts[POINT[pair[0]]], f.pts[POINT[pair[1]]]) / f.palmWidth;
  }

  /**
   * Score a hand against a handshape spec.
   * Returns {score, checks: [{key, score, message}]} — checks sorted worst-first.
   */
  function scoreSpec(f, spec) {
    const checks = [];
    const add = (key, score, message) => checks.push({ key: key, score: clamp01(score), message: message });

    for (const name of ['index', 'middle', 'ring', 'pinky']) {
      const want = spec[name];
      if (!want || want === 'any') continue;
      const msg = want === 'extended' ? 'Extiende el dedo ' + NAME_ES[name]
        : want === 'bent' ? 'Curva el dedo ' + NAME_ES[name] + ' en gancho'
          : 'Dobla el dedo ' + NAME_ES[name];
      add(name, fingerState(f, name, want), msg);
    }
    if (spec.thumb && spec.thumb !== 'any') {
      const msg = {
        extended: 'Separa el pulgar de la mano',
        side: 'Coloca el pulgar al costado del índice',
        across: 'Cruza el pulgar sobre la palma',
        folded: 'Recoge el pulgar',
      }[spec.thumb] || 'Ajusta el pulgar';
      add('thumb', thumbScore(f, spec.thumb), msg);
    }
    for (const pair of spec.touch || []) {
      add('touch:' + pair.join('-'), ramp(pairDist(f, pair), 0.6, 0.32),
        'Junta las puntas del ' + NAME_ES[pair[0]] + ' y del ' + NAME_ES[pair[1]]);
    }
    for (const pair of spec.together || []) {
      add('together:' + pair.join('-'), ramp(pairDist(f, pair), 0.62, 0.38),
        'Junta los dedos ' + NAME_ES[pair[0]] + ' y ' + NAME_ES[pair[1]]);
    }
    for (const pair of spec.apart || []) {
      add('apart:' + pair.join('-'), ramp(pairDist(f, pair), 0.35, 0.6),
        'Separa los dedos ' + NAME_ES[pair[0]] + ' y ' + NAME_ES[pair[1]]);
    }
    if (spec.crossed) {
      const [f1, f2] = spec.crossed;
      const lat = (i) => dot(sub(f.pts[i], f.pts[POINT.index_mcp]), f.lateral);
      const d = (lat(FINGERS[f1][3]) - lat(FINGERS[f2][3])) / f.palmWidth;
      add('crossed', ramp(d, -0.15, 0.05), 'Cruza el ' + NAME_ES[f2] + ' sobre el ' + NAME_ES[f1]);
    }
    if (spec.palm && spec.palm !== 'any') {
      const msg = {
        forward: 'Muestra la palma hacia la cámara', back: 'Gira la palma hacia ti',
        side: 'Coloca la palma de lado', up: 'Gira la palma hacia arriba', down: 'Gira la palma hacia abajo',
      }[spec.palm];
      add('palm', orientationScore(f.palmNormal, spec.palm), msg);
    }
    if (spec.fingers && spec.fingers !== 'any') {
      const msg = {
        up: 'Apunta los dedos hacia arriba', down: 'Apunta los dedos hacia abajo',
        side: 'Apunta los dedos hacia el costado', forward: 'Apunta los dedos hacia la cámara',
      }[spec.fingers];
      add('fingers', orientationScore(f.fingerDir, spec.fingers), msg);
    }

    if (!checks.length) return { score: 0, checks: checks };
    // Geometric mean with a small floor: one clearly violated constraint sinks
    // the score, but noise on a single check does not zero it outright.
    let logSum = 0;
    for (const c of checks) logSum += Math.log(Math.max(c.score, 0.02));
    const score = Math.exp(logSum / checks.length);
    checks.sort((x, y) => x.score - y.score);
    return { score: score, checks: checks };
  }

  // ── Template vectors (kNN) ─────────────────────────────────────────────────

  /** Flattened canonical points (wrist omitted), fingertips weighted ×2. */
  function handVector(can) {
    const v = [];
    for (let i = 1; i < 21; i++) {
      const w = TIPS.includes(i) ? 2 : 1;
      v.push(can.pts[i][0] * w, can.pts[i][1] * w, can.pts[i][2] * w);
    }
    return v;
  }
  const HAND_VEC_NORM = Math.sqrt(15 + 5 * 4); // RMS normalizer for the weights above

  function vecDist(a, b) {
    if (!a || !b || a.length !== b.length) return Infinity;
    let s = 0;
    for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
    return Math.sqrt(s) / HAND_VEC_NORM;
  }

  function sortedHands(hands) {
    // Stable order for two-hand frames: left→right in the (mirrored) image.
    return hands.slice().sort((h1, h2) => toArr(h1.landmarks[0])[0] - toArr(h2.landmarks[0])[0]);
  }

  /** Isotropic image-space point (x and z rescaled by the frame aspect). */
  function imgPt(hand, i) {
    const p = toArr(hand.landmarks[i]);
    const k = hand.aspect > 0 ? hand.aspect : 4 / 3;
    return [p[0] * k, p[1], p[2] * k];
  }

  /** Feature vector for a frame (1 or 2 hands); returns {vec, hands} or null. */
  function frameVector(hands) {
    if (!hands || !hands.length) return null;
    if (hands.length === 1) {
      const can = canonical(hands[0]);
      return can ? { vec: handVector(can), hands: 1 } : null;
    }
    const [h1, h2] = sortedHands(hands).slice(0, 2);
    const c1 = canonical(h1);
    const c2 = canonical(h2);
    if (!c1 || !c2) return null;
    // Relative wrist offset in image space, in units of the first hand's size.
    const w1 = imgPt(h1, 0);
    const w2 = imgPt(h2, 0);
    const s1 = dist(w1, imgPt(h1, 9)) || 1e-6;
    const off = [(w2[0] - w1[0]) / s1, (w2[1] - w1[1]) / s1, 0];
    return { vec: handVector(c1).concat(handVector(c2), off), hands: 2 };
  }

  // ── Dynamic sequences (DTW) ────────────────────────────────────────────────

  /**
   * Per-frame dynamic feature: handshape (weighted so its Euclidean distance is
   * 0.5 × vecDist) + first-hand wrist trajectory relative to the window start +
   * second-hand wrist offset (zeros when only one hand is visible), all in
   * hand-size units.
   */
  function sequenceFeatures(frames) {
    const out = [];
    let origin = null;
    let scale = null;
    const shapeW = 0.5 / HAND_VEC_NORM;
    for (const fr of frames) {
      const hands = fr.hands || [];
      if (!hands.length) continue;
      const ordered = sortedHands(hands);
      const h = ordered[0];
      const can = canonical(h);
      if (!can) continue;
      const wr = imgPt(h, 0);
      if (!origin) {
        origin = wr;
        scale = dist(wr, imgPt(h, 9)) || 1e-6;
      }
      const mx = can.mirrored ? -1 : 1;
      const traj = [mx * (wr[0] - origin[0]) / scale, (wr[1] - origin[1]) / scale];
      let other = [0, 0];
      if (ordered[1]) {
        const w2 = imgPt(ordered[1], 0);
        other = [(w2[0] - wr[0]) / scale, (w2[1] - wr[1]) / scale];
      }
      const shape = handVector(can).map((x) => x * shapeW);
      out.push({ t: fr.t, v: shape.concat(traj, other) });
    }
    return out;
  }

  function resample(seq, n) {
    if (seq.length === 0) return [];
    if (seq.length === 1) return Array(n).fill(seq[0].v);
    const t0 = seq[0].t;
    const t1 = seq[seq.length - 1].t;
    const out = [];
    let j = 0;
    for (let i = 0; i < n; i++) {
      const t = t0 + ((t1 - t0) * i) / (n - 1);
      while (j < seq.length - 2 && seq[j + 1].t < t) j++;
      const a = seq[j], b = seq[j + 1];
      const span = (b.t - a.t) || 1;
      const k = clamp01((t - a.t) / span);
      out.push(a.v.map((x, idx) => x + (b.v[idx] - x) * k));
    }
    return out;
  }

  function euclid(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
    return Math.sqrt(s);
  }

  /** DTW distance between two equal-length resampled sequences (path-normalized). */
  function dtw(a, b, band) {
    const n = a.length, m = b.length;
    const INF = Infinity;
    let prev = new Array(m + 1).fill(INF);
    prev[0] = 0;
    for (let i = 1; i <= n; i++) {
      const cur = new Array(m + 1).fill(INF);
      const lo = Math.max(1, i - band), hi = Math.min(m, i + band);
      for (let j = lo; j <= hi; j++) {
        const c = euclid(a[i - 1], b[j - 1]);
        cur[j] = c + Math.min(prev[j], cur[j - 1], prev[j - 1]);
      }
      prev = cur;
    }
    return prev[m] / (n + m);
  }

  // ── Recognizer ─────────────────────────────────────────────────────────────

  /**
   * new SignRecognizer({catalog, templates})
   *   catalog   — catalog JSON (language, categories, signs…)
   *   templates — array from GET /api/signs/<lang>/templates
   */
  function SignRecognizer(opts) {
    opts = opts || {};
    this.catalog = opts.catalog || { signs: [] };
    this.signs = {};
    for (const s of this.catalog.signs || []) this.signs[s.id] = s;
    this._history = [];
    this.setTemplates(opts.templates || []);
  }

  SignRecognizer.prototype.setTemplates = function (templates) {
    this.static = {};   // sign_id → [{id, vec, hands}]
    this.dynamic = {};  // sign_id → [{id, seq (resampled), duration}]
    for (const tpl of templates) this.addTemplate(tpl);
  };

  SignRecognizer.prototype.addTemplate = function (tpl) {
    const frames = (tpl.frames || []).map((fr) => ({
      t: fr.t,
      // Frame-level aspect (recorded by the Studio) applies to every hand.
      hands: (fr.hands || []).map((h) => (h.aspect || !fr.aspect ? h : Object.assign({}, h, { aspect: fr.aspect }))),
    }));
    if (tpl.kind === 'dynamic') {
      const seq = sequenceFeatures(frames);
      if (seq.length < 3) return;
      (this.dynamic[tpl.sign_id] = this.dynamic[tpl.sign_id] || []).push({
        id: tpl.id, duration: seq[seq.length - 1].t - seq[0].t, seq: resample(seq, CFG.resampleN),
      });
      return;
    }
    // Static: every captured frame is one kNN sample.
    for (const fr of frames) {
      const fv = frameVector(fr.hands);
      if (fv) (this.static[tpl.sign_id] = this.static[tpl.sign_id] || []).push({ id: tpl.id, vec: fv.vec, hands: fv.hands });
    }
  };

  SignRecognizer.prototype.templateCount = function (signId) {
    const ids = new Set();
    for (const s of this.static[signId] || []) ids.add(s.id);
    for (const s of this.dynamic[signId] || []) ids.add(s.id);
    return ids.size;
  };

  SignRecognizer.prototype.isRecognizable = function (signId) {
    const s = this.signs[signId];
    if (!s) return false;
    if (s.kind === 'dynamic') return !!(this.dynamic[signId] && this.dynamic[signId].length);
    return !!s.handshape || !!(this.static[signId] && this.static[signId].length);
  };

  /** Nearest static-template distance for one sign, or Infinity. */
  SignRecognizer.prototype._staticDistance = function (signId, live) {
    let best = Infinity;
    if (!live) return best;
    for (const s of this.static[signId] || []) {
      if (live.hands !== s.hands) continue;
      const d = vecDist(live.vec, s.vec);
      if (d < best) best = d;
    }
    return best;
  };

  /** Score one sign from one "view" (a single hand, or the two-hand pair). */
  SignRecognizer.prototype._scoreView = function (sign, view) {
    const d = this._staticDistance(sign.id, view.live);
    const tplScore = Number.isFinite(d) ? Math.exp(-((d / CFG.staticSigma) ** 2)) : null;
    const spec = sign.handshape && view.feat ? scoreSpec(view.feat, sign.handshape) : null;
    if (tplScore != null && spec) {
      return { score: CFG.templateWeight * tplScore + (1 - CFG.templateWeight) * spec.score, source: 'template+spec', distance: d, spec: spec };
    }
    if (tplScore != null) return { score: tplScore, source: 'template', distance: d, spec: null };
    if (spec) return { score: spec.score, source: 'spec', distance: null, spec: spec };
    return null;
  };

  /**
   * Score static signs for the current frame.
   * One-hand signs are evaluated on each visible hand (best wins), so a resting
   * second hand in frame does not block recognition; two-hand signs need both.
   * @param hands   hand results ({handedness, landmarks, aspect})
   * @param options {candidates?: string[]} restrict to these sign ids
   * @returns [{sign_id, score, source, distance, spec}] best first
   */
  SignRecognizer.prototype.scoreStatic = function (hands, options) {
    options = options || {};
    if (!hands || !hands.length) return [];
    const singles = sortedHands(hands).slice(0, 2).map((h) => ({ live: frameVector([h]), feat: features(h) }));
    const pair = hands.length >= 2 ? { live: frameVector(hands.slice(0, 2)), feat: null } : null;
    const ids = options.candidates || Object.keys(this.signs);
    const out = [];
    for (const id of ids) {
      const sign = this.signs[id];
      if (!sign || sign.kind !== 'static') continue;
      const views = (sign.hands || 1) === 2 ? (pair ? [pair] : []) : singles;
      let best = null;
      for (const v of views) {
        const r = this._scoreView(sign, v);
        if (r && (!best || r.score > best.score)) best = r;
      }
      if (best) out.push(Object.assign({ sign_id: id }, best));
    }
    out.sort((a, b) => b.score - a.score);
    return out;
  };

  /** Candidate set for verifying `signId`: same category + declared confusables. */
  SignRecognizer.prototype.candidatesFor = function (signId) {
    const target = this.signs[signId];
    if (!target) return [];
    const set = new Set([signId].concat(target.confusable || []));
    for (const s of Object.values(this.signs)) {
      if (s.category === target.category && s.kind === target.kind && this.isRecognizable(s.id)) set.add(s.id);
    }
    return Array.from(set);
  };

  /**
   * Is the learner currently producing `signId`?
   * Returns {ok, score, rank, best, feedback: string[]}.
   */
  SignRecognizer.prototype.verify = function (hands, signId, options) {
    options = options || {};
    const sign = this.signs[signId];
    if (!sign) return { ok: false, score: 0, rank: -1, best: null, feedback: [] };
    const candidates = options.candidates || this.candidatesFor(signId);
    const ranked = sign.kind === 'dynamic'
      ? this.scoreDynamic({ candidates: candidates })
      : this.scoreStatic(hands, { candidates: candidates });
    const idx = ranked.findIndex((r) => r.sign_id === signId);
    const mine = idx >= 0 ? ranked[idx] : null;
    const best = ranked[0] || null;
    const score = mine ? mine.score : 0;
    const ok = !!mine && score >= CFG.acceptScore && (idx === 0 || best.score - score < CFG.tieMargin);
    const feedback = [];
    if (!ok && mine && mine.spec) {
      for (const c of mine.spec.checks) if (c.score < 0.5 && feedback.length < 2) feedback.push(c.message);
    }
    if (!ok && !feedback.length && best && best.sign_id !== signId && best.score >= CFG.acceptScore) {
      const g = this.signs[best.sign_id];
      feedback.push('Se parece a «' + (g ? g.gloss : best.sign_id) + '»');
    }
    return { ok: ok, score: score, rank: idx, best: best, feedback: feedback };
  };

  // ── Dynamic: live history + DTW ────────────────────────────────────────────

  /** Push the current frame's hands (call every frame while practising). */
  SignRecognizer.prototype.pushFrame = function (hands, t) {
    const now = t == null ? Date.now() : t;
    this._history.push({ t: now, hands: hands || [] });
    while (this._history.length && now - this._history[0].t > CFG.bufferMs) this._history.shift();
  };

  SignRecognizer.prototype.clearHistory = function () { this._history = []; };

  SignRecognizer.prototype.scoreDynamic = function (options) {
    options = options || {};
    const hist = this._history.filter((f) => f.hands.length);
    if (hist.length < 5) return [];
    const ids = options.candidates || Object.keys(this.dynamic);
    const end = hist[hist.length - 1].t;
    const out = [];
    const cache = {};
    for (const id of ids) {
      let best = Infinity;
      for (const tpl of this.dynamic[id] || []) {
        for (const k of CFG.windowScales) {
          const dur = Math.max(300, tpl.duration * k);
          const key = Math.round(dur / 50);
          if (!cache[key]) {
            const win = hist.filter((f) => f.t >= end - dur);
            const seq = sequenceFeatures(win);
            cache[key] = seq.length >= 3 ? resample(seq, CFG.resampleN) : null;
          }
          if (!cache[key]) continue;
          const d = dtw(cache[key], tpl.seq, CFG.dtwBand);
          if (d < best) best = d;
        }
      }
      if (Number.isFinite(best)) {
        out.push({ sign_id: id, score: Math.exp(-((best / CFG.dynamicSigma) ** 2)), source: 'dtw', distance: best });
      }
    }
    out.sort((a, b) => b.score - a.score);
    return out;
  };

  const api = {
    CFG: CFG,
    POINT: POINT,
    canonical: canonical,
    features: features,
    scoreSpec: scoreSpec,
    frameVector: frameVector,
    vecDist: vecDist,
    sequenceFeatures: sequenceFeatures,
    resample: resample,
    dtw: dtw,
    SignRecognizer: SignRecognizer,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    global.HO = global.HO || {};
    global.HO.Signs = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
