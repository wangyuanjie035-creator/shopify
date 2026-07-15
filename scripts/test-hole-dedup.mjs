#!/usr/bin/env node
/**
 * Test hole deduplication against Palmetto raw features.json shape.
 *
 * Usage:
 *   node scripts/test-hole-dedup.mjs path/to/features.json
 *   node scripts/test-hole-dedup.mjs --carriage-docker
 */

import fs from 'fs';
import { deduplicateHoles } from '../utils/hole-deduplication.js';

function mapRawHole(raw) {
  const params = raw.params || {};
  const subtype = raw.subtype || '';
  let featureType = 'hole_simple';
  if (subtype === 'counterbored') featureType = 'hole_counterbored';

  const properties = {};
  if (params.diameter_mm != null) properties.diameter = params.diameter_mm;
  if (params.depth_mm != null) properties.depth = params.depth_mm;
  if (params.is_through != null) properties.is_through = params.is_through;
  if (params.bore_count != null) properties.bore_count = params.bore_count;
  if (params.axis_x != null) {
    properties.axis = [params.axis_x, params.axis_y, params.axis_z];
  }

  return {
    feature_id: raw.id,
    feature_type: featureType,
    confidence: raw.confidence,
    face_ids: raw.faces || [],
    properties,
  };
}

function normalizeHole(feature) {
  const props = feature.properties || {};
  return {
    id: feature.feature_id,
    type: feature.feature_type,
    confidence: props.confidence ?? feature.confidence,
    diameter: props.diameter,
    depth: props.depth,
    isThrough: props.is_through === 1 || props.is_through === true,
    axis: props.axis,
    boreCount: props.bore_count,
    faceIds: feature.face_ids || [],
  };
}

async function loadCarriageFromDocker() {
  const { execSync } = await import('child_process');
  const json = execSync(
    'docker exec palmetto-dev cat /tmp/quote_batch/out_carriage/features.json',
    { encoding: 'utf8' },
  );
  return JSON.parse(json);
}

async function main() {
  const arg = process.argv[2];
  let featuresJson;

  if (arg === '--carriage-docker') {
    featuresJson = await loadCarriageFromDocker();
  } else if (!arg) {
    console.error('Usage: node scripts/test-hole-dedup.mjs <features.json> | --carriage-docker');
    process.exit(1);
  } else {
    featuresJson = JSON.parse(fs.readFileSync(arg, 'utf8'));
  }

  const rawHoles = (featuresJson.features || []).filter((f) => f.type === 'hole');
  const holes = rawHoles.map((raw) => normalizeHole(mapRawHole(raw)));
  const { holes: deduped, stats } = deduplicateHoles(holes);

  const counterbored = deduped.filter((h) => h.type === 'hole_counterbored').length;

  console.log('=== Hole deduplication ===');
  console.log('Raw count:', stats.rawCount);
  console.log('Deduped count:', stats.dedupedCount);
  console.log('Merged away:', stats.mergedAway);
  console.log('Counterbored after dedup:', counterbored);
  console.log('Axis missing:', stats.axisMissingCount);
  console.log('Unresolved pair candidates:', stats.unresolvedPairCandidates);
  console.log('\nExpected (Carriage ground truth): total=32, counterbored=20');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
