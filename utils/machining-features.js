import { buildHoleReviewReasons, deduplicateHoles } from './hole-deduplication.js';

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
    axisOrigin: normalizeVector(props.axisOrigin),
    center: normalizeVector(props.center),
    countersinkDiameter: roundNumber(props.countersink_diameter),
    countersinkAngle: roundNumber(props.countersink_angle),
    counterboreDiameter: roundNumber(props.counterbore_diameter ?? props.max_diameter),
    boreCount: roundNumber(props.bore_count, 0),
    faceIds: feature.face_ids || [],
    deduped: false,
    mergedFrom: [feature.feature_id],
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

export function extractWorkpieceGeometryFromAag(aagData) {
  const solids = aagData?.assembly_info?.solids || [];
  if (!solids.length) return null;

  let totalVolume = 0;
  let totalSurfaceArea = 0;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (const solid of solids) {
    if (typeof solid.volume === 'number' && !Number.isNaN(solid.volume)) {
      totalVolume += solid.volume;
    }
    if (typeof solid.surface_area === 'number' && !Number.isNaN(solid.surface_area)) {
      totalSurfaceArea += solid.surface_area;
    }

    const bbox = solid.bbox;
    if (!bbox?.min || !bbox?.max) continue;

    minX = Math.min(minX, bbox.min[0]);
    minY = Math.min(minY, bbox.min[1]);
    minZ = Math.min(minZ, bbox.min[2]);
    maxX = Math.max(maxX, bbox.max[0]);
    maxY = Math.max(maxY, bbox.max[1]);
    maxZ = Math.max(maxZ, bbox.max[2]);
  }

  if (!Number.isFinite(minX)) return null;

  const lengthX = maxX - minX;
  const lengthY = maxY - minY;
  const lengthZ = maxZ - minZ;
  const sortedDims = [lengthX, lengthY, lengthZ].sort((a, b) => b - a);

  return {
    bbox: {
      min: [roundNumber(minX), roundNumber(minY), roundNumber(minZ)],
      max: [roundNumber(maxX), roundNumber(maxY), roundNumber(maxZ)],
    },
    dimensions: {
      length: roundNumber(sortedDims[0]),
      width: roundNumber(sortedDims[1]),
      height: roundNumber(sortedDims[2]),
      axisX: roundNumber(lengthX),
      axisY: roundNumber(lengthY),
      axisZ: roundNumber(lengthZ),
    },
    volumeMm3: roundNumber(totalVolume),
    surfaceAreaMm2: roundNumber(totalSurfaceArea),
    bboxVolumeMm3: roundNumber(lengthX * lengthY * lengthZ),
    solidCount: solids.length,
    isAssembly: aagData?.assembly_info?.is_assembly === true || solids.length > 1,
    source: 'palmetto_aag',
  };
}

export function buildWorkpieceGeometryFromPreview(dimensions) {
  if (!dimensions) return null;

  const width = roundNumber(Number(dimensions.width));
  const height = roundNumber(Number(dimensions.height));
  const depth = roundNumber(Number(dimensions.depth));
  if (width == null || height == null || depth == null) return null;

  const sortedDims = [width, height, depth].sort((a, b) => b - a);

  return {
    dimensions: {
      length: sortedDims[0],
      width: sortedDims[1],
      height: sortedDims[2],
      axisX: width,
      axisY: height,
      axisZ: depth,
    },
    bboxVolumeMm3: roundNumber(width * height * depth),
    source: 'o3dv_preview',
  };
}

