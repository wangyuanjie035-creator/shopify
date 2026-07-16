/**
 * CNC 自动报价引擎 v1 — 基于 Palmetto 特征 + 工件几何（体积/尺寸/质量）
 *
 * 价格结构（与历史订单 PPT 一致）：
 *   总价 = (加工费 + 表面处理费 + 运费) × (1 + 税率)
 *
 * 加工费主驱动：去除体积（包络 − 零件）、大零件包络附加、孔/圆角/轴、材料费。
 * 系数由 4 单历史订单校准（scripts/tune-quote-rates.py）。
 */

export const TAX_RATE = 0.13;
export const SHIPPING_CNY = 4;

/** 材料密度 g/cm³ */
export const MATERIAL_DENSITY = {
  '铝合金-6061': 2.7,
  '铝合金-7075': 2.81,
  '6061铝': 2.7,
  '6061': 2.7,
  '黄铜-H59': 8.5,
  'H59黄铜': 8.5,
  'H59': 8.5,
  '紫铜-T2': 8.96,
  '304不锈钢': 7.93,
  '316不锈钢': 8.0,
};

/** 材料单价 ¥/kg（毛坯采购估算） */
export const MATERIAL_PRICE_PER_KG = {
  '铝合金-6061': 28,
  '铝合金-7075': 35,
  '6061铝': 28,
  '6061': 28,
  '黄铜-H59': 65,
  'H59黄铜': 65,
  'H59': 65,
  '紫铜-T2': 70,
  '304不锈钢': 25,
  '316不锈钢': 32,
};

/** 4 单历史订单校准系数 */
export const DEFAULT_QUOTE_RATES = {
  setupCny: 40,
  /** 去除体积 cm³（包络 − 零件） */
  removalPerCm3: 0.58,
  partVolumePerCm3: 0.03,
  bboxThresholdCm3: 200,
  bboxPremiumPerCm3: 0.11,
  smallHole: 2.0,
  standardHole: 0.85,
  largeHole: 26,
  counterboredPremium: 1.2,
  filletEach: 0.9,
  filletCap: 12,
  shaftEach: 26,
  faceThreshold: 55,
  faceRate: 0.18,
  materialFactorDefault: 1.0,
  materialFactorBrass: 1.8,
  finishingAnodize: 50,
  finishingSandblastAnodize: 50,
};

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

export function normalizeMaterialKey(material) {
  const text = String(material || '').trim();
  if (!text) return '6061铝';
  if (MATERIAL_DENSITY[text]) return text;
  if (/6061|铝合金/.test(text)) return '6061铝';
  if (/黄铜|H59/i.test(text)) return 'H59黄铜';
  if (/7075/.test(text)) return '铝合金-7075';
  if (/304/.test(text)) return '304不锈钢';
  if (/316/.test(text)) return '316不锈钢';
  return text;
}

export function parseHoleBreakdown(sizeBreakdown, holeInsights = {}) {
  const result = { small: 0, standard: 0, large: 0 };
  if (sizeBreakdown) {
    for (const part of String(sizeBreakdown).split(',')) {
      const trimmed = part.trim();
      const match = trimmed.match(/×(\d+)\s*$/);
      if (!match) continue;
      const count = parseInt(match[1], 10);
      if (trimmed.includes('小孔')) result.small += count;
      else if (trimmed.includes('大孔')) result.large += count;
      else if (trimmed.includes('标准孔')) result.standard += count;
    }
  }

  const counterbored = holeInsights.counterboredCount ?? 0;
  const total = holeInsights.dedupedCount ?? holeInsights.rawCount ?? 0;
  if (!result.small && !result.standard && !result.large && total > 0) {
    result.standard = Math.max(0, total - counterbored);
  }

  return { ...result, counterbored, total };
}

