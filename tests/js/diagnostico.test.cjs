'use strict';
const test = require('node:test');
const assert = require('node:assert');
const D = require('../../app/static/js/diagnostico.js');

const UA = {
  chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0',
  firefoxOld: 'Mozilla/5.0 (X11; Linux x86_64; rv:102.0) Gecko/20100101 Firefox/102.0',
  safari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  chromebook: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.0 Safari/537.36',
};

test('parseUA recognises browser, version and OS', () => {
  assert.deepStrictEqual(D.parseUA(UA.chrome), { name: 'Chrome', version: 130, os: 'Windows', label: 'Chrome 130' });
  assert.strictEqual(D.parseUA(UA.edge).label, 'Edge 129');
  assert.strictEqual(D.parseUA(UA.safari).label, 'Safari 17.4');
  assert.strictEqual(D.parseUA(UA.safari).os, 'macOS');
  assert.strictEqual(D.parseUA(UA.chromebook).os, 'ChromeOS');
  assert.strictEqual(D.parseUA('curl/8').name, null);
});

test('browserIssue flags old or unknown browsers', () => {
  assert.strictEqual(D.browserIssue(D.parseUA(UA.chrome)), null);
  assert.strictEqual(D.browserIssue(D.parseUA(UA.firefoxOld)), 'browser_old');
  assert.strictEqual(D.browserIssue(D.parseUA(UA.chromebook)), 'browser_old');
  assert.strictEqual(D.browserIssue(D.parseUA('x')), 'browser_unknown');
});

test('cameraStatus maps getUserMedia errors', () => {
  assert.strictEqual(D.cameraStatus({ name: 'NotAllowedError' }), 'denied');
  assert.strictEqual(D.cameraStatus({ name: 'NotFoundError' }), 'missing');
  assert.strictEqual(D.cameraStatus({ name: 'NotReadableError' }), 'busy');
  assert.strictEqual(D.cameraStatus(new Error('?')), 'error');
});

const good = () => ({
  secure: true, inIframe: false, browser: D.parseUA(UA.chrome), wasm: true, webgl: true, storage: true,
  server: true, camera: 'ok', videoWidth: 640, videoHeight: 480, engine: 'browser', device: 'GPU',
  loadMs: 3000, fps: 28, handSeen: true,
});

test('evaluate: a good computer is ready', () => {
  assert.deepStrictEqual(D.evaluate(good()), { verdict: 'ok', issues: [] });
});

test('evaluate: speed thresholds', () => {
  assert.deepStrictEqual(D.evaluate({ ...good(), fps: 10 }), { verdict: 'warn', issues: ['slow'] });
  assert.deepStrictEqual(D.evaluate({ ...good(), fps: 5 }), { verdict: 'fail', issues: ['too_slow'] });
  assert.strictEqual(D.evaluate({ ...good(), fps: D.FPS_GOOD }).verdict, 'ok');
});

test('evaluate: camera problems fail and skip engine checks', () => {
  const r = { ...good(), camera: 'busy', engine: undefined, fps: undefined, handSeen: undefined };
  assert.deepStrictEqual(D.evaluate(r), { verdict: 'fail', issues: ['camera_busy'] });
  assert.deepStrictEqual(D.evaluate({ ...r, secure: false, camera: 'insecure' }).issues, ['insecure_context']);
});

test('evaluate: failures are listed before warnings', () => {
  const ev = D.evaluate({ ...good(), storage: false, engine: 'none', fps: null, handSeen: null });
  assert.deepStrictEqual(ev, { verdict: 'fail', issues: ['engine_failed', 'storage_blocked'] });
});

test('evaluate: server engine, slow load, no hand, low resolution warn', () => {
  const ev = D.evaluate({ ...good(), engine: 'server', loadMs: 30000, handSeen: false, videoHeight: 240 });
  assert.strictEqual(ev.verdict, 'warn');
  assert.deepStrictEqual(ev.issues.sort(), ['camera_low_res', 'engine_server', 'no_hand', 'slow_load']);
});

test('every issue code has level, title and fix', () => {
  for (const [code, [level, title, fix]] of Object.entries(D.ISSUES)) {
    assert.ok(['fail', 'warn'].includes(level), code);
    assert.ok(title && fix, code);
    assert.match(code, /^[a-z_]{1,40}$/);
  }
});

test('report and summary line', () => {
  const r = good();
  const ev = D.evaluate(r);
  const body = D.report(r, ev, { room: 'Lab 2', station: 'PC-07' });
  assert.deepStrictEqual(body, {
    room: 'Lab 2', station: 'PC-07', verdict: 'ok', browser: 'Chrome 130', os: 'Windows', camera: 'ok',
    camera_res: '640x480', engine: 'browser', device: 'GPU', load_ms: 3000, fps: 28, hand_seen: true, issues: [],
  });
  const line = D.summaryLine(r, ev, { room: 'Lab 2', station: 'PC-07' });
  assert.match(line, /^Lab 2 \/ PC-07 · ✔ Listo · Chrome 130 · cámara 640×480 · motor GPU · 28 cuadros\/s$/);
  const failed = { ...r, camera: 'denied', engine: undefined, fps: undefined };
  assert.match(D.summaryLine(failed, D.evaluate(failed), {}), /^Equipo · ✗ No apto · .*cámara: denied.*avisos: camera_denied/);
});
