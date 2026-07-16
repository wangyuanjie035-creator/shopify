/**
 * CNC 自动报价引擎 v1.2
 *
 * 总价 = 加工工艺费 + 加工时长费 + 运费 + 税费
 *
 * 加工工艺费 = 材料费 + 开机/setup + 特征工序(孔/圆角/轴/型腔) + 表面处理
 * 加工时长费 = 去除体积加工 + 零件复杂度(包络/面数)，× 材料加工系数
 */

export const TAX_RATE = 0.13;
export const SHIPPING_CNY = 4;

/**
 * 材料画像：密度、单价、大类、加工难度系数
 * - removalFactor：去除/体积加工时长系数（塑料低、不锈钢/黄铜高）
 * - featureFactor：孔/圆角等工序系数
 * - machiningFactor：材料对「开机+工序+时长」的整体难度系数（不含材料费本身）
 */
export const MATERIAL_PROFILES = {
  '铝合金-6061': { category: '铝合金', density: 2.7, pricePerKg: 28, removalFactor: 1.0, featureFactor: 1.0, machiningFactor: 1.0 },
  '6061铝': { category: '铝合金', density: 2.7, pricePerKg: 28, removalFactor: 1.0, featureFactor: 1.0, machiningFactor: 1.0 },
  '6061': { category: '铝合金', density: 2.7, pricePerKg: 28, removalFactor: 1.0, featureFactor: 1.0, machiningFactor: 1.0 },
  '铝合金-7075': { category: '铝合金', density: 2.81, pricePerKg: 35, removalFactor: 1.05, featureFactor: 1.0, machiningFactor: 1.05 },
  '黄铜-H59': { category: '铜合金', density: 8.5, pricePerKg: 65, removalFactor: 1.0, featureFactor: 1.0, machiningFactor: 1.8 },
  'H59黄铜': { category: '铜合金', density: 8.5, pricePerKg: 65, removalFactor: 1.0, featureFactor: 1.0, machiningFactor: 1.8 },
  'H59': { category: '铜合金', density: 8.5, pricePerKg: 65, removalFactor: 1.0, featureFactor: 1.0, machiningFactor: 1.8 },
  '紫铜-T2': { category: '铜合金', density: 8.96, pricePerKg: 70, removalFactor: 1.0, featureFactor: 1.0, machiningFactor: 1.85 },
  '45#钢': { category: '合金钢', density: 7.85, pricePerKg: 8.5, removalFactor: 1.08, featureFactor: 1.0, machiningFactor: 1.1 },
  'SUS304': { category: '不锈钢', density: 7.93, pricePerKg: 25, removalFactor: 1.1, featureFactor: 1.0, machiningFactor: 1.15 },
  '304不锈钢': { category: '不锈钢', density: 7.93, pricePerKg: 25, removalFactor: 1.1, featureFactor: 1.0, machiningFactor: 1.15 },
  '316不锈钢': { category: '不锈钢', density: 8.0, pricePerKg: 32, removalFactor: 1.12, featureFactor: 1.0, machiningFactor: 1.18 },
  '工程塑料-ABS（白色）': { category: '塑料', density: 1.05, pricePerKg: 16, removalFactor: 0.85, featureFactor: 0.7, machiningFactor: 0.52 },
  '工程塑料-ABS（黑色）': { category: '塑料', density: 1.05, pricePerKg: 16, removalFactor: 0.85, featureFactor: 0.7, machiningFactor: 0.52 },
  '赛钢-POM（白色）': { category: '塑料', density: 1.41, pricePerKg: 22, removalFactor: 0.9, featureFactor: 0.72, machiningFactor: 0.55 },
  '赛钢-POM（黑色）': { category: '塑料', density: 1.41, pricePerKg: 22, removalFactor: 0.9, featureFactor: 0.72, machiningFactor: 0.55 },
  '电木（黑色）': { category: '塑料', density: 1.45, pricePerKg: 18, removalFactor: 0.8, featureFactor: 0.65, machiningFactor: 0.48 },
  '电木（橘黄色）': { category: '塑料', density: 1.45, pricePerKg: 18, removalFactor: 0.8, featureFactor: 0.65, machiningFactor: 0.48 },
  '亚克力': { category: '塑料', density: 1.19, pricePerKg: 20, removalFactor: 0.75, featureFactor: 0.6, machiningFactor: 0.45 },
  '环氧板-FR4（绿色）': { category: '塑料', density: 1.85, pricePerKg: 24, removalFactor: 0.7, featureFactor: 0.6, machiningFactor: 0.42 },
  '尼龙-PA6（白色）': { category: '塑料', density: 1.14, pricePerKg: 28, removalFactor: 0.88, featureFactor: 0.72, machiningFactor: 0.54 },
  '聚碳酸酯-PC': { category: '塑料', density: 1.2, pricePerKg: 26, removalFactor: 0.82, featureFactor: 0.65, machiningFactor: 0.5 },
};