export function resolveGeometryInput(input = {}) {
  const workpiece = input.workpiece || input.features?.workpiece || null;
  const dims = workpiece?.dimensions || input.dimensions || null;
  const volumeMm3 = workpiece?.volumeMm3
    ?? input.volumeMm3
    ?? input.features?.summary?.workpieceVolumeMm3
    ?? null;
  const bboxVolumeMm3 = workpiece?.bboxVolumeMm3
    ?? input.bboxVolumeMm3
    ?? input.features?.summary?.bboxVolumeMm3
    ?? null;

  let length = dims?.length ?? dims?.axisX ?? null;
  let width = dims?.width ?? dims?.axisY ?? null;
  let height = dims?.height ?? dims?.axisZ ?? null;

  if (length != null && width != null && height != null) {
    const sorted = [length, width, height].sort((a, b) => b - a);
    length = sorted[0];
    width = sorted[1];
    height = sorted[2];
  }

  const volumeCm3 = volumeMm3 != null ? volumeMm3 / 1000 : null;
  let bboxCm3 = bboxVolumeMm3 != null ? bboxVolumeMm3 / 1000 : null;
  if (bboxCm3 == null && length && width && height) {
    bboxCm3 = (length * width * height) / 1000;
  }
  const removalCm3 = volumeCm3 != null && bboxCm3 != null
    ? Math.max(bboxCm3 - volumeCm3, 0)
    : null;

  return {
    length,
    width,
    height,
    volumeMm3,
    bboxVolumeMm3,
    volumeCm3: volumeCm3 != null ? roundMoney(volumeCm3) : null,
    bboxCm3: bboxCm3 != null ? roundMoney(bboxCm3) : null,
    removalCm3: removalCm3 != null ? roundMoney(removalCm3) : null,
    surfaceAreaMm2: workpiece?.surfaceAreaMm2 ?? null,
    source: workpiece?.source ?? null,
  };
}

export function resolveFeatureInput(input = {}) {
  const features = input.features || input;
  const summary = features.summary || {};
  const insights = features.insights || {};
  const holes = insights.holes || {};
  const holeBreakdown = parseHoleBreakdown(holes.sizeBreakdown, holes);

  return {
    holeCount: summary.holeCount ?? holes.dedupedCount ?? 0,
    ...holeBreakdown,
    throughCount: holes.throughCount ?? 0,
    filletCount: summary.filletCount ?? 0,
    cavityCount: summary.cavityCount ?? 0,
    shaftCount: summary.shaftCount ?? 0,
    faceCount: insights.topology?.faceCount ?? features.topology?.faces ?? null,
    requiresManualReview: features.requiresManualReview === true,
    reviewReasons: features.reviewReasons || [],
    status: features.status || 'unknown',
  };
}

function estimateFinishingFee(finishing, rates) {
  const text = String(finishing || '').trim();
  if (!text || text === '无' || text === '未指定') return 0;
  if (/喷砂.*阳极|阳极.*喷砂/.test(text)) return rates.finishingSandblastAnodize;
  if (/阳极/.test(text)) return rates.finishingAnodize;
  if (/喷砂/.test(text)) return rates.finishingSandblastAnodize * 0.6;
  return 30;
}

/**
 * @param {object} input
 * @param {object} [input.features] normalizeMachiningFeatures 输出
 * @param {string} [input.material]
 * @param {string} [input.finishing]
 * @param {number} [input.quantity]
 * @param {object} [input.rates]
 */
