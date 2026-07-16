#!/usr/bin/env node
/** Refresh .tmp_quote_batch.json workpiece fields via Palmetto AAG */
import fs from 'fs';
import path from 'path';
import { analyzeStepInput } from '../utils/palmetto-client.js';
import { extractWorkpieceGeometryFromAag, normalizeMachiningFeatures } from '../utils/machining-features.js';

const batchPath = path.resolve('.tmp_quote_batch.json');
const batch = JSON.parse(fs.readFileSync(batchPath, 'utf8'));

for (const item of batch) {
  const stepPath = item.path;
  if (!stepPath || !fs.existsSync(stepPath)) {
    console.warn('Skip missing file:', item.name, stepPath);
    continue;
  }

  console.log('\nAnalyzing', item.name, '...');
  const fileBuffer = fs.readFileSync(stepPath);
  const raw = await analyzeStepInput({
    fileName: item.fileName || path.basename(stepPath),
    fileData: fileBuffer.toString('base64'),
    cleanupModel: true,
  });

  const features = normalizeMachiningFeatures({
    fileName: item.fileName,
    upload: raw.upload,
    analysis: raw.analysis,
    aag: raw.aag,
    fileSizeBytes: raw.fileSizeBytes,
  });

  item.features = features;
  item.aag = raw.aag;
  item.workpiece = features.workpiece;
  console.log('  workpiece:', features.workpiece);
}

fs.writeFileSync(batchPath, JSON.stringify(batch, null, 2), 'utf8');
console.log('\nUpdated', batchPath);
