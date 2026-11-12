// Trained sign classifier (REQ-010): features, network, evaluation, recognizer blend.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const S = require(path.join(__dirname, '../../app/static/js/ho-signs.js'));
const M = require(path.join(__dirname, '../../app/static/js/ho-signs-model.js'));
const CATALOG = require(path.join(__dirname, '../../app/content/lsec/catalog.json'));
const REAL = require(path.join(__dirname, '../fixtures/real_hands.json')).images;

const realHand = (name) => Object.assign({}, REAL[name].hands[0], { aspect: REAL[name].aspect });

// Synthetic recordings from real photos: each recording is a different
// "signer" (rotation + noise) holding the shape for 12 frames.
const PHOTO = { v: 'victory', num_1: 'pointing_up', a: 'thumbs_up', g: 'thumbs_down' };
function recordings(perSign, seed = 1) {
  const rng = M.mulberry32(seed);
  const out = [];
  let n = 0;
  for (const [sign, photo] of Object.entries(PHOTO)) {
    for (let t = 0; t < perSign; t++) {
      const signer = M.augmentHand(realHand(photo), rng, { rotationDeg: 15, jitter: 0.02 });
      out.push({
        id: `${sign}-${t}`, sign_id: sign, kind: 'static', author: `docente ${t % 2}`,
        created_at: `2026-11-1${n++ % 9}T10:00:00Z`,
        frames: Array.from({ length: 12 }, (_, i) => ({
          t: i * 110, hands: [M.augmentHand(signer, rng, { rotationDeg: 2, jitter: 0.01 })],
        })),
      });
    }
  }
  return out;
}

function mirror(hand) {
  return Object.assign({}, hand, {
    handedness: hand.handedness === 'Left' ? 'Right' : 'Left',
    landmarks: hand.landmarks.map(([x, y, z]) => [1 - x, y, z]),
  });
}

test('feature vector: 87 values, invariant to position and to the signing hand', () => {
  const h = realHand('victory');
  const v = M.handFeatures(h);
  assert.equal(v.length, 87);
  const moved = Object.assign({}, h, { landmarks: h.landmarks.map(([x, y, z]) => [x + 0.1, y - 0.05, z]) });
  for (const other of [M.handFeatures(moved), M.handFeatures(mirror(h))]) {
    assert.ok(v.every((x, i) => Math.abs(x - other[i]) < 1e-6));
  }
  assert.equal(M.handFeatures({ landmarks: [] }), null);
});

test('the network learns a separable problem and is reproducible with a seed', () => {
  const rng = M.mulberry32(3);
  const X = [], Y = [];
  for (let i = 0; i < 200; i++) {
    const y = i % 3;
    X.push([y + 0.2 * (rng() - 0.5), -y + 0.2 * (rng() - 0.5), rng()]);
    Y.push(y);
  }
  const opts = Object.assign({}, M.DEFAULTS, { hidden: 8, epochs: 40 });
  const losses = [];
  const gen = M.trainSteps(X, Y, 3, opts, M.mulberry32(1));
  let r = gen.next();
  while (!r.done) { losses.push(r.value.loss); r = gen.next(); }
  assert.ok(losses.at(-1) < losses[0] / 3, `loss ${losses[0]} → ${losses.at(-1)}`);
  const net = r.value;
  const json = {
    format: M.FORMAT, feature_version: M.FEATURE_VERSION, classes: ['x', 'y', 'z'], hidden: 8, inputs: 3,
    mean: [...net.mean], std: [...net.std], W1: [...net.W1], b1: [...net.b1], W2: [...net.W2], b2: [...net.b2], weight: 0.5,
  };
  const model = M.load(json);
  assert.deepEqual([0, 1, 2].map((y) => { const p = model.predict([y, -y, 0.5]); return p.indexOf(Math.max(...p)); }), [0, 1, 2]);
  const again = M.runSync(M.trainSteps(X, Y, 3, opts, M.mulberry32(1)));
  assert.deepEqual([...again.W2], [...net.W2]);
});

test('load() rejects unknown formats, other feature versions and wrong sizes', () => {
  const warn = console.warn; console.warn = () => {};
  try {
    assert.equal(M.load(null), null);
    assert.match(M.validate({ format: 'x' }), /Formato/);
    assert.match(M.validate({ format: M.FORMAT, feature_version: 'old' }), /versión/);
    const bad = { format: M.FORMAT, feature_version: M.FEATURE_VERSION, classes: ['a', 'b'], hidden: 2, inputs: 3,
      mean: [0, 0, 0], std: [1, 1, 1], W1: [0, 0, 0, 0, 0], b1: [0, 0], W2: [0, 0, 0, 0], b2: [0, 0] };
    assert.match(M.validate(bad), /W1/);
    assert.equal(M.load(bad), null);
  } finally { console.warn = warn; }
});

