// Regenerate tests/fixtures/sign_model_small.json — a tiny model trained by
// the browser code (ho-signs-model.js), used by tests/test_sign_models.py to
// check the JS ↔ API contract.   node tests/fixtures/gen_sign_model.cjs
const fs = require('node:fs');
const path = require('node:path');
const M = require(path.join(__dirname, '../../app/static/js/ho-signs-model.js'));
const CATALOG = require(path.join(__dirname, '../../app/content/lsec/catalog.json'));
const REAL = require(path.join(__dirname, 'real_hands.json')).images;

const PHOTO = { v: 'victory', num_1: 'pointing_up' };
const rng = M.mulberry32(11);
const templates = [];
for (const [sign, photo] of Object.entries(PHOTO)) {
  for (let t = 0; t < 2; t++) {
    const hand = Object.assign({}, REAL[photo].hands[0], { aspect: REAL[photo].aspect });
    templates.push({ id: sign + t, sign_id: sign, kind: 'static', author: 'fixture',
      frames: [0, 1, 2].map((i) => ({ t: i * 110, hands: [M.augmentHand(hand, rng, { rotationDeg: 5, jitter: 0.005 })] })) });
  }
}
M.trainModel(templates, CATALOG, { hidden: 4, epochs: 5, weight: 0.5 }).then((model) => {
  const out = path.join(__dirname, 'sign_model_small.json');
  fs.writeFileSync(out, JSON.stringify(model) + '\n');
  console.log('wrote', out, Object.keys(model).join(','));
});
