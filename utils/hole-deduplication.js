/**
 * Post-process Palmetto hole features to remove duplicate detections.
 *
 * Common failure mode: one physical counterbored hole is reported twice
 * (large-diameter segment + small-diameter segment as separate features).
 *
 * Does NOT use counterbore ratio for manual-review — parts may be 100% CSK.
 */

const AXIS_PARALLEL_DOT = 0.99;
const AXIS_LINE_POSITION_EPS = 2.0;
const DIAMETER_PAIR_RATIO = 1.1;
const FACE_ANCHOR_PAIR_MAX = 4;

function roundNumber(value, digits = 3) {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeAxis(axis) {
  if (!Array.isArray(axis) || axis.length !== 3) return null;
  const [x, y, z] = axis.map(Number);
  const len = Math.hypot(x, y, z);
  if (len < 1e-9) return null;

  let nx = x / len;
  let ny = y / len;
  let nz = z / len;

  // Canonical sign so parallel axes share one key
  if (
    nx < -0.01
    || (Math.abs(nx) <= 0.01 && ny < -0.01)
    || (Math.abs(nx) <= 0.01 && Math.abs(ny) <= 0.01 && nz < 0)
  ) {
    nx = -nx;
    ny = -ny;
    nz = -nz;
  }

  return [roundNumber(nx, 4), roundNumber(ny, 4), roundNumber(nz, 4)];
}

function axisLineKey(axis, origin) {
  const dir = normalizeAxis(axis);
  if (!dir) return null;
  if (!Array.isArray(origin) || origin.length !== 3) {
    return dir.join(',');
  }

  const [ox, oy, oz] = origin.map(Number);
  const [dx, dy, dz] = dir;
  // Position along axis + distance to axis line for canonical grouping
  const t = ox * dx + oy * dy + oz * dz;
  const perpX = ox - t * dx;
  const perpY = oy - t * dy;
  const perpZ = oz - t * dz;
  const perp = Math.hypot(perpX, perpY, perpZ);

  return `${dir.join(',')}|t${roundNumber(t, 1)}|p${roundNumber(perp, 1)}`;
}

function axisKey(axis) {
  const dir = normalizeAxis(axis);
  return dir ? dir.join(',') : null;
}

function axesCoincident(a, b) {
  const keyA = axisLineKey(a.axis, a.axisOrigin);
  const keyB = axisLineKey(b.axis, b.axisOrigin);
  if (keyA && keyB && keyA.includes('|t') && keyB.includes('|t')) {
    return keyA === keyB;
  }

  // Fallback when axis origin is unavailable (older engine builds)
  return axisKey(a.axis) === axisKey(b.axis);
}

function faceAnchor(faceIds) {
  if (!Array.isArray(faceIds) || faceIds.length === 0) return null;
  return Math.min(...faceIds);
}

function diametersFormCounterborePair(a, b) {
  if (a == null || b == null || a <= 0 || b <= 0) return false;
  const ratio = Math.max(a, b) / Math.min(a, b);
  return ratio >= DIAMETER_PAIR_RATIO;
}

function mergeHolePair(a, b) {
  const d1 = a.diameter;
  const d2 = b.diameter;
  const isPair = diametersFormCounterborePair(d1, d2);
  const minD = d1 == null ? d2 : d2 == null ? d1 : Math.min(d1, d2);
  const maxD = d1 == null ? d2 : d2 == null ? d1 : Math.max(d1, d2);

  const faceIds = [...new Set([...(a.faceIds || []), ...(b.faceIds || [])])].sort((x, y) => x - y);
  const mergedFrom = [
    ...(a.mergedFrom || [a.id]),
    ...(b.mergedFrom || [b.id]),
  ];

  return {
    id: a.id,
    type: isPair || a.type === 'hole_counterbored' || b.type === 'hole_counterbored'
      ? 'hole_counterbored'
      : (a.type || b.type || 'hole_simple'),
    confidence: Math.min(a.confidence ?? 1, b.confidence ?? 1),
    diameter: minD,
    counterboreDiameter: isPair && maxD !== minD ? maxD : (a.counterboreDiameter ?? b.counterboreDiameter ?? null),
    depth: Math.max(a.depth ?? 0, b.depth ?? 0) || a.depth || b.depth || null,
    depthSource: a.depthSource || b.depthSource || null,
    isThrough: Boolean(a.isThrough || b.isThrough),
    axis: a.axis || b.axis,
    center: a.center || b.center,
    countersinkDiameter: a.countersinkDiameter ?? b.countersinkDiameter ?? null,
    countersinkAngle: a.countersinkAngle ?? b.countersinkAngle ?? null,
    boreCount: faceIds.length,
    faceIds,
    deduped: true,
    mergedFrom,
  };
}

function isThroughPartSpan(hole) {
  const ids = hole.faceIds || [];
  if (ids.length < 2) return false;
  return Math.max(...ids) - Math.min(...ids) > 50;
}

function shouldPairMerge(a, b) {
  if (!axesCoincident(a, b)) return false;

  const anchorA = faceAnchor(a.faceIds);
  const anchorB = faceAnchor(b.faceIds);
  if (anchorA == null || anchorB == null) return false;

  if (Math.abs(anchorA - anchorB) > FACE_ANCHOR_PAIR_MAX) return false;

  const setA = new Set(a.faceIds || []);
  if ((b.faceIds || []).some((id) => setA.has(id))) return true;

  if (diametersFormCounterborePair(a.diameter, b.diameter) && Math.abs(anchorA - anchorB) <= 1) {
    if (Array.isArray(a.axisOrigin) && Array.isArray(b.axisOrigin)) {
      return axisLineKey(a.axis, a.axisOrigin) === axisLineKey(b.axis, b.axisOrigin);
    }
    // Older engine without axis origin: only merge duplicate CSK segments on through-part spans
    return isThroughPartSpan(a) && isThroughPartSpan(b);
  }

  return false;
}

function dedupeWithinAxisGroup(holes) {
  const sorted = [...holes].sort((a, b) => (faceAnchor(a.faceIds) ?? 0) - (faceAnchor(b.faceIds) ?? 0));
  const merged = [];
  const used = new Set();

  for (let i = 0; i < sorted.length; i += 1) {
    if (used.has(i)) continue;

    let current = { ...sorted[i], deduped: false, mergedFrom: [sorted[i].id] };
    used.add(i);

    for (let j = i + 1; j < sorted.length; j += 1) {
      if (used.has(j)) continue;
      if (!shouldPairMerge(current, sorted[j])) continue;

      current = mergeHolePair(current, sorted[j]);
      used.add(j);
      break;
    }

    merged.push(current);
  }

  return merged;
}

function refineHoleClassification(hole) {
  const d = hole.diameter;
  const outer = hole.counterboreDiameter;
  if (outer != null && d != null && outer / d >= DIAMETER_PAIR_RATIO) {
    return { ...hole, type: 'hole_counterbored' };
  }
  if (hole.deduped && hole.mergedFrom && hole.mergedFrom.length > 1 && diametersFormCounterborePair(d, outer)) {
    return { ...hole, type: 'hole_counterbored' };
  }
  if (hole.type === 'hole_counterbored' && (outer == null || d == null || outer / d < DIAMETER_PAIR_RATIO)) {
    // Single-feature counterbores (e.g. metal cup) keep type; small-bore false positives downgrade
    const isStandaloneLargeCounterbore = (hole.boreCount ?? 0) >= 2
      && !hole.deduped
      && d != null
      && d > 10;
    if (isStandaloneLargeCounterbore) {
      return hole;
    }
    return { ...hole, type: 'hole_simple', counterboreDiameter: null };
  }
  return hole;
}

/**
 * @param {Array<object>} holes - normalized holes from machining-features.js
 * @returns {{ holes: Array<object>, stats: object }}
 */
export function deduplicateHoles(holes) {
  if (!Array.isArray(holes) || holes.length === 0) {
    return {
      holes: [],
      stats: {
        rawCount: 0,
        dedupedCount: 0,
        mergedAway: 0,
        axisMissingCount: 0,
        unresolvedPairCandidates: 0,
      },
    };
  }

  const rawCount = holes.length;
  const axisMissingCount = holes.filter((h) => normalizeAxis(h.axis) == null).length;

  const groups = new Map();
  const noAxis = [];

  for (const hole of holes) {
    const key = axisLineKey(hole.axis, hole.axisOrigin) ?? axisKey(hole.axis);
    if (key == null) {
      noAxis.push({ ...hole, deduped: false, mergedFrom: [hole.id] });
      continue;
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(hole);
  }

  const deduped = [];
  for (const group of groups.values()) {
    deduped.push(...dedupeWithinAxisGroup(group));
  }
  deduped.push(...noAxis);

  deduped.sort((a, b) => String(a.id).localeCompare(String(b.id)));

  const refined = deduped.map(refineHoleClassification);
  const dedupedCount = refined.length;
  const mergedAway = rawCount - dedupedCount;

  let unresolvedPairCandidates = 0;
  const byAxis = new Map();
  for (const hole of deduped) {
    const key = axisLineKey(hole.axis, hole.axisOrigin) ?? axisKey(hole.axis);
    if (!key) continue;
    if (!byAxis.has(key)) byAxis.set(key, []);
    byAxis.get(key).push(hole);
  }
  for (const group of byAxis.values()) {
    const sorted = [...group].sort((a, b) => (faceAnchor(a.faceIds) ?? 0) - (faceAnchor(b.faceIds) ?? 0));
    for (let i = 1; i < sorted.length; i += 1) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (shouldPairMerge(prev, curr)) unresolvedPairCandidates += 1;
    }
  }

  return {
    holes: refined,
    stats: {
      rawCount,
      dedupedCount,
      mergedAway,
      axisMissingCount,
      unresolvedPairCandidates,
    },
  };
}

export function buildHoleReviewReasons(stats) {
  const reasons = [];
  if (!stats) return reasons;

  const { rawCount, axisMissingCount, unresolvedPairCandidates } = stats;
  if (rawCount > 0 && axisMissingCount / rawCount > 0.3) {
    reasons.push('hole_axis_missing_for_dedup');
  }
  if (unresolvedPairCandidates > 0) {
    reasons.push('unresolved_coaxial_hole_pairs');
  }

  return reasons;
}
