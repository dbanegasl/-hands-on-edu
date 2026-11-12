// Sign recognition engine tests. Real-photo fixtures pin the geometric
// conventions (palm normal, flexion, thumb position) to actual MediaPipe output.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const S = require(path.join(__dirname, '../../app/static/js/ho-signs.js'));
const CATALOG = require(path.join(__dirname, '../../app/content/lsec/catalog.json'));
const REAL = require(path.join(__dirname, '../fixtures/real_hands.json')).images;

function realHand(name, i = 0) {
  const img = REAL[name];
  return Object.assign({}, img.hands[i], { aspect: img.aspect });
}

function mirrorHand(hand) {
  return Object.assign({}, hand, {
    handedness: hand.handedness === 'Left' ? 'Right' : 'Left',
    landmarks: hand.landmarks.map(([x, y, z]) => [1 - x, y, z]),
  });
}

function shifted(hand, dx, dy, scale = 1) {
  const w = hand.landmarks[0];
  return Object.assign({}, hand, {
    landmarks: hand.landmarks.map(([x, y, z]) => [w[0] + (x - w[0]) * scale + dx, w[1] + (y - w[1]) * scale + dy, z * scale]),
  });
}

// ── Geometry on real photos ──────────────────────────────────────────────────

test('palm facing the camera has a normal pointing toward it (z < 0)', () => {
  for (const name of ['victory', 'pointing_up']) {
    const f = S.features(realHand(name));
    assert.ok(f.palmNormal[2] < -0.5, `${name}: ${f.palmNormal}`);
  }
});

test('finger flexion separates extended from folded fingers (victory)', () => {
  const f = S.features(realHand('victory'));
  assert.ok(f.curl.index < 60 && f.curl.middle < 60, JSON.stringify(f.curl));
  assert.ok(f.curl.ring > 110 && f.curl.pinky > 110, JSON.stringify(f.curl));
  assert.ok(f.reach.index > 1.6 && f.reach.ring < 1.45, JSON.stringify(f.reach));
});

test('thumb lateral position: across the palm vs extended', () => {
  assert.ok(S.features(realHand('victory')).thumbLateral > 0.35);
  assert.ok(S.features(realHand('thumbs_up')).thumbLateral < -0.6);
});

test('canonicalization is invariant to translation, scale and left/right mirroring', () => {
  const h = realHand('victory');
  const base = S.frameVector([h]).vec;
  for (const variant of [shifted(h, 0.1, -0.05), shifted(h, 0, 0, 0.6), mirrorHand(h)]) {
    assert.ok(S.vecDist(base, S.frameVector([variant]).vec) < 1e-6);
  }
});

// ── Spec-based recognition (no templates) ────────────────────────────────────

test('victory photo is recognized as V / 2', () => {
  const rec = new S.SignRecognizer({ catalog: CATALOG });
  const top = rec.scoreStatic([realHand('victory')]).slice(0, 2).map((r) => r.sign_id).sort();
  assert.deepEqual(top, ['num_2', 'v']);
  const v = rec.verify([realHand('victory')], 'v');
  assert.equal(v.ok, true);
  assert.ok(v.score > 0.9);
});

test('pointing photo is recognized as 1 and gets didactic feedback for V', () => {
  const rec = new S.SignRecognizer({ catalog: CATALOG });
  assert.equal(rec.scoreStatic([realHand('pointing_up')])[0].sign_id, 'num_1');
  const v = rec.verify([realHand('pointing_up')], 'v');
  assert.equal(v.ok, false);
  assert.ok(v.feedback.some((m) => /medio/.test(m)), v.feedback.join(' | '));
});

test('left-handed signer gets the same result as right-handed', () => {
  const rec = new S.SignRecognizer({ catalog: CATALOG });
  const a = rec.verify([realHand('victory')], 'v');
  const b = rec.verify([mirrorHand(realHand('victory'))], 'v');
  assert.equal(b.ok, true);
  assert.ok(Math.abs(a.score - b.score) < 1e-9);
});

test('a resting second hand does not block one-hand recognition', () => {
  const rec = new S.SignRecognizer({ catalog: CATALOG });
  const hands = [realHand('victory'), shifted(realHand('thumbs_up'), 0.3, 0)];
  assert.equal(rec.verify(hands, 'v').ok, true);
});

test('scoreSpec returns worst checks first with Spanish messages', () => {
  const f = S.features(realHand('pointing_up'));
  const r = S.scoreSpec(f, { index: 'extended', middle: 'extended', palm: 'forward' });
  assert.equal(r.checks[0].key, 'middle');
  assert.match(r.checks[0].message, /Extiende el dedo medio/);
  assert.ok(r.score < 0.5);
});

