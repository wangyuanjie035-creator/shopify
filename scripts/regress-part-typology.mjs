#!/usr/bin/env node
/**
 * 按零件分型做批量回归
 *
 * Usage:
 *   node scripts/regress-part-typology.mjs
 *   node scripts/regress-part-typology.mjs --json
 *
 * 对标集：scripts/fixtures/regression-parts.json
 * STEP 特征走 analyze-step-features；四单成本走 .tmp_quote_batch.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { estimateQuote } from '../utils/quote-engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FIXTURE = path.join(__dirname, 'fixtures', 'regression-parts.json');
const BATCH = path.join(ROOT, '.tmp_quote_batch.json');
const API = process.env.QUOTE_API_BASE || 'https://shopify-13s4.vercel.app/api';
const asJson = process.argv.includes('--json');

function round(n, d = 1) {
  const p = 10 ** d;
  return Math.round(n * p) / p;
}

async function analyzeStep(stepPath, fileName) {
  const abs = path.resolve(ROOT, stepPath);
  const buf = fs.readFileSync(abs);
  const resp = await fetch(`${API}/analyze-step-features`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: fileName || path.basename(stepPath),
      fileData: buf.toString('base64'),
      fileType: 'application/step',
    }),
  });
  if (!resp.ok) {
    throw new Error(`analyze failed ${resp.status} for ${stepPath}`);
  }
  const data = await resp.json();
  if (!data.features) throw new Error(`no features for ${stepPath}`);
  return data.features;
}

function loadBatchByName() {
  if (!fs.existsSync(BATCH)) return new Map();
  const rows = JSON.parse(fs.readFileSync(BATCH, 'utf8'));
  return new Map(rows.map((r) => [r.name, r]));
}

function pickCompare(quote, field) {
  if (field === 'manufacturingSubtotal') return quote.breakdown.manufacturingSubtotal;
  return quote.unitPrice;
}

async function resolveQuoteInput(part, batchMap) {
  if (part.synthetic) {
    return {
      material: part.material,
      finishing: part.finishing,
      quantity: part.quantity ?? 1,
      pricingTier: part.pricingTier,
      workpiece: part.synthetic.workpiece,
      features: part.synthetic.features,
    };
  }
  if (part.batchName) {
    const row = batchMap.get(part.batchName);
    if (!row) throw new Error(`batch missing: ${part.batchName}`);
    return {
      material: part.material || row.material,
      finishing: part.finishing ?? row.finishing ?? '无',
      quantity: part.quantity ?? 1,
      pricingTier: part.pricingTier || 'standard',
      features: row.features,
      workpiece: row.workpiece || row.features?.workpiece,
    };
  }
  if (part.stepPath) {
    const features = await analyzeStep(part.stepPath, `${part.id}.step`);
    return {
      material: part.material,
      finishing: part.finishing,
      quantity: part.quantity ?? 1,
      pricingTier: part.pricingTier,
      features,
    };
  }
  throw new Error(`part ${part.id} has no data source`);
}

async function main() {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const batchMap = loadBatchByName();
  const rows = [];

  for (const part of fixture.parts) {
    if (part.skip) {
      rows.push({
        id: part.id,
        name: part.name,
        source: part.source,
        skipped: true,
        skipReason: part.skipReason || 'skipped',
        typologyExpected: part.typologyExpected,
        target: part.targetPrice,
      });
      continue;
    }
    try {
      const input = await resolveQuoteInput(part, batchMap);
      const quote = estimateQuote(input);
      const estimated = pickCompare(quote, part.compareField || 'unitPrice');
      const errPct = ((estimated - part.targetPrice) / part.targetPrice) * 100;
      const typology = quote.breakdown.partTypology;
      const typologyOk = !part.typologyExpected || typology === part.typologyExpected
        || (part.typologyExpected === 'standard' && ['standard', 'low-removal-standard'].includes(typology));

      rows.push({
        id: part.id,
        name: part.name,
        source: part.source,
        typology,
        typologyLabel: quote.breakdown.partTypologyLabel,
        typologyExpected: part.typologyExpected,
        typologyOk,
        target: part.targetPrice,
        estimated: round(estimated, 2),
        errPct: round(errPct, 1),
        unitPrice: quote.unitPrice,
        manufacturing: quote.breakdown.manufacturingSubtotal,
        compareField: part.compareField || 'unitPrice',
        complexity: quote.breakdown.partComplexity,
        holes: quote.features.holeCount,
        removal: quote.geometry.removalCm3,
        volume: quote.geometry.volumeCm3,
      });
    } catch (err) {
      rows.push({
        id: part.id,
        name: part.name,
        source: part.source,
        error: err.message,
        typologyExpected: part.typologyExpected,
        target: part.targetPrice,
      });
    }
  }

  const okRows = rows.filter((r) => r.errPct != null);
  const mape = okRows.length
    ? okRows.reduce((s, r) => s + Math.abs(r.errPct), 0) / okRows.length
    : null;

  const byType = {};
  for (const r of okRows) {
    const key = r.typology || 'unknown';
    if (!byType[key]) byType[key] = { n: 0, abs: 0, rows: [] };
    byType[key].n += 1;
    byType[key].abs += Math.abs(r.errPct);
    byType[key].rows.push(r.id);
  }

  const typologyMiss = rows.filter((r) => r.typologyOk === false);

  if (asJson) {
    console.log(JSON.stringify({ mape, byType, typologyMiss, rows }, null, 2));
    return;
  }

  console.log('=== 零件分型批量回归 ===\n');
  console.log('id | name | typology | target | estimated | err% | ok分型');
  console.log('---|---|---|---:|---:|---:|---');
  for (const r of rows) {
    if (r.error) {
      console.log(`${r.id} | ${r.name} | ERROR | ${r.target} | - | - | ${r.error}`);
      continue;
    }
    if (r.skipped) {
      console.log(`${r.id} | ${r.name} | SKIP | ${r.target} | - | - | ${r.skipReason}`);
      continue;
    }
    const flag = Math.abs(r.errPct) <= 25 ? '✅' : Math.abs(r.errPct) <= 40 ? '⚠️' : '❌';
    const tOk = r.typologyOk ? 'Y' : `N(期望${r.typologyExpected})`;
    console.log(
      `${r.id} | ${r.name} | ${r.typologyLabel || r.typology} | ${r.target} | ${r.estimated} | ${flag}${r.errPct}% | ${tOk}`,
    );
  }

  console.log(`\n整体 MAPE: ${mape != null ? `${round(mape, 1)}%` : 'n/a'}  (n=${okRows.length})`);
  console.log('\n按分型 MAPE:');
  for (const [k, v] of Object.entries(byType)) {
    console.log(`  ${k}: ${round(v.abs / v.n, 1)}%  (n=${v.n})  [${v.rows.join(', ')}]`);
  }
  if (typologyMiss.length) {
    console.log('\n分型不符:');
    for (const r of typologyMiss) {
      console.log(`  ${r.id}: got=${r.typology} expected=${r.typologyExpected}`);
    }
  }

  const platform = okRows.filter((r) => r.source === 'platform');
  const cost = okRows.filter((r) => r.source === 'cost-order');
  if (platform.length) {
    const pm = platform.reduce((s, r) => s + Math.abs(r.errPct), 0) / platform.length;
    console.log(`\n平台零售件 MAPE: ${round(pm, 1)}% (n=${platform.length})`);
  }
  if (cost.length) {
    const cm = cost.reduce((s, r) => s + Math.abs(r.errPct), 0) / cost.length;
    console.log(`成本四单 MAPE: ${round(cm, 1)}% (n=${cost.length})  [pricingTier=standard]`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
