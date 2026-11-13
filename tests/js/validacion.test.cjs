// Interpreter review of signs (/validacion, REQ-023): decision, report, trial timing.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const R = require(path.join(__dirname, '../../app/static/js/validacion.js'));
const CATALOG = require(path.join(__dirname, '../../app/content/lsec/catalog.json'));

const full = (o) => Object.assign({ content_ok: true, recognizable: true, good_ok: 3, good_trials: 3, bad_ok: 0, bad_trials: 3 }, o);

test('decide: all good → ok', () => {
  assert.deepEqual(R.decide(full()), { decision: 'ok', reasons: [] });
});

test('decide: accepting a wrong sign → retirar, even when it is also missed done well', () => {
  const d = R.decide(full({ bad_ok: 1, good_ok: 2 }));
  assert.equal(d.decision, 'retirar');
  assert.deepEqual(d.reasons.map((r) => r.code), ['retirar', 'regrabar']);
  assert.match(d.reasons[0].text, /1 de 3/);
});

test('decide: content errors come first; no templates → regrabar', () => {
  assert.equal(R.decide(full({ content_ok: false, bad_ok: 3 })).decision, 'corregir');
  assert.equal(R.decide(full({ good_ok: 2 })).decision, 'regrabar');
  assert.equal(R.decide({ content_ok: true, recognizable: false, good_ok: 0, good_trials: 0, bad_ok: 0, bad_trials: 0 }).decision, 'regrabar');
});

test('complete: content answered and 3+3 trials, unless content is wrong or not recognizable', () => {
  assert.equal(R.complete(full({ content_ok: null })), false);
  assert.equal(R.complete(full({ bad_trials: 2 })), false);
  assert.equal(R.complete(full()), true);
  assert.equal(R.complete({ content_ok: false, recognizable: true, good_trials: 0, bad_trials: 0 }), true);
  assert.equal(R.complete({ content_ok: true, recognizable: false, good_trials: 0, bad_trials: 0 }), true);
});

test('summarize gives the pilot criteria R1 and R2', () => {
  const rows = [
    full({ decision: 'ok' }),
    full({ good_ok: 2, decision: 'regrabar' }),
    full({ bad_ok: 1, decision: 'retirar' }),
    { content_ok: true, recognizable: false, good_ok: 0, good_trials: 0, bad_ok: 0, bad_trials: 0, decision: 'regrabar' },
    full({ content_ok: false, decision: 'corregir' }),
  ];
  const s = R.summarize(rows);
  assert.equal(s.reviewed, 5);
  assert.deepEqual(s.decisions, { ok: 1, regrabar: 2, corregir: 1, retirar: 1 });
  assert.equal(s.tested, 4);                 // the one without templates is not a recognition test
  assert.equal(s.goodAll, 3);
  assert.equal(s.r1, 0.75);
  assert.equal(s.badAccepted, 1);
  assert.equal(s.contentWrong, 1);
  assert.equal(R.summarize([]).r1, null);
});

test('planSigns: chosen units in catalog order, each sign once, skipping reviewed ones', () => {
  const u1 = CATALOG.units[0];
  const plan = R.planSigns(CATALOG, [u1.id]);
  assert.deepEqual(plan.map((p) => p.sign.id), u1.signs);
  assert.equal(plan[0].unit.id, u1.id);
  assert.deepEqual(R.planSigns(CATALOG, [u1.id], { skip: [u1.signs[0]] }).map((p) => p.sign.id), u1.signs.slice(1));
  const all = R.planSigns(CATALOG, []);
  assert.equal(new Set(all.map((p) => p.sign.id)).size, all.length);
});

test('toCSV: semicolons, BOM, quoting, Spanish yes/no', () => {
  const csv = R.toCSV([Object.assign(full({ decision: 'retirar', bad_ok: 1 }), {
    sign_id: 'a', reviewer: 'Ana', created_at: '2026-11-20T10:00:00', bad_note: 'pulgar; dentro', note: 'dijo "no"',
    engine: { templates: 4, model: 'm1' },
  })], CATALOG);
  assert.ok(csv.startsWith('﻿sena;glosa;unidad;'));
  const line = csv.split('\r\n')[1];
  assert.match(line, /^a;A;Vocales;sí;;sí;3;3;1;3;"pulgar; dentro";retirar;"dijo ""no""";Ana;2026-11-20;4;m1$/);
});

// Fake HoldVerifier: accepted once `okAt` ms of running have passed.
function verifier(okAt) {
  return {
    resets: 0, start: null,
    reset() { this.resets += 1; this.start = null; },
    update(hands, t) {
      if (this.start == null) this.start = t;
      const done = okAt != null && t - this.start >= okAt;
      return { done: done, progress: done ? 1 : 0.5, score: 0.8, feedback: [] };
    },
  };
}

test('Trial: countdown, then accepted when the verifier completes in time', () => {
  const v = verifier(2000);
  const tr = new R.Trial({ verifier: v, timeoutMs: 12000, countdownMs: 3000 });
  assert.equal(tr.start(0).phase, 'countdown');
  assert.equal(tr.update([], 500).countdown, 3);
  assert.equal(tr.update([], 2500).countdown, 1);
  const run = tr.update([], 3000);
  assert.equal(run.phase, 'running');
  assert.equal(v.resets, 1);                 // history cleared when the attempt starts
  assert.equal(tr.update([], 4000).accepted, null);
  const done = tr.update([], 5000);
  assert.equal(done.phase, 'done');
  assert.equal(done.accepted, true);
});

test('Trial: not accepted after the evaluation timeout', () => {
  const tr = new R.Trial({ verifier: verifier(null), timeoutMs: 12000, countdownMs: 0 });
  tr.start(0);
  assert.equal(tr.update([], 11999).phase, 'running');
  const st = tr.update([], 12000);
  assert.equal(st.phase, 'done');
  assert.equal(st.accepted, false);
});
