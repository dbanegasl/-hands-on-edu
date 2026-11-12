// Parity tests: the in-browser gesture logic must match the Python reference.
// Run: node --test tests/js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const H = require(path.join(__dirname, '../../app/static/js/ho-hands.js'));
const FIXTURE = require(path.join(__dirname, '../fixtures/gesture_parity.json'));

const toLm = (pts) => pts.map(([x, y, z]) => ({ x, y, z }));

test('fingerStates and detectGesture match Python on every fixture case', () => {
  for (const c of FIXTURE.cases) {
    const lm = toLm(c.landmarks);
    assert.deepEqual(H.fingerStates(lm), c.fingers, c.name);
    assert.equal(H.detectGesture(lm), c.gesture, c.name);
  }
});

test('GestureSmoother matches Python (majority latch + median count)', () => {
  const sm = new H.GestureSmoother();
  const { gestures, counts, expected } = FIXTURE.smoother;
  const out = gestures.map((g, i) => sm.smooth('Right', g, counts[i]));
  assert.deepEqual(out, expected);
});

test('GestureSmoother keeps per-hand state separate', () => {
  const sm = new H.GestureSmoother();
  for (let i = 0; i < 3; i++) sm.smooth('Right', 'fist', 0);
  assert.equal(sm.smooth('Left', 'peace', 2)[0], 'peace');
  assert.equal(sm.smooth('Right', 'peace', 2)[0], 'fist');
});

test('buildResponse emits the shared hand-result JSON shape', () => {
  const peace = FIXTURE.cases.find((c) => c.gesture === 'peace');
  const lm = toLm(peace.landmarks);
  const result = {
    landmarks: [lm],
    worldLandmarks: [lm],
    handedness: [[{ categoryName: 'Left', displayName: '', score: 0.93 }]],
  };
  const data = H.buildResponse(result, new H.GestureSmoother(), 4 / 3);
  assert.equal(data.hands_detected, 1);
  assert.equal(data.engine, 'browser');
  const hand = data.hands[0];
  assert.equal(hand.handedness, 'Left');
  assert.equal(hand.confidence, 0.93);
  assert.equal(hand.gesture, 'peace');
  assert.equal(hand.gesture_raw, 'peace');
  assert.equal(hand.finger_count, 2);
  assert.equal(hand.landmarks.length, 21);
  assert.equal(hand.world_landmarks.length, 21);
  assert.equal(hand.aspect, 4 / 3);
  assert.deepEqual(Object.keys(hand.fingers_up).sort(), ['index', 'middle', 'pinky', 'ring', 'thumb']);
});

test('buildResponse handles no hands and missing handedness', () => {
  assert.deepEqual(H.buildResponse({ landmarks: [] }, new H.GestureSmoother()).hands, []);
  const lm = toLm(FIXTURE.cases[0].landmarks);
  const two = H.buildResponse({ landmarks: [lm, lm] }, new H.GestureSmoother());
  assert.equal(two.hands_detected, 2);
  assert.equal(two.hands[0].handedness, 'Unknown');
});
