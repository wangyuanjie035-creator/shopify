#!/usr/bin/env node

/**
 * 本地验证 Palmetto 特征识别链路
 *
 * 用法：
 *   PALMETTO_SERVICE_URL=http://localhost:8000 node scripts/test-palmetto-features.mjs path/to/model.step
 *
 * 或指定 Vercel 代理：
 *   API_BASE=https://shopify-v587.vercel.app/api node scripts/test-palmetto-features.mjs path/to/model.step --via-api
 */

import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const viaApi = args.includes('--via-api');
const fileArg = args.find((arg) => !arg.startsWith('--'));

if (!fileArg) {
  console.error('Usage: node scripts/test-palmetto-features.mjs <file.step> [--via-api]');
  process.exit(1);
}

const filePath = path.resolve(fileArg);
const fileName = path.basename(filePath);
const fileBuffer = fs.readFileSync(filePath);

async function runDirect() {
  const { analyzeStepInput } = await import('../utils/palmetto-client.js');
  const { normalizeMachiningFeatures } = await import('../utils/machining-features.js');

  const raw = await analyzeStepInput({
    fileName,
    fileData: fileBuffer.toString('base64'),
    cleanupModel: true,
  });

  return normalizeMachiningFeatures({
    fileName,
    upload: raw.upload,
    analysis: raw.analysis,
    aag: raw.aag,
    fileSizeBytes: raw.fileSizeBytes,
  });
}

async function runViaApi() {
  const apiBase = (process.env.API_BASE || 'http://localhost:3000/api').replace(/\/$/, '');
  const response = await fetch(`${apiBase}/analyze-step-features`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName,
      fileData: fileBuffer.toString('base64'),
    }),
  });

  const json = await response.json();
  if (!response.ok || !json.success) {
    throw new Error(json.message || `API failed (${response.status})`);
  }

  return json.features;
}

async function main() {
  console.log(`Analyzing: ${fileName}`);
  console.log(`Mode: ${viaApi ? 'via API' : 'direct Palmetto'}`);

  const features = viaApi ? await runViaApi() : await runDirect();

  console.log('\n=== Feature Analysis Result ===');
  console.log(JSON.stringify(features, null, 2));
  console.log('\nSummary:', features.summary);
  console.log('Workpiece:', features.workpiece);
  console.log('Status:', features.status);
  console.log('Requires manual review:', features.requiresManualReview);
  if (features.reviewReasons.length > 0) {
    console.log('Review reasons:', features.reviewReasons.join(', '));
  }
}

main().catch((error) => {
  console.error('Test failed:', error.message);
  process.exit(1);
});
