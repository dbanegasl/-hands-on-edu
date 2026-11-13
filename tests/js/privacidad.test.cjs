'use strict';
const test = require('node:test');
const assert = require('node:assert');
const P = require('../../app/static/js/privacidad.js');

function memoryStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}

test('profilesOnDevice tolerates missing or corrupt storage', () => {
  assert.deepStrictEqual(P.profilesOnDevice(memoryStorage()), []);
  assert.deepStrictEqual(P.profilesOnDevice(memoryStorage({ 'ho.aula.profiles': '{oops' })), []);
  assert.deepStrictEqual(P.profilesOnDevice(memoryStorage({ 'ho.aula.profiles': '{"id":1}' })), []);
  const s = memoryStorage({ 'ho.aula.profiles': JSON.stringify([{ id: 'a', name: 'Ana', token: 't' }, null, { name: 'x' }]) });
  assert.deepStrictEqual(P.profilesOnDevice(s), [{ id: 'a', name: 'Ana', token: 't' }]);
});

test('forgetProfile removes the profile and clears it as current', () => {
  const s = memoryStorage({
    'ho.aula.profiles': JSON.stringify([{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Luis' }]),
    'ho.aula.current': JSON.stringify('a'),
  });
  assert.deepStrictEqual(P.forgetProfile(s, 'a').map((p) => p.id), ['b']);
  assert.strictEqual(s.getItem('ho.aula.current'), null);
  P.forgetProfile(s, 'zzz');
  assert.deepStrictEqual(P.profilesOnDevice(s).map((p) => p.id), ['b']);
});

test('forgetProfile keeps another current profile', () => {
  const s = memoryStorage({
    'ho.aula.profiles': JSON.stringify([{ id: 'a' }, { id: 'b' }]),
    'ho.aula.current': JSON.stringify('b'),
  });
  P.forgetProfile(s, 'a');
  assert.strictEqual(JSON.parse(s.getItem('ho.aula.current')), 'b');
});

test('retentionText', () => {
  assert.strictEqual(P.retentionText(0), null);
  assert.strictEqual(P.retentionText(null), null);
  assert.strictEqual(P.retentionText(365), 'un año');
  assert.strictEqual(P.retentionText(730), '2 años');
  assert.strictEqual(P.retentionText(90), '90 días');
});
