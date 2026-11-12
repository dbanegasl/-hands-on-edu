/**
 * HandsOnEdu — trained sign classifier (REQ-010)
 *
 * A small neural network (one hidden ReLU layer, softmax output) trained on
 * the reference templates teachers record in the Sign Studio. It complements
 * the engine in ho-signs.js for **static one-hand signs**: its probability is
 * blended with the descriptor/kNN score (geometric blend, see
 * HO.Signs.blendModel), so a hand far from every template still scores low.
 *
 * Everything runs in the browser (and in Node for tests and the CLI trainer
 * scripts/train-sign-model.cjs): no Python ML dependency, and one feature
 * extractor shared by training and inference.
 *
 * Honest evaluation: crossValidate() holds out whole recordings (never frames
 * of a recording seen in training), compares the current engine with the
 * engine + model on the same folds and picks the blend weight. A model is only
 * "recommended" when it improves accuracy on held-out recordings.
 *
 *   HO.SignModel.crossValidate(templates, catalog, opts, onProgress) → report
 *   HO.SignModel.trainModel(templates, catalog, opts, onProgress)    → model JSON
 *   HO.SignModel.load(json) → runtime model for SignRecognizer({model}) / setModel()
 */
(function (global) {
  'use strict';

  const Signs = (typeof module !== 'undefined' && module.exports)
    ? require('./ho-signs.js')
    : global.HO.Signs;

  const FORMAT = 'handsonedu.sign-model/v1';
  const FEATURE_VERSION = 'hand87-v1';
  const FINGER_ORDER = ['thumb', 'index', 'middle', 'ring', 'pinky'];
  const TIPS = [4, 8, 12, 16, 20];

  const DEFAULTS = {
    hidden: 24,
    epochs: 30,
    batch: 32,
    lr: 0.005,
    l2: 1e-4,
    labelSmoothing: 0.05,
    augment: 1,            // augmented copies per training frame
    rotationDeg: 10,       // in-plane rotation range of the augmentation (±)
    jitter: 0.004,         // landmark noise (image units)
    minTemplates: 2,       // per sign, to be part of the model (and of the evaluation)
    folds: 5,
    weights: [0.35, 0.5, 0.65, 0.8],   // blend weights tried by crossValidate
    seed: 7,
  };

  // ── Random numbers (seeded, reproducible) ─────────────────────────────────
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gaussian(rng) {
    const u = 1 - rng(), v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ── Features ──────────────────────────────────────────────────────────────

  /**
   * 87-dim vector from HO.Signs.features(hand): 20 canonical points (60),
   * flexion /180° and reach per digit (10), thumb lateral position (1), palm
   * normal and finger direction (6), distances between fingertips in palm
   * widths (10). Orientation is kept on purpose (it distinguishes signs).
   */
  function featureVector(f) {
    if (!f) return null;
    const v = [];
    const p = f.pts;
    for (let i = 1; i < 21; i++) v.push(p[i][0], p[i][1], p[i][2]);
    for (const name of FINGER_ORDER) v.push(f.curl[name] / 180, f.reach[name]);
    v.push(f.thumbLateral);
    v.push(f.palmNormal[0], f.palmNormal[1], f.palmNormal[2], f.fingerDir[0], f.fingerDir[1], f.fingerDir[2]);
    for (let i = 0; i < TIPS.length; i++) {
      for (let j = i + 1; j < TIPS.length; j++) {
        const a = p[TIPS[i]], b = p[TIPS[j]];
        v.push(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / f.palmWidth);
      }
    }
    return v;
  }

  function handFeatures(hand) {
    return featureVector(Signs.features(hand));
  }

  /** Copy of a hand rotated in the image plane around the wrist, with landmark noise. */
  function augmentHand(hand, rng, opts) {
    const k = hand.aspect > 0 ? hand.aspect : 4 / 3;
    const lm = hand.landmarks.map((p) => (Array.isArray(p) ? p : [p.x, p.y, p.z || 0]));
    const [wx, wy] = lm[0];
    const a = ((rng() * 2 - 1) * opts.rotationDeg * Math.PI) / 180;
    const c = Math.cos(a), s = Math.sin(a);
    const out = lm.map(([x, y, z]) => {
      const X = (x - wx) * k, Y = y - wy;
      return [
        wx + (c * X - s * Y) / k + gaussian(rng) * opts.jitter,
        wy + (s * X + c * Y) + gaussian(rng) * opts.jitter,
        (z || 0) + gaussian(rng) * opts.jitter,
      ];
    });
    return Object.assign({}, hand, { landmarks: out });
  }

  // ── Dataset ───────────────────────────────────────────────────────────────

  /** Static one-hand signs of the catalog (the classes a model may learn). */
  function eligibleSigns(catalog) {
    return (catalog.signs || []).filter((s) => s.kind === 'static' && (s.hands || 1) === 1).map((s) => s.id);
  }

  /** Hands of a template's usable frames: exactly one hand, frame aspect applied. */
  function templateHands(tpl) {
    const out = [];
    for (const fr of tpl.frames || []) {
      const hands = fr.hands || [];
      if (hands.length !== 1) continue;
      const h = hands[0];
      out.push(h.aspect || !fr.aspect ? h : Object.assign({}, h, { aspect: fr.aspect }));
    }
    return out;
  }

  /** Templates usable for the model, grouped by sign; classes with ≥ minTemplates. */
  function groupTemplates(templates, catalog, minTemplates) {
    const eligible = new Set(eligibleSigns(catalog));
    const bySign = {};
    for (const t of templates) {
      if (t.kind !== 'static' || !eligible.has(t.sign_id) || !templateHands(t).length) continue;
      (bySign[t.sign_id] = bySign[t.sign_id] || []).push(t);
    }
    const classes = Object.keys(bySign).filter((id) => bySign[id].length >= minTemplates).sort();
    const tooFew = Object.keys(bySign).filter((id) => bySign[id].length < minTemplates).sort();
    return { bySign, classes, tooFew };
  }

  function buildSamples(templates, classIndex, opts, rng) {
    const X = [], Y = [];
    for (const t of templates) {
      const y = classIndex[t.sign_id];
      if (y == null) continue;
      for (const h of templateHands(t)) {
        const x = handFeatures(h);
        if (!x) continue;
        X.push(x); Y.push(y);
        for (let a = 0; a < opts.augment; a++) {
          const xa = handFeatures(augmentHand(h, rng, opts));
          if (xa) { X.push(xa); Y.push(y); }
        }
      }
    }
    return { X, Y };
  }

  // ── Network ───────────────────────────────────────────────────────────────

  /**
   * Train a one-hidden-layer network (Adam, softmax cross-entropy with label
   * smoothing, class-balanced weights, L2). Generator: yields after every
   * epoch so callers can report progress and keep the page responsive.
   */
  function* trainSteps(X, Y, nClasses, opts, rng) {
    const n = X.length, d = X[0].length, H = opts.hidden, C = nClasses;
    // Standardization
    const mean = new Float64Array(d), std = new Float64Array(d);
    for (const x of X) for (let j = 0; j < d; j++) mean[j] += x[j] / n;
    for (const x of X) for (let j = 0; j < d; j++) std[j] += (x[j] - mean[j]) ** 2 / n;
    for (let j = 0; j < d; j++) std[j] = Math.max(Math.sqrt(std[j]), 1e-3);
    const Xs = X.map((x) => { const z = new Float64Array(d); for (let j = 0; j < d; j++) z[j] = (x[j] - mean[j]) / std[j]; return z; });
    // Class-balanced sample weights
    const count = new Float64Array(C);
    for (const y of Y) count[y]++;
    const sw = Y.map((y) => n / (C * count[y]));

    const W1 = new Float64Array(H * d), b1 = new Float64Array(H);
    const W2 = new Float64Array(C * H), b2 = new Float64Array(C);
    for (let i = 0; i < W1.length; i++) W1[i] = gaussian(rng) * Math.sqrt(2 / d);
    for (let i = 0; i < W2.length; i++) W2[i] = gaussian(rng) * Math.sqrt(1 / H);
    const params = [W1, b1, W2, b2];
    const grads = params.map((p) => new Float64Array(p.length));
    const m1 = params.map((p) => new Float64Array(p.length));
    const m2 = params.map((p) => new Float64Array(p.length));
    const [gW1, gb1, gW2, gb2] = grads;
    const hPre = new Float64Array(H), h = new Float64Array(H), z = new Float64Array(C), dz = new Float64Array(C), dh = new Float64Array(H);
    const order = Array.from({ length: n }, (_, i) => i);
    const ls = opts.labelSmoothing;
    let step = 0;
    let loss = 0;

    for (let epoch = 0; epoch < opts.epochs; epoch++) {
      shuffle(order, rng);
      loss = 0;
      for (let start = 0; start < n; start += opts.batch) {
        const end = Math.min(n, start + opts.batch);
        for (const g of grads) g.fill(0);
        for (let bi = start; bi < end; bi++) {
          const idx = order[bi], x = Xs[idx], y = Y[idx], w = sw[idx];
          for (let i = 0; i < H; i++) {
            let s = b1[i];
            const row = i * d;
            for (let j = 0; j < d; j++) s += W1[row + j] * x[j];
            hPre[i] = s; h[i] = s > 0 ? s : 0;
          }
          let mx = -Infinity;
          for (let c = 0; c < C; c++) {
            let s = b2[c];
            const row = c * H;
            for (let i = 0; i < H; i++) s += W2[row + i] * h[i];
            z[c] = s; if (s > mx) mx = s;
          }
          let se = 0;
          for (let c = 0; c < C; c++) { z[c] = Math.exp(z[c] - mx); se += z[c]; }
          for (let c = 0; c < C; c++) {
            const p = z[c] / se;
            const t = (c === y ? 1 - ls : 0) + ls / C;
            dz[c] = (p - t) * w;
            if (t > 0) loss -= w * t * Math.log(Math.max(p, 1e-12));
          }
          dh.fill(0);
          for (let c = 0; c < C; c++) {
            const row = c * H, g = dz[c];
            gb2[c] += g;
            for (let i = 0; i < H; i++) { gW2[row + i] += g * h[i]; dh[i] += W2[row + i] * g; }
          }
          for (let i = 0; i < H; i++) {
            if (hPre[i] <= 0) continue;
            const g = dh[i], row = i * d;
            gb1[i] += g;
            for (let j = 0; j < d; j++) gW1[row + j] += g * x[j];
          }
        }
        // Adam update (L2 on weights only)
        step++;
        const bs = end - start;
        const lrT = opts.lr * Math.sqrt(1 - 0.999 ** step) / (1 - 0.9 ** step);
        for (let pi = 0; pi < params.length; pi++) {
          const p = params[pi], g = grads[pi], a = m1[pi], b = m2[pi];
          const decay = pi === 0 || pi === 2 ? opts.l2 : 0;
          for (let i = 0; i < p.length; i++) {
            const gi = g[i] / bs + decay * p[i];
            a[i] = 0.9 * a[i] + 0.1 * gi;
            b[i] = 0.999 * b[i] + 0.001 * gi * gi;
            p[i] -= lrT * a[i] / (Math.sqrt(b[i]) + 1e-8);
          }
        }
      }
      yield { epoch: epoch + 1, epochs: opts.epochs, loss: loss / n };
    }
    return { mean, std, W1, b1, W2, b2, d, H, C };
  }

  function runSync(gen) {
    let r = gen.next();
    while (!r.done) r = gen.next();
    return r.value;
  }

  async function runAsync(gen, onStep) {
    let r = gen.next();
    while (!r.done) {
      if (onStep) onStep(r.value);
      await new Promise((res) => setTimeout(res, 0));
      r = gen.next();
    }
    return r.value;
  }

  const round = (v) => Math.round(v * 1e5) / 1e5;

  function toJSON(net, classes, opts, extra) {
    return Object.assign({
      format: FORMAT,
      feature_version: FEATURE_VERSION,
      classes: classes,
      hidden: net.H,
      inputs: net.d,
      mean: Array.from(net.mean, round),
      std: Array.from(net.std, round),
      W1: Array.from(net.W1, round),
      b1: Array.from(net.b1, round),
      W2: Array.from(net.W2, round),
      b2: Array.from(net.b2, round),
      weight: opts.weight == null ? 0.5 : opts.weight,
    }, extra || {});
  }

  /** Structural check of a model JSON; returns an error string or null. */
  function validate(json) {
    if (!json || json.format !== FORMAT) return 'Formato de modelo desconocido';
    if (json.feature_version !== FEATURE_VERSION) return 'El modelo se entrenó con otra versión de características (' + json.feature_version + ')';
    const C = (json.classes || []).length, H = json.hidden, d = json.inputs;
    if (C < 2 || !(H > 0) || !(d > 0)) return 'Modelo incompleto';
    const sizes = { mean: d, std: d, W1: H * d, b1: H, W2: C * H, b2: C };
    for (const [k, n] of Object.entries(sizes)) {
      if (!Array.isArray(json[k]) || json[k].length !== n) return 'Tamaño incorrecto en ' + k;
    }
    return null;
  }

  /**
   * Runtime model for SignRecognizer: {classes, index, weight, predictFeatures(f)}.
   * Returns null (with a console warning) for an invalid or incompatible model.
   */
  function load(json) {
    const err = validate(json);
    if (err) {
      if (typeof console !== 'undefined') console.warn('HO.SignModel:', err);
      return null;
    }
    const d = json.inputs, H = json.hidden, C = json.classes.length;
    const mean = Float64Array.from(json.mean), std = Float64Array.from(json.std);
    const W1 = Float64Array.from(json.W1), b1 = Float64Array.from(json.b1);
    const W2 = Float64Array.from(json.W2), b2 = Float64Array.from(json.b2);
    const index = {};
    json.classes.forEach((id, i) => { index[id] = i; });
    const h = new Float64Array(H);

    function predict(x) {
      if (!x || x.length !== d) return null;
      for (let i = 0; i < H; i++) {
        let s = b1[i];
        const row = i * d;
        for (let j = 0; j < d; j++) s += W1[row + j] * (x[j] - mean[j]) / std[j];
        h[i] = s > 0 ? s : 0;
      }
      const z = new Float64Array(C);
      let mx = -Infinity;
      for (let c = 0; c < C; c++) {
        let s = b2[c];
        const row = c * H;
        for (let i = 0; i < H; i++) s += W2[row + i] * h[i];
        z[c] = s; if (s > mx) mx = s;
      }
      let se = 0;
      for (let c = 0; c < C; c++) { z[c] = Math.exp(z[c] - mx); se += z[c]; }
      for (let c = 0; c < C; c++) z[c] /= se;
      return z;
    }

    return {
      id: json.id || null,
      classes: json.classes.slice(),
      index: index,
      weight: json.weight,
      json: json,
      predict: predict,
      predictFeatures: (f) => predict(featureVector(f)),
      predictHand: (hand) => predict(handFeatures(hand)),
    };
  }

  // ── Training & evaluation ─────────────────────────────────────────────────

  function fitNetwork(trainTemplates, classes, opts, rng) {
    const index = {};
    classes.forEach((id, i) => { index[id] = i; });
    const { X, Y } = buildSamples(trainTemplates, index, opts, rng);
    if (!X.length) throw new Error('No hay muestras de entrenamiento');
    const gen = trainSteps(X, Y, classes.length, opts, rng);
    return { gen, samples: X.length };
  }

  /**
   * Train the final model on every usable template.
   * Resolves to the model JSON (with `trained_on`), or throws if fewer than
   * two signs have enough recordings.
   */
  async function trainModel(templates, catalog, opts, onProgress) {
    opts = Object.assign({}, DEFAULTS, opts || {});
    const rng = mulberry32(opts.seed);
    const g = groupTemplates(templates, catalog, opts.minTemplates);
    if (g.classes.length < 2) {
      throw new Error('Se necesitan al menos 2 señas estáticas de una mano con ' + opts.minTemplates + ' grabaciones cada una');
    }
    const used = g.classes.flatMap((id) => g.bySign[id]);
    const fit = fitNetwork(used, g.classes, opts, rng);
    const net = await runAsync(fit.gen, (s) => onProgress && onProgress({ phase: 'final', epoch: s.epoch, epochs: s.epochs }));
    const authors = new Set(used.map((t) => t.author || '').filter(Boolean));
    const last = used.reduce((m, t) => (t.created_at && t.created_at > m ? t.created_at : m), '');
    return toJSON(net, g.classes, opts, {
      trained_on: { templates: used.length, samples: fit.samples, authors: authors.size, last_template_at: last || null },
    });
  }

  /**
   * Verification rule of SignRecognizer.verify on precomputed scores:
   * the target must reach acceptScore and lead its candidate set (or tie).
   */
  function accepted(scores, target, candidates) {
    const mine = scores[target];
    if (mine == null || mine < Signs.CFG.acceptScore) return false;
    let best = -1;
    for (const c of candidates) if (scores[c] != null && scores[c] > best) best = scores[c];
    return mine >= best || best - mine < Signs.CFG.tieMargin;
  }

  /**
   * Grouped, stratified k-fold cross-validation: whole recordings are held
   * out, never frames of a recording seen in training. For every held-out
   * frame it compares the current engine (descriptor + kNN on the training
   * recordings) with the engine blended with a model trained on the same
   * recordings, for each candidate blend weight, measuring what a learner
   * experiences:
   *   accuracy     — top-1 among the model's signs
   *   accept       — verify(correct sign) succeeds (real candidate sets,
   *                  including descriptor-only signs of the same category)
   *   false_accept — verify(another model sign) succeeds on this frame
   * The best weight maximizes accept − false_accept (then accuracy); the model
   * is recommended only if that beats the current engine without losing accuracy.
   */
  async function crossValidate(templates, catalog, opts, onProgress) {
    opts = Object.assign({}, DEFAULTS, opts || {});
    const rng = mulberry32(opts.seed);
    const g = groupTemplates(templates, catalog, opts.minTemplates);
    if (g.classes.length < 2) {
      throw new Error('Se necesitan al menos 2 señas estáticas de una mano con ' + opts.minTemplates + ' grabaciones cada una');
    }
    const maxPer = Math.max(...g.classes.map((id) => g.bySign[id].length));
    const k = Math.max(2, Math.min(opts.folds, maxPer));
    const foldOf = new Map();
    for (const id of g.classes) {
      shuffle(g.bySign[id].slice(), rng).forEach((t, i) => foldOf.set(t.id, i % k));
    }
    const weights = [0].concat(opts.weights);          // 0 = current engine
    const W = weights.length;
    const zeros = () => new Array(W).fill(0);
    const tot = { top: zeros(), acc: zeros(), fa: zeros(), faPairs: 0 };
    const perSign = {};
    for (const id of g.classes) perSign[id] = { frames: 0, top: zeros(), acc: zeros() };
    const confusions = weights.map(() => ({}));
    let frames = 0;

    for (let fold = 0; fold < k; fold++) {
      const train = templates.filter((t) => !foldOf.has(t.id) || foldOf.get(t.id) !== fold);
      const test = templates.filter((t) => foldOf.get(t.id) === fold);
      if (!test.length) continue;
      const fit = fitNetwork(train.filter((t) => foldOf.has(t.id)), g.classes, opts, rng);
      const net = await runAsync(fit.gen, (s) => onProgress && onProgress({ phase: 'cv', fold: fold + 1, folds: k, epoch: s.epoch, epochs: s.epochs }));
      const model = load(toJSON(net, g.classes, opts));
      const rec = new Signs.SignRecognizer({ catalog: catalog, templates: train });
      const cands = {};
      for (const id of g.classes) cands[id] = rec.candidatesFor(id);
      for (const t of test) {
        for (const hand of templateHands(t)) {
          const ranked = rec.scoreStatic([hand]);       // engine only, every static sign
          if (!ranked.length) continue;
          const probs = model.predictHand(hand);
          const engine = {};
          for (const r of ranked) engine[r.sign_id] = r.score;
          frames++;
          const ps = perSign[t.sign_id];
          ps.frames++;
          weights.forEach((w, wi) => {
            const sc = Object.assign({}, engine);
            if (w > 0) for (const id of g.classes) if (sc[id] != null) sc[id] = Signs.blendModel(sc[id], probs[model.index[id]], w);
            let top = null;
            for (const id of g.classes) if (sc[id] != null && (top == null || sc[id] > sc[top])) top = id;
            if (top === t.sign_id) { tot.top[wi]++; ps.top[wi]++; } else if (top) {
              const key = t.sign_id + '→' + top;
              confusions[wi][key] = (confusions[wi][key] || 0) + 1;
            }
            if (accepted(sc, t.sign_id, cands[t.sign_id])) { tot.acc[wi]++; ps.acc[wi]++; }
            for (const other of g.classes) {
              if (other === t.sign_id) continue;
              if (wi === 0) tot.faPairs++;
              if (accepted(sc, other, cands[other])) tot.fa[wi]++;
            }
          });
        }
      }
    }
    if (!frames) throw new Error('No hay cuadros de prueba utilizables');

    const r4 = (v) => Math.round(v * 10000) / 10000;
    const row = (wi) => ({
      weight: weights[wi],
      accuracy: r4(tot.top[wi] / frames),
      accept: r4(tot.acc[wi] / frames),
      false_accept: tot.faPairs ? r4(tot.fa[wi] / tot.faPairs) : 0,
    });
    const rows = weights.map((_, wi) => row(wi));
    const J = (r) => r.accept - r.false_accept;
    let bi = 1;
    for (let wi = 2; wi < W; wi++) {
      if (J(rows[wi]) > J(rows[bi]) || (J(rows[wi]) === J(rows[bi]) && rows[wi].accuracy > rows[bi].accuracy)) bi = wi;
    }
    const baseline = rows[0], best = rows[bi];
    const confList = (m) => Object.entries(m).map(([key, count]) => {
      const [a, b] = key.split('→');
      return { true: a, predicted: b, count: count };
    }).sort((x, y) => y.count - x.count).slice(0, 10);
    const r3 = (n, d) => (d ? Math.round((1000 * n) / d) / 1000 : null);
    return {
      classes: g.classes,
      too_few: g.tooFew,
      folds: k,
      frames: frames,
      templates: g.classes.reduce((s, id) => s + g.bySign[id].length, 0),
      baseline: baseline,
      by_weight: rows.slice(1),
      best: best,
      recommended: J(best) > J(baseline) && best.accuracy >= baseline.accuracy,
      per_sign: g.classes.map((id) => {
        const p = perSign[id];
        return {
          sign_id: id, templates: g.bySign[id].length, frames: p.frames,
          baseline: { accuracy: r3(p.top[0], p.frames), accept: r3(p.acc[0], p.frames) },
          model: { accuracy: r3(p.top[bi], p.frames), accept: r3(p.acc[bi], p.frames) },
        };
      }),
      confusions: confList(confusions[bi]),
      confusions_baseline: confList(confusions[0]),
    };
  }

  const api = {
    FORMAT, FEATURE_VERSION, DEFAULTS,
    featureVector, handFeatures, augmentHand, eligibleSigns, groupTemplates, templateHands,
    mulberry32, trainSteps, runSync, runAsync, validate, load, trainModel, crossValidate, accepted,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    global.HO = global.HO || {};
    global.HO.SignModel = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
