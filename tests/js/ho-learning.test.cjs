// Saving results from the gesture modules (REQ-005): profiles, grades, Recorder.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const L = require(path.join(__dirname, '../../app/static/js/ho-learning.js'));

test('names are compared ignoring case, accents form and extra spaces', () => {
  assert.equal(L.normalizeName('  Ana   García '), 'Ana García');
  assert.ok(L.sameName('ANA GARCÍA', 'ana  garcía'));
  assert.ok(L.sameName('José', 'José'));            // NFC vs decomposed accent
  assert.ok(!L.sameName('Ana', 'Anabel'));
});

test('rememberIn keeps the most recent profile first, without duplicates, max 8', () => {
  let list = [];
  for (let i = 0; i < 10; i++) list = L.rememberIn(list, { id: 'id' + i, name: 'Estudiante ' + i });
  assert.equal(list.length, 8);
  assert.equal(list[0].id, 'id9');
  list = L.rememberIn(list, { id: 'id5', display_name: 'Estudiante 5' });
  assert.deepEqual(list.slice(0, 2).map((p) => p.id), ['id5', 'id9']);
  assert.equal(list.filter((p) => p.id === 'id5').length, 1);
  // Same name with a new id (profile recreated after a DB reset) replaces the old entry.
  list = L.rememberIn(list, { id: 'nuevo', name: 'estudiante 9' });
  assert.equal(list.filter((p) => L.sameName(p.name, 'Estudiante 9')).length, 1);
  assert.equal(L.findProfile(list, 'ESTUDIANTE 9').id, 'nuevo');
  assert.equal(L.findProfile(list, 'Nadie'), null);
});

test('letterGrade uses the 90/70/50 bands of the games', () => {
  assert.deepEqual([1, 0.9, 0.89, 0.7, 0.5, 0.49, 0].map(L.letterGrade), ['A', 'A', 'B', 'B', 'C', 'D', 'D']);
});

// ── Recorder against a fake fetch + localStorage ─────────────────────────────
function fakeEnv(t, { failSessions = false } = {}) {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  const calls = [];
  let nextLearner = 1;
  globalThis.fetch = async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, method: init.method, body, keepalive: init.keepalive });
    const json = (status, data) => ({ ok: status < 400, status, statusText: '', json: async () => data });
    if (url === '/api/learners') return json(201, { id: 'L' + nextLearner++, display_name: body.display_name });
    if (url.startsWith('/api/learners/')) return json(404, { detail: 'Estudiante no encontrado' });
    if (url === '/api/sessions') return failSessions ? json(500, { detail: 'boom' }) : json(201, { id: 'S1' });
    return json(200, { ok: true });
  };
  t.after(() => { delete globalThis.fetch; delete globalThis.localStorage; });
  return { calls, store };
}

test('Recorder creates the learner, the session, sends attempts and finishes', async (t) => {
  const { calls } = fakeEnv(t);
  const r = new L.Recorder('motivasign', 'challenge', 'gestos');
  r.start('  Ana ');
  const res = await r.finish({ score: 7, max_score: 10 }, [{ sign_id: 'uno', correct: true }], { keepalive: true });
  assert.equal(res.saved, true);
  assert.equal(res.learner.name, 'Ana');
  assert.deepEqual(calls.map((c) => c.method + ' ' + c.url), [
    'POST /api/learners', 'POST /api/sessions', 'POST /api/sessions/S1/attempts', 'POST /api/sessions/S1/finish']);
  assert.deepEqual(calls[1].body, { learner_id: 'L1', module: 'motivasign', activity: 'challenge', language: 'gestos' });
  assert.equal(calls[3].keepalive, true);
  assert.equal(L.current().id, 'L1');                     // shared with the Aula
});

test('a stored profile that no longer exists on the server is recreated', async (t) => {
  const { calls } = fakeEnv(t);
  L.remember({ id: 'viejo', name: 'Luis' });
  const learner = await L.ensureLearner('luis');
  assert.equal(learner.id, 'L1');
  assert.deepEqual(calls.map((c) => c.url), ['/api/learners/viejo', '/api/learners']);
  assert.equal(L.profiles().filter((p) => L.sameName(p.name, 'Luis')).length, 1);
});

test('attempts are not sent without a language; failures are reported, not thrown', async (t) => {
  const { calls } = fakeEnv(t);
  const r = new L.Recorder('gestiedu', 'quiz');
  r.start('Ana');
  await r.finish({ score: 1, max_score: 10 }, [{ sign_id: 'x', correct: true }]);
  assert.ok(!calls.some((c) => c.url.endsWith('/attempts')));

  const env2 = fakeEnv(t, { failSessions: true });
  const r2 = new L.Recorder('gestiedu', 'quiz');
  r2.start('Ana');
  const res = await r2.finish({ score: 1, max_score: 10 });
  assert.equal(res.saved, false);
  assert.equal(res.error.message, 'boom');
  assert.ok(!env2.calls.some((c) => c.url.endsWith('/finish')));

  const res3 = await new L.Recorder('gestiedu', 'quiz').finish({ score: 0 });   // never started
  assert.equal(res3.saved, false);
});
