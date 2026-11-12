// Curriculum logic for the Aula de Señas (REQ-018).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const C = require(path.join(__dirname, '../../app/static/js/ho-curriculum.js'));
const S = require(path.join(__dirname, '../../app/static/js/ho-signs.js'));
const CATALOG = require(path.join(__dirname, '../../app/content/lsec/catalog.json'));
const REAL = require(path.join(__dirname, '../fixtures/real_hands.json')).images;

const realHand = (name) => Object.assign({}, REAL[name].hands[0], { aspect: REAL[name].aspect });
const rec = () => new S.SignRecognizer({ catalog: CATALOG });
const seeded = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// ── Fingerspelling ───────────────────────────────────────────────────────────

test('tokenizeWord handles Spanish digraphs, Ñ and accents', () => {
  assert.deepEqual(C.tokenizeWord('PERRO', CATALOG), ['p', 'e', 'rr', 'o']);
  assert.deepEqual(C.tokenizeWord('llave', CATALOG), ['ll', 'a', 'v', 'e']);
  assert.deepEqual(C.tokenizeWord('Chile', CATALOG), ['ch', 'i', 'l', 'e']);
  assert.deepEqual(C.tokenizeWord('NIÑO', CATALOG), ['n', 'i', 'enie', 'o']);
  assert.deepEqual(C.tokenizeWord('Río', CATALOG), ['r', 'i', 'o']);
  assert.equal(C.tokenizeWord('K9', CATALOG), null);
  assert.equal(C.tokenizeWord('', CATALOG), null);
});

test('every catalog spelling word tokenizes', () => {
  for (const w of CATALOG.spelling_words) assert.ok(C.tokenizeWord(w, CATALOG), w);
});

test('spellableWords keeps only words with recognizable letters', () => {
  const r = rec();
  const words = C.spellableWords(CATALOG, r).map((x) => x.word);
  assert.ok(words.includes('OSO') && words.includes('SOFA'));
  assert.ok(!words.includes('PERRO'), 'P and RR need templates');
  assert.ok(!words.includes('LUNA'), 'N needs a template');
  // Recording an N template makes LUNA spellable.
  r.addTemplate({ id: 'n1', sign_id: 'n', kind: 'static', frames: [{ t: 0, hands: [realHand('victory')] }] });
  assert.ok(C.spellableWords(CATALOG, r).some((x) => x.word === 'LUNA'));
});

// ── Units ────────────────────────────────────────────────────────────────────

test('unitStatus: first playable unit open, next locked until passed', () => {
  const r = rec();
  const st = C.unitStatus(CATALOG, r, {}, new Set());
  const byId = Object.fromEntries(st.map((u) => [u.unit.id, u]));
  assert.equal(byId.u1.locked, false);
  assert.equal(byId.u1.playable, true);
  assert.deepEqual(byId.u1.available, ['a', 'e', 'i', 'o', 'u']);
  assert.equal(byId.u2.locked, true);
  // Template-only units are "próximamente", never locked, and don't block the path.
  assert.equal(byId.u4.playable, false);
  assert.equal(byId.u4.locked, false);

  const after = C.unitStatus(CATALOG, r, {}, new Set(['u1']));
  assert.equal(after.find((u) => u.unit.id === 'u2').locked, false);
  assert.equal(after.find((u) => u.unit.id === 'u3').locked, true);
  assert.ok(C.unitStatus(CATALOG, r, {}, new Set(), { unlockAll: true }).every((u) => !u.locked));
});

test('unitStatus skips non-playable units when chaining locks', () => {
  const r = rec();
  const passed = new Set(['u1', 'u2', 'u3']);
  const st = C.unitStatus(CATALOG, r, {}, passed);
  // u4 and u5 have no recognizable signs; u6 (numbers) follows u3.
  assert.equal(st.find((u) => u.unit.id === 'u6').locked, false);
});

test('unitStatus keeps units assigned by the LMS open', () => {
  const st = C.unitStatus(CATALOG, rec(), {}, new Set(), { open: ['u6'] });
  assert.equal(st.find((u) => u.unit.id === 'u6').locked, false);
  assert.equal(st.find((u) => u.unit.id === 'u2').locked, true);
});

test('unitStatus averages mastery over available signs', () => {
  const st = C.unitStatus(CATALOG, rec(), { a: 1, e: 0.5, i: 0.9 }, new Set());
  const u1 = st.find((u) => u.unit.id === 'u1');
  assert.ok(Math.abs(u1.mastery - (1 + 0.5 + 0.9) / 5) < 1e-9);
  assert.equal(u1.mastered, 2);
});

test('passedUnits reads finished quiz sessions above the threshold', () => {
  const sessions = [
    { activity: 'quiz:u1', ended_at: 'x', score: 4, max_score: 5 },
    { activity: 'quiz:u2', ended_at: 'x', score: 3, max_score: 5 },
    { activity: 'quiz:u3', ended_at: null, score: 5, max_score: 5 },
    { activity: 'lesson:u6', ended_at: 'x', score: 5, max_score: 5 },
  ];
  assert.deepEqual([...C.passedUnits(sessions)], ['u1']);
});