test('cross-validation holds out whole recordings and compares with the current engine', async () => {
  const tpls = recordings(4);
  const progress = [];
  const rep = await M.crossValidate(tpls, CATALOG, {}, (p) => progress.push(p));
  assert.deepEqual(rep.classes, ['a', 'g', 'num_1', 'v']);
  assert.equal(rep.folds, 4);
  assert.equal(rep.frames, 4 * 4 * 12);            // every recorded frame is tested exactly once
  assert.equal(rep.templates, 16);
  const J = (r) => r.accept - r.false_accept;
  assert.ok(J(rep.best) >= Math.max(...rep.by_weight.map(J)) - 1e-9);
  assert.equal(rep.recommended, J(rep.best) > J(rep.baseline) && rep.best.accuracy >= rep.baseline.accuracy);
  // On these recordings the engine alone struggles (rotated signers); the model helps.
  assert.ok(rep.recommended, JSON.stringify({ base: rep.baseline, best: rep.best }));
  assert.ok(rep.best.accuracy > 0.9 && rep.best.accept > rep.baseline.accept, JSON.stringify(rep.best));
  assert.equal(rep.per_sign.length, 4);
  assert.ok(rep.per_sign.every((p) => p.frames === 48 && p.templates === 4 && p.model.accuracy != null));
  assert.ok(progress.some((p) => p.phase === 'cv' && p.fold === 4));
});

test('signs with too few recordings are listed, and training needs two signs', async () => {
  const tpls = recordings(2).filter((t) => !(t.sign_id === 'g' && t.id.endsWith('-1')));
  const g = M.groupTemplates(tpls, CATALOG, 2);
  assert.deepEqual(g.tooFew, ['g']);
  // Dynamic, two-hand and unknown signs never become classes.
  const extra = [{ id: 'x', sign_id: 'hola', kind: 'dynamic', frames: tpls[0].frames }, { id: 'y', sign_id: 'nope', kind: 'static', frames: tpls[0].frames }];
  assert.deepEqual(M.groupTemplates(tpls.concat(extra), CATALOG, 2).classes, ['a', 'num_1', 'v']);
  await assert.rejects(M.trainModel(tpls.filter((t) => t.sign_id === 'v'), CATALOG), /al menos 2 señas/);
});

test('a trained model is blended into recognition, without accepting a non-hand', async () => {
  const tpls = recordings(3);
  const json = await M.trainModel(tpls, CATALOG, { weight: 0.5 });
  assert.equal(json.format, M.FORMAT);
  assert.deepEqual(json.classes, ['a', 'g', 'num_1', 'v']);
  assert.deepEqual(json.trained_on, { templates: 12, samples: 288, authors: 2, last_template_at: '2026-11-18T10:00:00Z' });
  const model = M.load(json);
  const rec = new S.SignRecognizer({ catalog: CATALOG, templates: tpls, model });
  const base = new S.SignRecognizer({ catalog: CATALOG, templates: tpls });

  const fresh = recordings(1, 99);                 // unseen "signers"
  for (const t of fresh) {
    const ranked = rec.scoreStatic(t.frames[0].hands, { candidates: json.classes });
    assert.equal(ranked[0].sign_id, t.sign_id);
    assert.match(ranked[0].source, /\+model$/);
    assert.ok(ranked[0].prob > 0.5 && ranked[0].engine > 0);
    assert.ok(rec.verify(t.frames[0].hands, t.sign_id).score > base.verify(t.frames[0].hands, t.sign_id).score, t.sign_id);
  }
  assert.ok(rec.verify(fresh[0].frames[0].hands, 'v').ok || rec.verify(fresh[3].frames[0].hands, 'g').ok);
  // Signs outside the model keep the engine score untouched.
  const b = rec.scoreStatic([realHand('victory')], { candidates: ['b'] })[0];
  assert.equal(b.source, 'spec');

  // A scrambled "hand" may get a confident softmax, but the blend stays low.
  const rng = M.mulberry32(5);
  const junk = { handedness: 'Right', aspect: 1, landmarks: Array.from({ length: 21 }, () => [rng(), rng(), 0]) };
  const top = rec.scoreStatic([junk], { candidates: json.classes })[0];
  assert.ok(!top || top.score < S.CFG.acceptScore, JSON.stringify(top && { s: top.score, p: top.prob }));

  // Removing the model restores the engine scores.
  rec.setModel(null);
  assert.ok(!rec.scoreStatic(fresh[0].frames[0].hands)[0].source.includes('model'));
});

test('accepted() applies the verification rule on precomputed scores', () => {
  assert.equal(M.accepted({ a: 0.7, b: 0.5 }, 'a', ['a', 'b']), true);
  assert.equal(M.accepted({ a: 0.7, b: 0.73 }, 'a', ['a', 'b']), true);   // tie margin
  assert.equal(M.accepted({ a: 0.7, b: 0.8 }, 'a', ['a', 'b']), false);
  assert.equal(M.accepted({ a: 0.5 }, 'a', ['a']), false);
  assert.equal(M.accepted({}, 'a', ['a']), false);
});

test('blendModel: geometric, neutral without a model', () => {
  assert.equal(S.blendModel(0.7, null, 0.5), 0.7);
  assert.equal(S.blendModel(0.7, 0.9, 0), 0.7);
  assert.ok(Math.abs(S.blendModel(0.64, 1, 0.5) - 0.8) < 1e-9);
  assert.equal(S.blendModel(0, 1, 0.5), 0);
});
