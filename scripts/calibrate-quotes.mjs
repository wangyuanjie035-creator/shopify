#!/usr/bin/env node
/**
 * 用 4 单历史订单验证 quote-engine 系数
 *
 * Usage:
 *   node scripts/calibrate-quotes.mjs
 *   node scripts/calibrate-quotes.mjs path/to/benchmark.json
 */

import fs from 'fs';
import path from 'path';
import { estimateQuote } from '../utils/quote-engine.js';

const batchPath = process.argv[2]
  || path.resolve('scripts/../.tmp_quote_batch.json');

function main() {
  const batch = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
  console.log('Benchmark:', batchPath);
  console.log('');

  console.log('name | actual | estimated | err% | auto | vol | removal | mass | holes');
  console.log('---');

  let mape = 0;
  for (const item of batch) {
    const quote = estimateQuote({
      features: item.features,
      workpiece: item.workpiece || item.features?.workpiece,
      material: item.material,
      finishing: item.finishing || '无',
      quantity: 1,
    });

    const errPct = ((quote.unitPrice - item.price) / item.price) * 100;
    mape += Math.abs(errPct);
    const g = quote.geometry;
    const f = quote.features;

    console.log(
      `${item.name} | ${item.price} | ${quote.unitPrice} | ${errPct.toFixed(1)}% | `
      + `${quote.autoQuoteEligible ? 'Y' : 'N'} | ${g.volumeCm3 ?? '-'} | ${g.removalCm3 ?? '-'} | `
      + `${g.massG ?? '-'} | ${f.holeCount}`
    );
  }

  console.log(`\nMAPE: ${(mape / batch.length).toFixed(1)}%`);
}

main();
