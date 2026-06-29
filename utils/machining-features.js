const HOLE_TYPES = new Set([
  'hole_simple',
  'hole_countersunk',
  'hole_counterbored',
  'hole_threaded',
]);

const CAVITY_TYPES = new Set([
  'cavity_blind',
  'cavity_through',
  'slot',
  'pocket',
]);

function roundNumber(value, digits = 3) {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeVector(vector) {
  if (!Array.isArray(vector) || vector.length !== 3) return null;
  return vector.map((value) => roundNumber(Number(value), 4));
}

function normalizeHole(feature) {
  const props = feature.properties || {};
  return {
    id: feature.feature_id,
    type: feature.feature_type,
    confidence: roundNumber(feature.confidence, 4),
    diameter: roundNumber(props.diameter),
    depth: roundNumber(props.depth),
    isThrough: Boolean(props.is_through),
    axis: normalizeVector(props.axis),
    center: normalizeVector(props.center),
    countersinkDiameter: roundNumber(props.countersink_diameter),
    countersinkAngle: roundNumber(props.countersink_angle),
    faceIds: feature.face_ids || [],
  };
}

function normalizeShaft(feature) {
  const props = feature.properties || {};
  return {
    id: feature.feature_id,
    type: feature.feature_type,
    confidence: roundNumber(feature.confidence, 4),
    diameter: roundNumber(props.diameter),
    length: roundNumber(props.length),
    axis: normalizeVector(props.axis),
    faceIds: feature.face_ids || [],
  };
}

function normalizeFillet(feature) {
  const props = feature.properties || {};
  return {
    id: feature.feature_id,
    type: feature.feature_type,
    confidence: roundNumber(feature.confidence, 4),
    radius: roundNumber(props.radius),
    length: roundNumber(props.length),
    blendType: props.blend_type || null,
    faceIds: feature.face_ids || [],
  };
}

function normalizeCavity(feature) {
  const props = feature.properties || {};
  return {
    id: feature.feature_id,
    type: feature.feature_type,
    confidence: roundNumber(feature.confidence, 4),
    volume: roundNumber(props.volume),
    depth: roundNumber(props.depth),
    floorArea: roundNumber(props.floor_area),
    isThrough: Boolean(props.is_through),
    faceIds: feature.face_ids || [],
  };
}

function collectFeatures(analysisResults) {
  const buckets = {
    holes: [],
    shafts: [],
    fillets: [],
    cavities: [],
    other: [],
  };

  for (const result of analysisResults) {
    const features = result.features || [];
    for (const feature of features) {
      const type = feature.feature_type;
      if (HOLE_TYPES.has(type)) {
        buckets.holes.push(normalizeHole(feature));
      } else if (type === 'shaft') {
        buckets.shafts.push(normalizeShaft(feature));
      } else if (type === 'fillet' || type === 'chamfer') {
        buckets.fillets.push(normalizeFillet(feature));
      } else if (CAVITY_TYPES.has(type)) {
        buckets.cavities.push(normalizeCavity(feature));
      } else {
        buckets.other.push({
          id: feature.feature_id,
          type,
          confidence: roundNumber(feature.confidence, 4),
          properties: feature.properties || {},
          faceIds: feature.face_ids || [],
        });
      }
    }
  }

  return buckets;
}

function buildReviewReasons({ upload, buckets, recognizerErrors }) {
  const reasons = [];
  const solids = upload?.topology_stats?.solids ?? 0;

  if (solids > 1) {
    reasons.push('assembly_or_multi_solid');
  }
  if (recognizerErrors.length > 0) {
    reasons.push('recognizer_errors');
  }
  if (buckets.holes.length === 0 && buckets.cavities.length === 0 && buckets.fillets.length === 0) {
    reasons.push('no_machining_features_detected');
  }

  const lowConfidence = [
    ...buckets.holes,
    ...buckets.shafts,
    ...buckets.fillets,
    ...buckets.cavities,
  ].some((feature) => (feature.confidence ?? 1) < 0.7);

  if (lowConfidence) {
    reasons.push('low_confidence_features');
  }

  return reasons;
}

export function normalizeMachiningFeatures({
  fileName,
  upload,
  analysis,
  fileSizeBytes,
}) {
  const buckets = collectFeatures(analysis.results || []);
  const recognizerErrors = analysis.errors || [];
  const reviewReasons = buildReviewReasons({
    upload,
    buckets,
    recognizerErrors,
  });

  let status = 'ok';
  if (recognizerErrors.length > 0) {
    status = buckets.holes.length || buckets.cavities.length ? 'partial' : 'failed';
  }
  if (reviewReasons.includes('no_machining_features_detected') && status === 'ok') {
    status = 'partial';
  }

  return {
    schemaVersion: '1.0',
    status,
    fileName,
    fileSizeBytes: fileSizeBytes ?? upload?.file_size_bytes ?? null,
    modelId: upload?.model_id || analysis.modelId || null,
    analyzedAt: new Date().toISOString(),
    executionMs: analysis.executionMs ?? null,
    topology: upload?.topology_stats || null,
    summary: {
      holeCount: buckets.holes.length,
      shaftCount: buckets.shafts.length,
      filletCount: buckets.fillets.length,
      cavityCount: buckets.cavities.length,
      otherFeatureCount: buckets.other.length,
    },
    features: buckets,
    recognizerErrors,
    requiresManualReview: reviewReasons.length > 0,
    reviewReasons,
  };
}

export function serializeMachiningFeaturesForShopify(features) {
  const compact = {
    status: features.status,
    summary: features.summary,
    requiresManualReview: features.requiresManualReview,
    reviewReasons: features.reviewReasons,
    holeCount: features.summary.holeCount,
    cavityCount: features.summary.cavityCount,
    filletCount: features.summary.filletCount,
  };

  return JSON.stringify(compact);
}