const CATEGORY_DEFAULTS = {
  '铝合金': { density: 2.7, pricePerKg: 28, removalFactor: 1.0, featureFactor: 1.0, machiningFactor: 1.0 },
  '塑料': { density: 1.2, pricePerKg: 20, removalFactor: 0.85, featureFactor: 0.68, machiningFactor: 0.52 },
  '铜合金': { density: 8.5, pricePerKg: 65, removalFactor: 1.0, featureFactor: 1.0, machiningFactor: 1.8 },
  '合金钢': { density: 7.85, pricePerKg: 8.5, removalFactor: 1.08, featureFactor: 1.0, machiningFactor: 1.1 },
  '不锈钢': { density: 7.93, pricePerKg: 25, removalFactor: 1.1, featureFactor: 1.0, machiningFactor: 1.15 },
};

/** @deprecated 兼容旧引用 */
export const MATERIAL_DENSITY = Object.fromEntries(
  Object.entries(MATERIAL_PROFILES).map(([k, v]) => [k, v.density])
);
export const MATERIAL_PRICE_PER_KG = Object.fromEntries(
  Object.entries(MATERIAL_PROFILES).map(([k, v]) => [k, v.pricePerKg])
);

export const DEFAULT_QUOTE_RATES = {
  setupCny: 40,
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
  cavityEach: 35,
  shaftEach: 26,
  faceThreshold: 55,
  faceRate: 0.18,
  finishingAnodize: 50,
  finishingSandblastAnodize: 50,
  machiningHourlyCny: 150,
};

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

