#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { estimateQuote } from '../utils/quote-engine.js';

const batch = JSON.parse(fs.readFileSync(process.argv[2] || '.tmp_quote_batch.json', 'utf8'));

function score(rates) {
  let mape = 0;
  const rows = [];
  for (const item of batch) {
    const q = estimateQuote({
      features: item.features,
      workpiece: item.workpiece || item.features?.workpiece,
      material: item.material,
      finishing: item.finishing || '无',
      rates,
    });
    const err = Math.abs((q.unitPrice - item.price) / item.price * 100);
    mape += err;
    rows.push({ name: item.name, price: item.price, est: q.unitPrice, err });
  }
  return { mape: mape / batch.length, rows };
}

let best = { mape: Infinity, rates: null, rows: [] };

for (const hourly of [110, 120, 130, 140, 150]) {
  for (const mrrAl of [6, 8, 10]) {
    for (const mrrBr of [1.5, 1.8, 2, 2.2]) {
      for (const setupStd of [18, 22, 26, 30]) {
        for (const featScale of [0.9, 1.0, 1.1, 1.2]) {
          for (const brassFeat of [1.6, 1.9, 2.2, 2.5]) {
            for (const brassDur of [1.0, 1.15, 1.3]) {
              for (const surcharge of [0.25, 0.32, 0.38, 0.45]) {
                const rates = {
                  machineHourlyCny: hourly,
                  setupMinutesStandard: setupStd,
                  setupMinutesSimple: Math.max(8, Math.round(setupStd * 0.4)),
                  mrrAluminum: mrrAl,
                  mrrBrass: mrrBr,
                  mrrSteel: mrrAl / 3,
                  mrrStainless: mrrAl / 2.5,
                  mrrPlastic: mrrAl * 2,
                  featureTimeScale: featScale,
                  brassFeatureScale: brassFeat,
                  brassDurationFactor: brassDur,
                  largeRemovalThresholdCm3: 40,
                  largeRemovalSurchargePerCm3: surcharge,
                };
                const { mape, rows } = score(rates);
                if (mape < best.mape) best = { mape, rates, rows };
              }
            }
          }
        }
      }
    }
  }
}

console.log('Best MAPE:', best.mape.toFixed(2) + '%');
console.log(JSON.stringify(best.rates, null, 2));
console.log('\nname | target | est | err%');
for (const r of best.rows) {
  console.log(`${r.name} | ${r.price} | ${r.est} | ${((r.est - r.price) / r.price * 100).toFixed(1)}%`);
}