export function estimateQuote(input = {}) {
  const rates = { ...DEFAULT_QUOTE_RATES, ...(input.rates || {}) };
  const materialKey = normalizeMaterialKey(input.material);
  const density = MATERIAL_DENSITY[materialKey] ?? 2.7;
  const materialPricePerKg = MATERIAL_PRICE_PER_KG[materialKey] ?? 28;
  const quantity = Math.max(1, parseInt(input.quantity, 10) || 1);

  const geometry = resolveGeometryInput(input);
  const feature = resolveFeatureInput(input);

  const massG = geometry.volumeCm3 != null
    ? roundMoney(geometry.volumeCm3 * density)
    : null;
  const materialCost = massG != null
    ? roundMoney((massG / 1000) * materialPricePerKg)
    : 0;

  let machining = rates.setupCny + materialCost;

  if (geometry.removalCm3 != null) {
    machining += geometry.removalCm3 * rates.removalPerCm3;
  }
  if (geometry.volumeCm3 != null) {
    machining += geometry.volumeCm3 * rates.partVolumePerCm3;
  }
  if (geometry.bboxCm3 != null && geometry.bboxCm3 > rates.bboxThresholdCm3) {
    machining += (geometry.bboxCm3 - rates.bboxThresholdCm3) * rates.bboxPremiumPerCm3;
  }

  machining += feature.small * rates.smallHole;
  machining += feature.standard * rates.standardHole;
  machining += feature.large * rates.largeHole;
  machining += feature.counterbored * rates.counterboredPremium;
  machining += Math.min(feature.filletCount, rates.filletCap) * rates.filletEach;
  machining += feature.shaftCount * rates.shaftEach;

  if (feature.faceCount != null && feature.faceCount > rates.faceThreshold) {
    machining += (feature.faceCount - rates.faceThreshold) * rates.faceRate;
  }

  const isBrass = /黄铜|H59|紫铜/i.test(materialKey);
  if (isBrass) {
    machining *= rates.materialFactorBrass;
  }

  const finishing = estimateFinishingFee(input.finishing ?? input.surfaceTreatment, rates);
  const subtotal = machining + finishing + SHIPPING_CNY;
  const unitTotal = roundMoney(subtotal * (1 + TAX_RATE));
  const lineTotal = roundMoney(unitTotal * quantity);

  const reviewReasons = [...feature.reviewReasons];
  let autoQuoteEligible = feature.status === 'ok' || feature.status === 'partial';

  if (feature.requiresManualReview) {
    autoQuoteEligible = false;
    if (!reviewReasons.includes('requires_manual_review')) {
      reviewReasons.push('requires_manual_review');
    }
  }
  if (geometry.volumeCm3 == null && geometry.bboxCm3 == null) {
    autoQuoteEligible = false;
    reviewReasons.push('missing_geometry');
  }
  if (feature.holeCount > 45) {
    autoQuoteEligible = false;
    reviewReasons.push('high_hole_count');
  }
  if (feature.counterbored > 15) {
    autoQuoteEligible = false;
    reviewReasons.push('many_counterbored_holes');
  }
  if (feature.faceCount != null && feature.faceCount > 300) {
    autoQuoteEligible = false;
    reviewReasons.push('high_face_count');
  }
  if (isBrass && feature.large >= 2) {
    reviewReasons.push('brass_large_hole');
  }

  const confidence = autoQuoteEligible ? 'high' : 'review';
  if (!autoQuoteEligible && !reviewReasons.length) {
    reviewReasons.push('manual_review_required');
  }

  return {
    currency: 'CNY',
    quantity,
    unitPrice: unitTotal,
    totalPrice: lineTotal,
    breakdown: {
      setup: rates.setupCny,
      materialCost,
      removalVolumeCm3: geometry.removalCm3,
      machiningOps: roundMoney(
        machining - rates.setupCny - materialCost
      ),
      machiningSubtotal: roundMoney(machining),
      finishing: roundMoney(finishing),
      shipping: SHIPPING_CNY,
      taxRate: TAX_RATE,
      subtotalBeforeTax: roundMoney(subtotal),
    },
    geometry: {
      ...geometry,
      massG,
      density,
      materialKey,
    },
    features: feature,
    autoQuoteEligible,
    confidence,
    requiresManualReview: !autoQuoteEligible,
    reviewReasons: [...new Set(reviewReasons)],
    formulaVersion: '1.0',
  };
}

export function buildQuoteShopifyAttributes(quote) {
  if (!quote) return [];

  const attrs = [
    {
      key: '自动估价',
      value: quote.autoQuoteEligible ? `¥${quote.unitPrice}` : '待人工报价',
    },
    { key: '估价置信度', value: quote.confidence === 'high' ? '高' : '需复核' },
    { key: '估价数量', value: String(quote.quantity) },
    { key: '估价总价', value: `¥${quote.totalPrice}` },
    { key: '加工费估算', value: `¥${quote.breakdown.machiningSubtotal}` },
    { key: '表面处理费', value: `¥${quote.breakdown.finishing}` },
    { key: '材料费估算', value: `¥${quote.breakdown.materialCost}` },
  ];

  if (quote.geometry.massG != null) {
    attrs.push({ key: '估算质量', value: `${quote.geometry.massG} g` });
  }
  if (quote.geometry.removalCm3 != null) {
    attrs.push({ key: '去除体积', value: `${quote.geometry.removalCm3} cm³` });
  }
  if (quote.reviewReasons?.length) {
    attrs.push({
      key: '估价复核原因',
      value: quote.reviewReasons.join(', ').slice(0, 250),
    });
  }

  return attrs;
}

export function serializeQuoteBreakdown(quote) {
  const compact = {
    formulaVersion: quote.formulaVersion,
    unitPrice: quote.unitPrice,
    autoQuoteEligible: quote.autoQuoteEligible,
    breakdown: quote.breakdown,
    geometry: {
      volumeCm3: quote.geometry.volumeCm3,
      bboxCm3: quote.geometry.bboxCm3,
      removalCm3: quote.geometry.removalCm3,
      massG: quote.geometry.massG,
    },
  };
  const json = JSON.stringify(compact);
  return json.length > 250 ? `${json.slice(0, 247)}...` : json;
}