export function normalizeMaterialKey(material) {
  const text = String(material || '').trim();
  if (!text) return '6061铝';
  if (MATERIAL_PROFILES[text]) return text;
  if (/6061|铝合金-6061/.test(text)) return '6061铝';
  if (/7075/.test(text)) return '铝合金-7075';
  if (/黄铜|H59/i.test(text)) return 'H59黄铜';
  if (/紫铜|T2/i.test(text)) return '紫铜-T2';
  if (/304|SUS304/i.test(text)) return 'SUS304';
  if (/316/.test(text)) return '316不锈钢';
  if (/45.*钢|45#/.test(text)) return '45#钢';
  if (/ABS.*白/.test(text)) return '工程塑料-ABS（白色）';
  if (/ABS.*黑/.test(text)) return '工程塑料-ABS（黑色）';
  if (/POM.*白/.test(text)) return '赛钢-POM（白色）';
  if (/POM.*黑/.test(text)) return '赛钢-POM（黑色）';
  if (/电木.*黑/.test(text)) return '电木（黑色）';
  if (/电木.*橘/.test(text)) return '电木（橘黄色）';
  if (/FR4|环氧/.test(text)) return '环氧板-FR4（绿色）';
  if (/PA6|尼龙/.test(text)) return '尼龙-PA6（白色）';
  if (/PC|聚碳酸酯/.test(text)) return '聚碳酸酯-PC';
  if (/亚克力/.test(text)) return '亚克力';
  return text;
}

export function resolveMaterialProfile(material, materialCategory) {
  const key = normalizeMaterialKey(material);
  if (MATERIAL_PROFILES[key]) {
    return { key, label: material || key, ...MATERIAL_PROFILES[key] };
  }

  const category = materialCategory || '铝合金';
  const defaults = CATEGORY_DEFAULTS[category] || CATEGORY_DEFAULTS['铝合金'];
  return {
    key,
    label: material || key,
    category,
    ...defaults,
  };
}

export function isNoSurfaceTreatment(finishing) {
  const text = String(finishing || '').trim();
  if (!text) return true;
  if (/^(无|未指定|none|n\/a)$/i.test(text)) return true;
  return /无需|不需|不要|无.*表面|不.*表面|no\s*finish/i.test(text);
}

export function estimateFinishingFee(finishing, rates) {
  const text = String(finishing || '').trim();
  if (isNoSurfaceTreatment(text)) return 0;
  if (/喷砂.*阳极|阳极.*喷砂/.test(text)) return rates.finishingSandblastAnodize;
  if (/阳极/.test(text)) return rates.finishingAnodize;
  if (/喷砂/.test(text)) return rates.finishingSandblastAnodize * 0.6;
  if (/电镀|喷涂|氧化|抛光|拉丝|喷漆|烤漆|丝印|激光打标|UV打印|喷油/.test(text)) return 35;
  return 0;
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

function estimateMachiningMinutes(durationCost, rates) {
  const perMinute = rates.machiningHourlyCny / 60;
  if (!perMinute || durationCost <= 0) return 0;
  return roundMoney(durationCost / perMinute);
}

function computeFeatureCost(feature, rates, featureFactor) {
  let cost = 0;
  cost += feature.small * rates.smallHole;
  cost += feature.standard * rates.standardHole;
  cost += feature.large * rates.largeHole;
  cost += feature.counterbored * rates.counterboredPremium;
  cost += Math.min(feature.filletCount, rates.filletCap) * rates.filletEach;
  cost += feature.cavityCount * rates.cavityEach;
  cost += feature.shaftCount * rates.shaftEach;
  return roundMoney(cost * featureFactor);
}

function computeDurationCost(geometry, feature, rates, removalFactor) {
  let removalCost = 0;
  let complexityCost = 0;

  if (geometry.removalCm3 != null) {
    removalCost += geometry.removalCm3 * rates.removalPerCm3 * removalFactor;
  }
  if (geometry.volumeCm3 != null) {
    removalCost += geometry.volumeCm3 * rates.partVolumePerCm3 * removalFactor;
  }
  if (geometry.bboxCm3 != null && geometry.bboxCm3 > rates.bboxThresholdCm3) {
    complexityCost += (geometry.bboxCm3 - rates.bboxThresholdCm3) * rates.bboxPremiumPerCm3 * removalFactor;
  }
  if (feature.faceCount != null && feature.faceCount > rates.faceThreshold) {
    complexityCost += (feature.faceCount - rates.faceThreshold) * rates.faceRate * removalFactor;
  }

  return {
    removalCost: roundMoney(removalCost),
    complexityCost: roundMoney(complexityCost),
    total: roundMoney(removalCost + complexityCost),
  };
}

function buildProcessDetail(materialCost, setupCost, featureCost, finishingFee, material) {
  const parts = [
    `材料¥${materialCost}`,
    `开机¥${setupCost}`,
    `工序¥${featureCost}`,
  ];
  if (finishingFee > 0) parts.push(`表面¥${finishingFee}`);
  return `${parts.join('+')} (${material.category}/${material.key} 加工×${material.machiningFactor})`;
}

function buildDurationDetail(duration, geometry, material) {
  return `去除¥${duration.removalCost}+复杂度¥${duration.complexityCost} (去除×${material.removalFactor} 加工×${material.machiningFactor})`;
}

/**
 * @param {object} input
 * @param {object} [input.features]
 * @param {string} [input.material]
 * @param {string} [input.materialCategory]
 * @param {string} [input.finishing]
 * @param {number} [input.quantity]
 */
export function estimateQuote(input = {}) {
  const rates = { ...DEFAULT_QUOTE_RATES, ...(input.rates || {}) };
  const material = resolveMaterialProfile(input.material, input.materialCategory);
  const quantity = Math.max(1, parseInt(input.quantity, 10) || 1);

  const geometry = resolveGeometryInput(input);
  const feature = resolveFeatureInput(input);
  const finishingText = input.finishing ?? input.surfaceTreatment;

  const massG = geometry.volumeCm3 != null
    ? roundMoney(geometry.volumeCm3 * material.density)
    : null;
  const materialCost = massG != null
    ? roundMoney((massG / 1000) * material.pricePerKg)
    : 0;

  const setupCost = roundMoney(rates.setupCny * material.machiningFactor);
  const featureCost = computeFeatureCost(feature, rates, material.featureFactor);
  const featureCostScaled = roundMoney(featureCost * material.machiningFactor);
  const finishingFee = roundMoney(estimateFinishingFee(finishingText, rates));
  const processCost = roundMoney(materialCost + setupCost + featureCostScaled + finishingFee);

  const durationParts = computeDurationCost(geometry, feature, rates, material.removalFactor);
  const durationCost = roundMoney(durationParts.total * material.machiningFactor);

  const manufacturingSubtotal = roundMoney(processCost + durationCost);
  const subtotalBeforeTax = roundMoney(manufacturingSubtotal + SHIPPING_CNY);
  const tax = roundMoney(subtotalBeforeTax * TAX_RATE);
  const unitTotal = roundMoney(subtotalBeforeTax + tax);
  const lineTotal = roundMoney(unitTotal * quantity);
  const estimatedMinutes = estimateMachiningMinutes(durationCost, rates);

  const reviewReasons = [...feature.reviewReasons];
  let autoQuoteEligible = feature.status === 'ok' || feature.status === 'partial';

  if (feature.requiresManualReview) {
    autoQuoteEligible = false;
    reviewReasons.push('requires_manual_review');
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
  if (material.category === '铜合金' && feature.large >= 2) {
    reviewReasons.push('brass_large_hole');
  }
  if (material.category === '塑料' && feature.holeCount === 0 && feature.filletCount === 0 && durationCost < 5) {
    reviewReasons.push('plastic_simple_part');
  }
  if (!isNoSurfaceTreatment(finishingText) && finishingFee === 0) {
    reviewReasons.push('unknown_surface_treatment');
  }
  if (!MATERIAL_PROFILES[material.key] && !CATEGORY_DEFAULTS[material.category]) {
    reviewReasons.push('unknown_material');
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
    material: {
      key: material.key,
      label: material.label,
      category: material.category,
      density: material.density,
      pricePerKg: material.pricePerKg,
      removalFactor: material.removalFactor,
      featureFactor: material.featureFactor,
      machiningFactor: material.machiningFactor,
    },
    breakdown: {
      processCost,
      durationCost,
      manufacturingSubtotal,
      materialCost,
      setupCost,
      featureCost: featureCostScaled,
      finishingFee,
      removalCost: durationParts.removalCost,
      complexityCost: durationParts.complexityCost,
      processDetail: buildProcessDetail(materialCost, setupCost, featureCostScaled, finishingFee, material),
      durationDetail: buildDurationDetail(
        {
          removalCost: roundMoney(durationParts.removalCost * material.machiningFactor),
          complexityCost: roundMoney(durationParts.complexityCost * material.machiningFactor),
        },
        geometry,
        material,
      ),
      estimatedMinutes,
      shipping: SHIPPING_CNY,
      tax,
      taxRate: TAX_RATE,
      subtotalBeforeTax,
      machiningSubtotal: manufacturingSubtotal,
      finishing: finishingFee,
    },
    geometry: {
      ...geometry,
      massG,
      density: material.density,
      materialKey: material.key,
    },
    features: feature,
    autoQuoteEligible,
    confidence,
    requiresManualReview: !autoQuoteEligible,
    reviewReasons: [...new Set(reviewReasons)],
    formulaVersion: '1.2',
  };
}

export function buildQuoteShopifyAttributes(quote) {
  if (!quote) return [];

  const b = quote.breakdown;
  const m = quote.material;

  const attrs = [
    {
      key: '自动估价',
      value: quote.autoQuoteEligible ? `¥${quote.unitPrice}` : '待人工报价',
    },
    { key: '估价置信度', value: quote.confidence === 'high' ? '高' : '需复核' },
    { key: '估价数量', value: String(quote.quantity) },
    { key: '估价总价', value: `¥${quote.totalPrice}` },
    { key: '加工工艺费', value: `¥${b.processCost} (${b.processDetail})` },
    { key: '加工时长费', value: `¥${b.durationCost} (${b.durationDetail})` },
    { key: '预估加工时长', value: `${b.estimatedMinutes} 分钟` },
    { key: '运费', value: `¥${b.shipping}` },
    { key: '税费', value: `¥${b.tax}` },
    { key: '材料大类', value: m.category },
    { key: '材料牌号', value: m.label },
    { key: '材料费', value: `¥${b.materialCost}` },
    { key: '材料单价', value: `¥${m.pricePerKg}/kg` },
    { key: '材料加工系数', value: `加工×${m.machiningFactor} 去除×${m.removalFactor} 工序×${m.featureFactor}` },
    { key: '开机费', value: `¥${b.setupCost}` },
    { key: '特征加工费', value: `¥${b.featureCost}` },
  ];

  if (b.finishingFee > 0) {
    attrs.push({ key: '表面处理费', value: `¥${b.finishingFee}` });
  }
  if (quote.geometry.massG != null) {
    attrs.push({ key: '估算质量', value: `${quote.geometry.massG} g` });
  }
  if (quote.geometry.volumeCm3 != null) {
    attrs.push({ key: '零件体积', value: `${quote.geometry.volumeCm3} cm³` });
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

  return attrs.map((item) => ({
    key: item.key,
    value: String(item.value).length > 250
      ? `${String(item.value).slice(0, 247)}...`
      : String(item.value),
  }));
}

export function serializeQuoteBreakdown(quote) {
  const compact = {
    formulaVersion: quote.formulaVersion,
    unitPrice: quote.unitPrice,
    material: quote.material,
    breakdown: quote.breakdown,
    geometry: {
      volumeCm3: quote.geometry.volumeCm3,
      removalCm3: quote.geometry.removalCm3,
      massG: quote.geometry.massG,
    },
    autoQuoteEligible: quote.autoQuoteEligible,
  };
  const json = JSON.stringify(compact);
  return json.length > 250 ? `${json.slice(0, 247)}...` : json;
}