function formatWorkpieceDimensions(workpiece) {
  const dims = workpiece?.dimensions;
  if (!dims) return null;
  const parts = [dims.length, dims.width, dims.height].filter((v) => v != null);
  if (parts.length !== 3) return null;
  return `${parts[0]} x ${parts[1]} x ${parts[2]} mm`;
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

export function buildFeatureInsights(buckets, topology, holeDedupStats = null) {
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
      rawCount: holeDedupStats?.rawCount ?? buckets.holes.length,
      dedupedCount: holeDedupStats?.dedupedCount ?? buckets.holes.length,
      mergedAway: holeDedupStats?.mergedAway ?? 0,
      axisMissingCount: holeDedupStats?.axisMissingCount ?? 0,
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

function buildReviewReasons({ upload, buckets, recognizerErrors, holeDedupStats }) {
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

  for (const reason of buildHoleReviewReasons(holeDedupStats)) {
    if (!reasons.includes(reason)) reasons.push(reason);
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

  const workpiece = features.workpiece;
  if (workpiece) {
    push('工件尺寸', formatWorkpieceDimensions(workpiece));
    if (workpiece.volumeMm3 != null) {
      push('工件体积', `${workpiece.volumeMm3} mm³`);
    }
    if (workpiece.bboxVolumeMm3 != null) {
      push('包络体积', `${workpiece.bboxVolumeMm3} mm³`);
    }
    if (workpiece.surfaceAreaMm2 != null) {
      push('工件表面积', `${workpiece.surfaceAreaMm2} mm²`);
    }
    if (workpiece.isAssembly) {
      push('实体数量', String(workpiece.solidCount ?? 1));
    }
    if (workpiece.source) {
      push('几何数据来源', workpiece.source === 'palmetto_aag' ? 'Palmetto CAD' : '3D预览估算');
    }
  }

  const topo = insights.topology;
  if (topo.faceCount != null) push('模型面数', String(topo.faceCount));
  if (topo.edgeCount != null) push('模型边数', String(topo.edgeCount));
  if (topo.triangleCount != null) push('网格三角面数', String(topo.triangleCount));

  push('孔径范围', formatRange(insights.holes.diameter));
  push('孔尺寸分布', insights.holes.sizeBreakdown);
  if (insights.holes.mergedAway > 0) {
    push('孔识别原始数', String(insights.holes.rawCount));
    push('孔去重合并数', String(insights.holes.mergedAway));
  }
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
  aag,
  previewDimensions,
  fileSizeBytes,
}) {
  const buckets = collectFeatures(analysis.results || []);
  const holeDedup = deduplicateHoles(buckets.holes);
  buckets.holes = holeDedup.holes;

  const recognizerErrors = analysis.errors || [];
  const reviewReasons = buildReviewReasons({
    upload,
    buckets,
    recognizerErrors,
    holeDedupStats: holeDedup.stats,
  });

  let status = 'ok';
  if (recognizerErrors.length > 0) {
    status = buckets.holes.length || buckets.cavities.length ? 'partial' : 'failed';
  }
  if (reviewReasons.includes('no_machining_features_detected') && status === 'ok') {
    status = 'partial';
  }

  const topology = upload?.topology_stats || null;
  const insights = buildFeatureInsights(buckets, topology, holeDedup.stats);
  const workpiece = extractWorkpieceGeometryFromAag(aag)
    || buildWorkpieceGeometryFromPreview(previewDimensions);

  return {
    schemaVersion: '1.4',
    status,
    statusLabel: statusLabel(status),
    fileName,
    fileSizeBytes: fileSizeBytes ?? upload?.file_size_bytes ?? null,
    modelId: upload?.model_id || analysis.modelId || null,
    analyzedAt: new Date().toISOString(),
    executionMs: analysis.executionMs ?? null,
    topology,
    workpiece,
    summary: {
      holeCount: buckets.holes.length,
      holeCountRaw: holeDedup.stats.rawCount,
      holesMergedAway: holeDedup.stats.mergedAway,
      shaftCount: buckets.shafts.length,
      filletCount: buckets.fillets.length,
      cavityCount: buckets.cavities.length,
      otherFeatureCount: buckets.other.length,
      workpieceVolumeMm3: workpiece?.volumeMm3 ?? null,
      bboxVolumeMm3: workpiece?.bboxVolumeMm3 ?? null,
    },
    holeDedup: holeDedup.stats,
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
    workpiece: features.workpiece
      ? {
          dimensions: features.workpiece.dimensions,
          volumeMm3: features.workpiece.volumeMm3,
          bboxVolumeMm3: features.workpiece.bboxVolumeMm3,
          source: features.workpiece.source,
        }
      : undefined,
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
