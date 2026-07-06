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

const DEEP_CAVITY_MM = 10;
const NARROW_OPENING_MM = 5;
const SMALL_HOLE_MM = 3;
const LARGE_HOLE_MM = 10;

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
  const depth = roundNumber(props.depth);
  return {
    id: feature.feature_id,
    type: feature.feature_type,
    confidence: roundNumber(feature.confidence, 4),
    diameter: roundNumber(props.diameter),
    depth,
    depthSource: depth != null ? 'hole_recognizer_axial' : null,
    isThrough: props.is_through === 1 || props.is_through === true,
    axis: normalizeVector(props.axis),
    center: normalizeVector(props.center),
    countersinkDiameter: roundNumber(props.countersink_diameter),
    countersinkAngle: roundNumber(props.countersink_angle),
    boreCount: roundNumber(props.bore_count, 0),
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
  const floorArea = roundNumber(props.floor_area);
  const volume = roundNumber(props.volume);
  const engineDepth = roundNumber(props.depth);
  let depth = engineDepth;
  let depthSource = engineDepth != null ? 'pocket_depth_analyzer' : null;

  if (depth == null && floorArea && volume && floorArea > 0) {
    depth = roundNumber(volume / floorArea);
    depthSource = 'volume_ratio_estimate';
  }

  const openingSize = roundNumber(props.opening_diameter)
    ?? (floorArea && floorArea > 0 ? roundNumber(Math.sqrt(floorArea)) : null);

  const engineDeep = props.is_deep === 1 || props.is_deep === true;
  const engineNarrow = props.is_narrow === 1 || props.is_narrow === true;

  return {
    id: feature.feature_id,
    type: feature.feature_type,
    confidence: roundNumber(feature.confidence, 4),
    volume,
    depth,
    depthSource,
    floorArea,
    openingSize,
    openingSizeSource: props.opening_diameter != null ? 'pocket_depth_analyzer' : 'area_sqrt_estimate',
    aspectRatio: roundNumber(props.aspect_ratio),
    faceCount: roundNumber(props.face_count, 0),
    isDeep: engineDeep || (depthSource === 'volume_ratio_estimate' && depth != null && depth >= DEEP_CAVITY_MM),
    isNarrow: engineNarrow || (openingSize != null && openingSize < NARROW_OPENING_MM),
    isThrough: props.is_through === 1 || props.is_through === true,
    accessibilityScore: roundNumber(props.accessibility_score, 3),
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

function buildNumericStats(values) {
  const nums = values.filter((v) => typeof v === 'number' && !Number.isNaN(v));
  if (!nums.length) return null;

  nums.sort((a, b) => a - b);
  const sum = nums.reduce((acc, n) => acc + n, 0);

  return {
    min: roundNumber(nums[0]),
    max: roundNumber(nums[nums.length - 1]),
    avg: roundNumber(sum / nums.length),
    count: nums.length,
  };
}

function formatRange(stats, unit = 'mm') {
  if (!stats) return null;
  if (stats.min === stats.max) return `${stats.min} ${unit}`;
  return `${stats.min}–${stats.max} ${unit}`;
}

function buildFilletDistribution(fillets) {
  const groups = new Map();
  for (const fillet of fillets) {
    if (fillet.radius == null) continue;
    const key = String(roundNumber(fillet.radius, 2));
    groups.set(key, (groups.get(key) || 0) + 1);
  }

  const sorted = [...groups.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  if (!sorted.length) return null;

  return sorted.map(([radius, count]) => `R${radius}×${count}`).join(', ');
}

function buildHoleSizeBreakdown(holes) {
  let small = 0;
  let medium = 0;
  let large = 0;

  for (const hole of holes) {
    const d = hole.diameter;
    if (d == null) continue;
    if (d < SMALL_HOLE_MM) small += 1;
    else if (d <= LARGE_HOLE_MM) medium += 1;
    else large += 1;
  }

  const parts = [];
  if (small) parts.push(`小孔(<${SMALL_HOLE_MM}mm)×${small}`);
  if (medium) parts.push(`标准孔×${medium}`);
  if (large) parts.push(`大孔(>${LARGE_HOLE_MM}mm)×${large}`);

  return parts.length ? parts.join(', ') : null;
}

export function buildFeatureInsights(buckets, topology) {
  const holeDiameters = buckets.holes.map((h) => h.diameter).filter((v) => v != null);
  const filletRadii = buckets.fillets.map((f) => f.radius).filter((v) => v != null);
  const cavityDepths = buckets.cavities.map((c) => c.depth).filter((v) => v != null);
  const cavityOpenings = buckets.cavities.map((c) => c.openingSize).filter((v) => v != null);

  const deepCavities = buckets.cavities.filter((c) => c.isDeep);
  const narrowCavities = buckets.cavities.filter((c) => c.isNarrow);
  const counterboredHoles = buckets.holes.filter((h) => h.type === 'hole_counterbored').length;
  const holeDepths = buckets.holes.map((h) => h.depth).filter((v) => v != null);
  const throughHoles = buckets.holes.filter((h) => h.isThrough).length;
  const engineCavityDepths = buckets.cavities.filter((c) => c.depthSource === 'pocket_depth_analyzer');

  return {
    topology: {
      faceCount: topology?.faces ?? null,
      edgeCount: topology?.edges ?? null,
      triangleCount: topology?.triangles ?? null,
      solidCount: topology?.solids ?? null,
    },
    holes: {
      diameter: buildNumericStats(holeDiameters),
      depth: buildNumericStats(holeDepths),
      sizeBreakdown: buildHoleSizeBreakdown(buckets.holes),
      counterboredCount: counterboredHoles,
      throughCount: throughHoles,
      depthAvailable: holeDepths.length > 0,
      depthSource: holeDepths.length > 0 ? 'hole_recognizer_axial' : null,
    },
    fillets: {
      radius: buildNumericStats(filletRadii),
      uniqueRadiusCount: new Set(filletRadii.map((r) => roundNumber(r, 2))).size,
      distribution: buildFilletDistribution(buckets.fillets),
    },
    cavities: {
      count: buckets.cavities.length,
      deepCount: deepCavities.length,
      narrowCount: narrowCavities.length,
      depth: buildNumericStats(cavityDepths),
      openingSize: buildNumericStats(cavityOpenings),
      totalVolume: roundNumber(
        buckets.cavities.reduce((sum, c) => sum + (c.volume || 0), 0)
      ),
      depthSource: engineCavityDepths.length > 0 ? 'pocket_depth_analyzer' : 'volume_ratio_estimate',
    },
  };
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

function statusLabel(status) {
  if (status === 'ok') return '完成';
  if (status === 'partial') return '部分完成';
  if (status === 'failed') return '解析失败';
  return status || '未知';
}

export function buildShopifyDetailAttributes(features) {
  if (!features) return [];

  const attrs = [];
  const { insights, summary } = features;
  if (!insights) return attrs;

  const push = (key, value) => {
    if (value == null || value === '') return;
    const text = String(value);
    attrs.push({ key, value: text.length > 250 ? `${text.slice(0, 247)}...` : text });
  };

  const topo = insights.topology;
  if (topo.faceCount != null) push('模型面数', String(topo.faceCount));
  if (topo.edgeCount != null) push('模型边数', String(topo.edgeCount));
  if (topo.triangleCount != null) push('网格三角面数', String(topo.triangleCount));

  push('孔径范围', formatRange(insights.holes.diameter));
  push('孔尺寸分布', insights.holes.sizeBreakdown);
  if (insights.holes.counterboredCount) {
    push('沉头/台阶孔数', String(insights.holes.counterboredCount));
  }
  if (insights.holes.depthAvailable) {
    push('孔深度范围', formatRange(insights.holes.depth));
    push('孔深度方法', 'Palmetto轴向投影');
  }
  if (insights.holes.throughCount) {
    push('通孔数量', String(insights.holes.throughCount));
  }

  push('圆角半径范围', formatRange(insights.fillets.radius));
  push('圆角规格分布', insights.fillets.distribution);
  if (insights.fillets.uniqueRadiusCount) {
    push('圆角规格种数', String(insights.fillets.uniqueRadiusCount));
  }

  if (summary.cavityCount > 0) {
    push('型腔深度', formatRange(insights.cavities.depth));
    push('型腔深度方法', insights.cavities.depthSource === 'pocket_depth_analyzer'
      ? 'PocketDepthAnalyzer开口平面距离'
      : '体积/面积估算');
    push('型腔开口尺寸', formatRange(insights.cavities.openingSize));
    if (insights.cavities.deepCount) {
      push('深型腔数量', String(insights.cavities.deepCount));
    }
    if (insights.cavities.narrowCount) {
      push('窄型腔数量', String(insights.cavities.narrowCount));
    }
    if (insights.cavities.totalVolume != null) {
      push('型腔总体积', `${insights.cavities.totalVolume} mm³`);
    }
  }

  return attrs;
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

  const topology = upload?.topology_stats || null;
  const insights = buildFeatureInsights(buckets, topology);

  return {
    schemaVersion: '1.2',
    status,
    statusLabel: statusLabel(status),
    fileName,
    fileSizeBytes: fileSizeBytes ?? upload?.file_size_bytes ?? null,
    modelId: upload?.model_id || analysis.modelId || null,
    analyzedAt: new Date().toISOString(),
    executionMs: analysis.executionMs ?? null,
    topology,
    summary: {
      holeCount: buckets.holes.length,
      shaftCount: buckets.shafts.length,
      filletCount: buckets.fillets.length,
      cavityCount: buckets.cavities.length,
      otherFeatureCount: buckets.other.length,
    },
    insights,
    features: buckets,
    recognizerErrors,
    requiresManualReview: reviewReasons.length > 0,
    reviewReasons,
  };
}

export function serializeMachiningFeaturesForShopify(features) {
  const compact = {
    schemaVersion: features.schemaVersion,
    status: features.status,
    summary: features.summary,
    insights: {
      topology: features.insights?.topology,
      holes: {
        diameter: features.insights?.holes?.diameter,
        sizeBreakdown: features.insights?.holes?.sizeBreakdown,
      },
      fillets: {
        radius: features.insights?.fillets?.radius,
        distribution: features.insights?.fillets?.distribution,
      },
      cavities: {
        deepCount: features.insights?.cavities?.deepCount,
        narrowCount: features.insights?.cavities?.narrowCount,
        depth: features.insights?.cavities?.depth,
      },
    },
    requiresManualReview: features.requiresManualReview,
    reviewReasons: features.reviewReasons,
  };

  const json = JSON.stringify(compact);
  return json.length > 250 ? `${json.slice(0, 247)}...` : json;
}