test('no hands → no candidates; unknown sign → not ok', () => {
  const rec = new S.SignRecognizer({ catalog: CATALOG });
  assert.deepEqual(rec.scoreStatic([]), []);
  assert.equal(rec.verify([realHand('victory')], 'nope').ok, false);
});

// ── Templates (kNN) ──────────────────────────────────────────────────────────

test('static templates make a spec-less sign recognizable', () => {
  const rec = new S.SignRecognizer({ catalog: CATALOG });
  assert.equal(rec.isRecognizable('k'), false);
  rec.setTemplates([{ id: 't1', sign_id: 'k', kind: 'static', frames: [{ t: 0, aspect: REAL.victory.aspect, hands: [REAL.victory.hands[0]] }] }]);
  assert.equal(rec.isRecognizable('k'), true);
  assert.equal(rec.templateCount('k'), 1);
  const r = rec.scoreStatic([realHand('victory')], { candidates: ['k'] })[0];
  assert.equal(r.source, 'template');
  assert.ok(r.score > 0.99);
  const far = rec.scoreStatic([realHand('thumbs_up')], { candidates: ['k'] })[0];
  assert.ok(far.score < 0.2, far.score);
});

test('template + spec scores are blended', () => {
  const rec = new S.SignRecognizer({ catalog: CATALOG });
  rec.addTemplate({ id: 't2', sign_id: 'v', kind: 'static', frames: [{ t: 0, aspect: REAL.victory.aspect, hands: [REAL.victory.hands[0]] }] });
  const r = rec.scoreStatic([realHand('victory')], { candidates: ['v'] })[0];
  assert.equal(r.source, 'template+spec');
});

// ── Dynamic signs (DTW) ──────────────────────────────────────────────────────

function trajectory(hand, fn, n = 30, ms = 1000) {
  return Array.from({ length: n }, (_, i) => {
    const [dx, dy] = fn(i / (n - 1));
    return { t: Math.round((i * ms) / (n - 1)), hands: [shifted(hand, dx, dy)] };
  });
}
const wave = (u) => [0.08 * Math.sin(u * 4 * Math.PI), 0];
const zigzag = (u) => (u < 1 / 3 ? [u * 0.3, 0] : u < 2 / 3 ? [0.1 - (u - 1 / 3) * 0.3, (u - 1 / 3) * 0.3] : [(u - 2 / 3) * 0.3, 0.1]);

test('DTW distinguishes two trajectories regardless of speed', () => {
  const h = realHand('pointing_up');
  const rec = new S.SignRecognizer({ catalog: CATALOG });
  rec.setTemplates([
    { id: 'w', sign_id: 'hola', kind: 'dynamic', frames: trajectory(h, wave) },
    { id: 'z', sign_id: 'z', kind: 'dynamic', frames: trajectory(h, zigzag) },
  ]);
  // Learner performs the zigzag 40% slower, starting elsewhere in the frame.
  const live = trajectory(shifted(h, -0.2, 0.1), zigzag, 40, 1400);
  for (const fr of live) rec.pushFrame(fr.hands, 5000 + fr.t);
  const ranked = rec.scoreDynamic();
  assert.equal(ranked[0].sign_id, 'z');
  assert.ok(ranked[0].score > ranked[1].score + 0.2, JSON.stringify(ranked.map((r) => [r.sign_id, r.score])));
  assert.equal(rec.verify(null, 'z').ok, true);
  assert.equal(rec.verify(null, 'hola').ok, false);
});

test('dynamic history is bounded and clearable', () => {
  const rec = new S.SignRecognizer({ catalog: CATALOG });
  for (let t = 0; t < 10000; t += 33) rec.pushFrame([realHand('victory')], t);
  assert.ok(rec._history.length <= Math.ceil(S.CFG.bufferMs / 33) + 1);
  rec.clearHistory();
  assert.deepEqual(rec.scoreDynamic(), []);
});

test('dtw of a sequence with itself is zero; resample keeps endpoints', () => {
  const seq = [{ t: 0, v: [0, 0] }, { t: 50, v: [1, 2] }, { t: 100, v: [2, 0] }];
  const r = S.resample(seq, 5);
  assert.deepEqual(r[0], [0, 0]);
  assert.deepEqual(r[4], [2, 0]);
  assert.equal(S.dtw(r, r, 2), 0);
});
