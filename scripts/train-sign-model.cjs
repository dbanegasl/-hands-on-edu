#!/usr/bin/env node
/**
 * Train and evaluate the sign classifier outside the browser (REQ-010), with
 * exactly the same code the Sign Studio runs (app/static/js/ho-signs-model.js).
 *
 *   node scripts/train-sign-model.cjs                      # evaluate only
 *   node scripts/train-sign-model.cjs --out model.json     # save the model file
 *   ADMIN_TOKEN=… node scripts/train-sign-model.cjs --publish   # publish if it improves
 *
 * Options: --base URL (default http://localhost:9876) · --lang lsec ·
 *          --templates file.json (an exported dataset instead of the server) ·
 *          --force (publish even if not recommended) · --json (print the report as JSON)
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const M = require(path.join(__dirname, '../app/static/js/ho-signs-model.js'));

function args(argv) {
  const out = { base: 'http://localhost:9876', lang: 'lsec' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    if (['publish', 'force', 'json'].includes(key)) out[key] = true;
    else out[key] = argv[++i];
  }
  return out;
}

async function getJSON(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${init && init.method || 'GET'} ${url} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const pct = (v) => (v == null ? '  —  ' : (100 * v).toFixed(1).padStart(5) + '%');

(async () => {
  const o = args(process.argv.slice(2));
  const api = o.base.replace(/\/$/, '') + '/api/signs/' + o.lang;
  const catalog = await getJSON(api + '/catalog');
  let templates;
  if (o.templates) {
    const data = JSON.parse(fs.readFileSync(o.templates, 'utf8'));
    templates = (data.templates || data).map((t, i) => Object.assign({ id: 'file-' + i }, t));
  } else {
    templates = await getJSON(api + '/templates');
  }

  const report = await M.crossValidate(templates, catalog, {});
  const model = await M.trainModel(templates, catalog, { weight: report.best.weight });
  if (o.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Señas: ${report.classes.length} · grabaciones: ${report.templates} · cuadros evaluados: ${report.frames} · particiones: ${report.folds}`);
    console.log('                         sin modelo   con modelo (peso ' + report.best.weight + ')');
    console.log(`Seña correcta aceptada     ${pct(report.baseline.accept)}       ${pct(report.best.accept)}`);
    console.log(`Seña equivocada aceptada   ${pct(report.baseline.false_accept)}       ${pct(report.best.false_accept)}`);
    console.log(`Acierto (1.ª opción)       ${pct(report.baseline.accuracy)}       ${pct(report.best.accuracy)}`);
    for (const p of report.per_sign) console.log(`  ${p.sign_id.padEnd(8)} ${String(p.templates).padStart(3)} grab.  ${pct(p.baseline.accept)} → ${pct(p.model.accept)}`);
    if (report.too_few.length) console.log('Con una sola grabación: ' + report.too_few.join(', '));
    console.log(report.recommended ? '✔ Recomendado: mejora el reconocimiento.' : '✗ No recomendado: no mejora con estos datos.');
  }
  if (o.out) {
    fs.writeFileSync(o.out, JSON.stringify(model) + '\n');
    console.error('Modelo guardado en ' + o.out);
  }
  if (o.publish) {
    if (!report.recommended && !o.force) {
      console.error('No se publica: el modelo no mejora (usa --force para publicarlo igualmente).');
      process.exit(2);
    }
    const headers = { 'Content-Type': 'application/json' };
    if (process.env.ADMIN_TOKEN) headers['X-Admin-Token'] = process.env.ADMIN_TOKEN;
    const saved = await getJSON(api + '/models', {
      method: 'POST', headers, body: JSON.stringify({ model, metrics: report, author: 'scripts/train-sign-model.cjs' }),
    });
    console.error('Publicado y activo: ' + saved.id);
  }
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