// ── Review ───────────────────────────────────────────────────────────────────

test('pickReview prioritizes weak, then stale signs; ignores unrecognizable', () => {
  const now = Date.parse('2026-11-12T12:00:00Z');
  const day = 24 * 3600 * 1000;
  const rows = [
    { sign_id: 'a', mastery: 0.95, last_attempt_at: new Date(now - day).toISOString() },      // fresh & mastered → skip
    { sign_id: 'b', mastery: 0.95, last_attempt_at: new Date(now - 5 * day).toISOString() },  // stale → review
    { sign_id: 'e', mastery: 0.2, last_attempt_at: new Date(now - day).toISOString() },
    { sign_id: 'i', mastery: 0.5, last_attempt_at: new Date(now - day).toISOString() },
    { sign_id: 'k', mastery: 0.1, last_attempt_at: new Date(now - day).toISOString() },       // no template → skip
  ];
  assert.deepEqual(C.pickReview(rows, rec(), 8, now), ['e', 'i', 'b']);
  assert.deepEqual(C.pickReview(rows, rec(), 1, now), ['e']);
});

// ── Quiz & grading ───────────────────────────────────────────────────────────

test('buildQuiz covers every sign and pads small units without back-to-back repeats', () => {
  const q = C.buildQuiz(['a', 'b'], 5, seeded(7));
  assert.equal(q.length, 4); // min(5, 2*2)
  assert.deepEqual(new Set(q), new Set(['a', 'b']));
  for (let i = 1; i < q.length; i++) assert.notEqual(q[i], q[i - 1]);
  const big = C.buildQuiz(['a', 'b', 'c', 'd', 'e', 'f'], 5, seeded(3));
  assert.equal(big.length, 6);
  assert.deepEqual(C.buildQuiz([], 5), []);
});

test('grade thresholds', () => {
  assert.equal(C.grade(1).letter, 'A');
  assert.equal(C.grade(0.7).passed, true);
  assert.equal(C.grade(0.69).passed, false);
  assert.equal(C.grade(0.1).letter, 'D');
});

// ── Reference videos ─────────────────────────────────────────────────────────

test('mediaInfo: learners only see interpreter-validated videos, always with the AI notice', () => {
  assert.equal(C.mediaInfo({ id: 'a' }), null);
  const pending = { media: { video: '/v.mp4', ai_generated: true } };
  const p = C.mediaInfo(pending);
  assert.equal(p.show, false);
  assert.equal(C.mediaInfo(pending, { teacher: true }).show, true);
  assert.match(p.notice, /generado con IA/);
  assert.match(p.notice, /Pendiente de validación/);

  const ok = C.mediaInfo({ media: { video: '/v.mp4', poster: '/p.jpg', ai_generated: true, validated_by: 'Ana Pérez', validated_at: '2026-11-20' } });
  assert.equal(ok.show, true);
  assert.equal(ok.poster, '/p.jpg');
  assert.equal(ok.notice, '🤖 Video generado con IA · ✔ Validado por intérprete de LSEC: Ana Pérez (20/11/2026)');

  const human = C.mediaInfo({ media: { video: '/v.mp4', ai_generated: false, validated_by: 'Ana' } });
  assert.doesNotMatch(human.notice, /IA/);
  assert.equal(human.aiGenerated, false);
});

// ── HoldVerifier ─────────────────────────────────────────────────────────────

test('HoldVerifier completes after holding the correct sign', () => {
  const hv = new C.HoldVerifier({ recognizer: rec(), signId: 'v', holdMs: 1000 });
  let st;
  for (let t = 0; t <= 900; t += 100) st = hv.update([realHand('victory')], t);
  assert.equal(st.done, false);
  assert.ok(st.holding && st.progress >= 0.9);
  st = hv.update([realHand('victory')], 1000);
  assert.equal(st.done, true);
  assert.equal(st.progress, 1);
});

test('HoldVerifier forgives short drops but resets on long ones', () => {
  const hv = new C.HoldVerifier({ recognizer: rec(), signId: 'v', holdMs: 1000, graceMs: 250 });
  hv.update([realHand('victory')], 0);
  hv.update([realHand('victory')], 400);
  hv.update([], 550);                                      // 150 ms drop: forgiven
  assert.equal(hv.update([realHand('victory')], 600).holding, true);
  hv.update([], 700);
  hv.update([], 1000);                                     // 400 ms drop: reset
  const st = hv.update([realHand('victory')], 1100);
  assert.ok(st.progress < 0.05, String(st.progress));
});

test('HoldVerifier exposes didactic feedback for the wrong handshape', () => {
  const hv = new C.HoldVerifier({ recognizer: rec(), signId: 'v' });
  let st;
  for (let t = 0; t < 2000; t += 100) st = hv.update([realHand('pointing_up')], t);
  assert.equal(st.done, false);
  assert.ok(st.feedback.some((m) => /medio/.test(m)), st.feedback.join(' | '));
});
