/**
 * CNC 自动报价引擎 v1.5 — 单件小批量市场价 + 批量成本价
 *
 * 总价 = 加工工艺费 + 加工时长费 + 运费 + 税费
 *
 * qty=1：材料/加工/表面按外协平台小批量标准（保守 MRR、最低开料、装夹费等）
 * qty≥2：沿用 v1.4.1 四单成本价校准系数，调机费随数量摊薄
 */

export const TAX_RATE = 0.13;
export const SHIPPING_CNY = 4;
export const QUOTE_MODE = 'cost';
export const PRICING_BASIS = 'market';

/** 国内市场默认机时与调机（三轴铣，小批量 qty=1；4 单成本价校准） */
export const MARKET_SHOP_PROFILE = {
  machineHourlyCny: 110,
  setupMinutesStandard: 26,
  setupMinutesSimple: 10,
  /** 毛坯相对成品净重的损耗系数（切屑+余量，约 8–12%） */
  materialScrapFactor: 1.10,
  profitMargin: 0,
};

/**
 * 材料画像：密度、市场采购单价、MRR、加工难度
 * mrrCm3PerMin：材料去除率 cm³/min（铝 ~10，钢 ~3，塑料 ~20）
 */
export const MATERIAL_PROFILES = {
  '铝合金-6061': { category: '铝合金', density: 2.7, pricePerKg: 28, mrrCm3PerMin: 10, featureFactor: 1.0, machiningFactor: 1.0 },
  '6061铝': { category: '铝合金', density: 2.7, pricePerKg: 28, mrrCm3PerMin: 10, featureFactor: 1.0, machiningFactor: 1.0 },
  '6061': { category: '铝合金', density: 2.7, pricePerKg: 28, mrrCm3PerMin: 10, featureFactor: 1.0, machiningFactor: 1.0 },
  '铝合金-7075': { category: '铝合金', density: 2.81, pricePerKg: 35, mrrCm3PerMin: 9, featureFactor: 1.0, machiningFactor: 1.05 },
  '黄铜-H59': { category: '铜合金', density: 8.5, pricePerKg: 65, mrrCm3PerMin: 5, featureFactor: 1.0, machiningFactor: 1.0 },
  'H59黄铜': { category: '铜合金', density: 8.5, pricePerKg: 65, mrrCm3PerMin: 5, featureFactor: 1.0, machiningFactor: 1.0 },
  'H59': { category: '铜合金', density: 8.5, pricePerKg: 65, mrrCm3PerMin: 5, featureFactor: 1.0, machiningFactor: 1.0 },
  '紫铜-T2': { category: '铜合金', density: 8.96, pricePerKg: 70, mrrCm3PerMin: 4.5, featureFactor: 1.0, machiningFactor: 1.05 },
  '45#钢': { category: '合金钢', density: 7.85, pricePerKg: 8.5, mrrCm3PerMin: 3.3, featureFactor: 1.0, machiningFactor: 1.08 },
  'SUS304': { category: '不锈钢', density: 7.93, pricePerKg: 25, mrrCm3PerMin: 4, featureFactor: 1.0, machiningFactor: 1.12 },
  '304不锈钢': { category: '不锈钢', density: 7.93, pricePerKg: 25, mrrCm3PerMin: 4, featureFactor: 1.0, machiningFactor: 1.12 },
  '316不锈钢': { category: '不锈钢', density: 8.0, pricePerKg: 32, mrrCm3PerMin: 3.5, featureFactor: 1.0, machiningFactor: 1.15 },
  '工程塑料-ABS（白色）': { category: '塑料', density: 1.05, pricePerKg: 16, mrrCm3PerMin: 20, featureFactor: 0.85, machiningFactor: 0.55 },
  '工程塑料-ABS（黑色）': { category: '塑料', density: 1.05, pricePerKg: 16, mrrCm3PerMin: 20, featureFactor: 0.85, machiningFactor: 0.55 },
  '赛钢-POM（白色）': { category: '塑料', density: 1.41, pricePerKg: 22, mrrCm3PerMin: 18, featureFactor: 0.88, machiningFactor: 0.58 },
  '赛钢-POM（黑色）': { category: '塑料', density: 1.41, pricePerKg: 22, mrrCm3PerMin: 18, featureFactor: 0.88, machiningFactor: 0.58 },
  '电木（黑色）': { category: '塑料', density: 1.45, pricePerKg: 18, mrrCm3PerMin: 16, featureFactor: 0.8, machiningFactor: 0.5 },
  '电木（橘黄色）': { category: '塑料', density: 1.45, pricePerKg: 18, mrrCm3PerMin: 16, featureFactor: 0.8, machiningFactor: 0.5 },
  '亚克力': { category: '塑料', density: 1.19, pricePerKg: 20, mrrCm3PerMin: 15, featureFactor: 0.75, machiningFactor: 0.48 },
  '环氧板-FR4（绿色）': { category: '塑料', density: 1.85, pricePerKg: 24, mrrCm3PerMin: 12, featureFactor: 0.75, machiningFactor: 0.45 },
  '尼龙-PA6（白色）': { category: '塑料', density: 1.14, pricePerKg: 28, mrrCm3PerMin: 17, featureFactor: 0.88, machiningFactor: 0.56 },
  '聚碳酸酯-PC': { category: '塑料', density: 1.2, pricePerKg: 26, mrrCm3PerMin: 16, featureFactor: 0.8, machiningFactor: 0.52 },
};

const CATEGORY_DEFAULTS = {
  '铝合金': { density: 2.7, pricePerKg: 28, mrrCm3PerMin: 10, featureFactor: 1.0, machiningFactor: 1.0 },
  '塑料': { density: 1.2, pricePerKg: 20, mrrCm3PerMin: 18, featureFactor: 0.85, machiningFactor: 0.55 },
  '铜合金': { density: 8.5, pricePerKg: 65, mrrCm3PerMin: 5, featureFactor: 1.0, machiningFactor: 1.0 },
  '合金钢': { density: 7.85, pricePerKg: 8.5, mrrCm3PerMin: 3.3, featureFactor: 1.0, machiningFactor: 1.08 },
  '不锈钢': { density: 7.93, pricePerKg: 25, mrrCm3PerMin: 4, featureFactor: 1.0, machiningFactor: 1.12 },
};

/** @deprecated */
export const MATERIAL_DENSITY = Object.fromEntries(
  Object.entries(MATERIAL_PROFILES).map(([k, v]) => [k, v.density]),
);
export const MATERIAL_PRICE_PER_KG = Object.fromEntries(
  Object.entries(MATERIAL_PROFILES).map(([k, v]) => [k, v.pricePerKg]),
);

/** 特征加工时间（分钟/个，市场经验值） */
export const MARKET_FEATURE_MINUTES = {
  smallHole: 1.2,
  standardHole: 0.45,
  largeHole: 8,
  counterboredPremium: 0.35,
  filletEach: 0.22,
  filletCap: 12,
  cavityEach: 10,
  shaftEach: 8,
};

export const DEFAULT_QUOTE_RATES = {
  ...MARKET_SHOP_PROFILE,
  ...MARKET_FEATURE_MINUTES,
  /** 4 单成本价校准 MRR（覆盖材料默认 MRR） */
  mrrAluminum: 10,
  mrrBrass: 1.8,
  mrrSteel: 10 / 3,
  mrrStainless: 4,
  mrrPlastic: 20,
  featureTimeScale: 0.9,
  /** 黄铜特征/切削附加系数（相对铝） */
  brassFeatureScale: 2.5,
  brassDurationFactor: 1.3,
  largeRemovalThresholdCm3: 40,
  /** 大去除量附加成本 ¥/cm³（弥补 MRR 线性模型偏差） */
  largeRemovalSurchargePerCm3: 0.45,
  simplePartMaxRemovalCm3: 2.8,
  simplePartMaxRemovalRatio: 0.30,
  simplePartMaxFeatureUnits: 3.5,
  /** 大零件包络附加时长：min / cm³ 超阈值部分 */
  bboxThresholdCm3: 200,
  bboxExtraMinPerCm3: 0.012,
  faceThreshold: 55,
  faceExtraMinEach: 0.08,
  /** 精加工/刀路附加：成品体积 × 分钟/cm³ */
  finishMinPerPartVolumeCm3: 0.015,
  /** 表面处理：setup + 面积×单价×复杂度，min 为同工艺底价 */
  finishingMinBillableAreaDm2: 0.55,
  finishingAnodizeSetup: 16,
  finishingAnodizePerDm2: 22,
  finishingAnodizeMin: 38,
  finishingSandblastAnodizeSetup: 18,
  finishingSandblastAnodizePerDm2: 26,
  finishingSandblastAnodizeMin: 48,
  finishingSandblastSetup: 12,
  finishingSandblastPerDm2: 16,
  finishingSandblastMin: 28,
  finishingGenericSetup: 14,
  finishingGenericPerDm2: 18,
  finishingGenericMin: 32,
  /** @deprecated 保留作底价别名 */
  finishingAnodize: 38,
  finishingSandblastAnodize: 48,
};

/** qty=1 小批量：对标外协平台单件报价（保守工时 + 零售材料 + 装夹/开料最低消费） */
export const SMALL_BATCH_MAX_QTY = 1;

export const SMALL_BATCH_ADJUSTMENTS = {
  materialPriceMultiplier: 1.65,
  materialScrapFactor: 1.45,
  materialMinBillingG: 480,
  /** 切削/工序机时（外协单件溢价） */
  machineHourlyCny: 165,
  /** 编程调机仍按基础机时，对标平台「工程费」 */
  setupMachineHourlyCny: 110,
  setupMinutesStandard: 12,
  setupMinutesSimple: 8,
  mrrScale: 0.10,
  featureTimeScaleMultiplier: 1.35,
  finishMinPerPartVolumeCm3: 0.06,
  fixtureFeeCny: 15,
  finishingAnodizeSetup: 22,
  finishingAnodizePerDm2: 32,
  finishingAnodizeMin: 55,
  finishingSandblastAnodizeSetup: 26,
  finishingSandblastAnodizePerDm2: 38,
  finishingSandblastAnodizeMin: 76,
  finishingSandblastSetup: 18,
  finishingSandblastPerDm2: 24,
  finishingSandblastMin: 45,
  finishingGenericSetup: 18,
  finishingGenericPerDm2: 24,
  finishingGenericMin: 40,
  finishingAnodize: 55,
  finishingSandblastAnodize: 76,
};

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function minutesToCost(minutes, hourlyRate) {
  return roundMoney((minutes / 60) * hourlyRate);
}

/**
 * @returns {{ rates: object, tier: 'small-batch' | 'standard', tierLabel: string, quoteMode: string }}
 */
export function resolveQuantityRates(baseRates, quantity, options = {}) {
  const forceTier = options.pricingTier;
  if (forceTier === 'standard' || (forceTier !== 'small-batch' && quantity > SMALL_BATCH_MAX_QTY)) {
    return {
      rates: baseRates,
      tier: 'standard',
      tierLabel: '标准批量',
      quoteMode: QUOTE_MODE,
    };
  }

  const adj = SMALL_BATCH_ADJUSTMENTS;
  const featureScale = (baseRates.featureTimeScale ?? 1) * (adj.featureTimeScaleMultiplier ?? 1);
  return {
    rates: {
      ...baseRates,
      machineHourlyCny: adj.machineHourlyCny ?? baseRates.machineHourlyCny,
      setupMachineHourlyCny: adj.setupMachineHourlyCny ?? baseRates.machineHourlyCny,
      setupMinutesStandard: adj.setupMinutesStandard ?? baseRates.setupMinutesStandard,
      setupMinutesSimple: adj.setupMinutesSimple ?? baseRates.setupMinutesSimple,
      materialScrapFactor: adj.materialScrapFactor ?? baseRates.materialScrapFactor,
      materialPriceMultiplier: adj.materialPriceMultiplier ?? 1,
      materialMinBillingG: adj.materialMinBillingG ?? 0,
      mrrScale: adj.mrrScale ?? 1,
      featureTimeScale: featureScale,
      finishMinPerPartVolumeCm3: adj.finishMinPerPartVolumeCm3 ?? baseRates.finishMinPerPartVolumeCm3,
      fixtureFeeCny: adj.fixtureFeeCny ?? 0,
      finishingAnodizeSetup: adj.finishingAnodizeSetup ?? baseRates.finishingAnodizeSetup,
      finishingAnodizePerDm2: adj.finishingAnodizePerDm2 ?? baseRates.finishingAnodizePerDm2,
      finishingAnodizeMin: adj.finishingAnodizeMin ?? baseRates.finishingAnodizeMin,
      finishingSandblastAnodizeSetup: adj.finishingSandblastAnodizeSetup ?? baseRates.finishingSandblastAnodizeSetup,
      finishingSandblastAnodizePerDm2: adj.finishingSandblastAnodizePerDm2 ?? baseRates.finishingSandblastAnodizePerDm2,
      finishingSandblastAnodizeMin: adj.finishingSandblastAnodizeMin ?? baseRates.finishingSandblastAnodizeMin,
      finishingSandblastSetup: adj.finishingSandblastSetup ?? baseRates.finishingSandblastSetup,
      finishingSandblastPerDm2: adj.finishingSandblastPerDm2 ?? baseRates.finishingSandblastPerDm2,
      finishingSandblastMin: adj.finishingSandblastMin ?? baseRates.finishingSandblastMin,
      finishingGenericSetup: adj.finishingGenericSetup ?? baseRates.finishingGenericSetup,
      finishingGenericPerDm2: adj.finishingGenericPerDm2 ?? baseRates.finishingGenericPerDm2,
      finishingGenericMin: adj.finishingGenericMin ?? baseRates.finishingGenericMin,
      finishingAnodize: adj.finishingAnodizeMin ?? adj.finishingAnodize ?? baseRates.finishingAnodizeMin,
      finishingSandblastAnodize: adj.finishingSandblastAnodizeMin ?? adj.finishingSandblastAnodize ?? baseRates.finishingSandblastAnodizeMin,
    },
    tier: 'small-batch',
    tierLabel: '单件小批量',
    quoteMode: 'small-batch-market',
  };
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
  return { key, label: material || key, category, ...defaults };
}

export function isNoSurfaceTreatment(finishing) {
  const text = String(finishing || '').trim();
  if (!text) return true;
  if (/^(无|未指定|none|n\/a)$/i.test(text)) return true;
  return /无需|不需|不要|无.*表面|不.*表面|no\s*finish/i.test(text);
}

export function estimateSurfaceAreaDm2(geometry = {}) {
  if (geometry.surfaceAreaMm2 != null && geometry.surfaceAreaMm2 > 0) {
    return roundMoney(geometry.surfaceAreaMm2 / 10000);
  }
  if (geometry.length && geometry.width && geometry.height) {
    const { length: l, width: w, height: h } = geometry;
    return roundMoney((2 * (l * w + l * h + w * h)) / 10000);
  }
  if (geometry.bboxCm3 != null && geometry.bboxCm3 > 0) {
    const edge = Math.cbrt(geometry.bboxCm3 * 1000);
    return roundMoney((6 * edge * edge) / 10000);
  }
  return 0.5;
}

export function computeFinishingComplexityMultiplier(complexity = {}, feature = {}) {
  let mult = 1;
  mult += (complexity.score ?? 0) * 0.35;
  mult += Math.min((feature.holeCount ?? 0) * 0.012, 0.15);
  mult += Math.min((feature.counterbored ?? 0) * 0.025, 0.12);
  mult += Math.min((feature.cavityCount ?? 0) * 0.06, 0.18);
  mult += Math.min((feature.filletCount ?? 0) * 0.004, 0.08);
  if (complexity.level === 'simple') mult -= 0.10;
  if (complexity.level === 'complex') mult += 0.12;
  return roundMoney(Math.max(0.82, Math.min(mult, 1.75)));
}

function resolveFinishingProfile(finishingText, rates) {
  const text = String(finishingText || '').trim();
  if (/喷砂.*阳极|阳极.*喷砂/.test(text)) {
    return {
      label: '喷砂+阳极',
      setup: rates.finishingSandblastAnodizeSetup ?? 18,
      perDm2: rates.finishingSandblastAnodizePerDm2 ?? 26,
      minFee: rates.finishingSandblastAnodizeMin ?? rates.finishingSandblastAnodize ?? 48,
    };
  }
  if (/阳极/.test(text)) {
    return {
      label: '阳极',
      setup: rates.finishingAnodizeSetup ?? 16,
      perDm2: rates.finishingAnodizePerDm2 ?? 22,
      minFee: rates.finishingAnodizeMin ?? rates.finishingAnodize ?? 38,
    };
  }
  if (/喷砂/.test(text)) {
    return {
      label: '喷砂',
      setup: rates.finishingSandblastSetup ?? 12,
      perDm2: rates.finishingSandblastPerDm2 ?? 16,
      minFee: rates.finishingSandblastMin ?? 28,
    };
  }
  if (/电镀|喷涂|氧化|抛光|拉丝|喷漆|烤漆|丝印|激光打标|UV打印|喷油/.test(text)) {
    return {
      label: '其它表面',
      setup: rates.finishingGenericSetup ?? 14,
      perDm2: rates.finishingGenericPerDm2 ?? 18,
      minFee: rates.finishingGenericMin ?? 32,
    };
  }
  return null;
}

/**
 * 表面处理费 = max(底价, (setup + 计费面积×单价) × 复杂度系数)
 * 计费面积 = max(实际表面积, 最低开单面积)
 */
export function estimateFinishingFee(finishing, rates, geometry = {}, feature = {}, complexity = {}) {
  const text = String(finishing || '').trim();
  if (isNoSurfaceTreatment(text)) {
    return { fee: 0, detail: null, areaDm2: 0, complexityMult: 1, label: null };
  }

  const profile = resolveFinishingProfile(text, rates);
  if (!profile) {
    return { fee: 0, detail: null, areaDm2: 0, complexityMult: 1, label: null };
  }

  const actualAreaDm2 = estimateSurfaceAreaDm2(geometry);
  const minArea = rates.finishingMinBillableAreaDm2 ?? 0.55;
  const billableAreaDm2 = roundMoney(Math.max(actualAreaDm2, minArea));
  const complexityMult = computeFinishingComplexityMultiplier(complexity, feature);
  const variable = roundMoney((profile.setup + billableAreaDm2 * profile.perDm2) * complexityMult);
  const fee = roundMoney(Math.max(profile.minFee, variable));
  const detail = `${profile.label} ${billableAreaDm2}dm²×¥${profile.perDm2}+setup¥${profile.setup} 复杂度×${complexityMult}`;

  return {
    fee,
    detail,
    areaDm2: billableAreaDm2,
    actualAreaDm2,
    complexityMult,
    label: profile.label,
  };
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

export function classifyPartComplexity(geometry, feature, rates = DEFAULT_QUOTE_RATES) {
  const removalCm3 = geometry.removalCm3 ?? 0;
  const volumeCm3 = geometry.volumeCm3 ?? 0;
  const bboxCm3 = geometry.bboxCm3 ?? volumeCm3 ?? 0;
  const removalRatio = bboxCm3 > 0 ? removalCm3 / bboxCm3 : 0;
  const removalIntensity = volumeCm3 > 0
    ? Math.min(removalCm3 / Math.max(volumeCm3, 0.25), 6) / 6
    : Math.min(removalCm3 / 6, 1);

  const featureUnits = roundMoney(
    (feature.holeCount || 0)
    + (feature.filletCount || 0) * 0.35
    + (feature.cavityCount || 0) * 2.5
    + (feature.shaftCount || 0) * 2
    + (feature.counterbored || 0) * 0.5,
  );

  const score = roundMoney(Math.min(Math.max(
    removalRatio * 0.38
    + removalIntensity * 0.32
    + Math.min(featureUnits / 8, 1) * 0.22
    + Math.min(Math.log10(bboxCm3 + 1) / 3.2, 1) * 0.08,
    0,
  ), 1));

  const isSimple = removalCm3 <= (rates.simplePartMaxRemovalCm3 ?? 2.8)
    && removalRatio <= (rates.simplePartMaxRemovalRatio ?? 0.30)
    && featureUnits <= (rates.simplePartMaxFeatureUnits ?? 3.5)
    && (feature.cavityCount || 0) === 0
    && (feature.shaftCount || 0) === 0;

  let level = 'standard';
  if (isSimple) level = 'simple';
  else if (score >= 0.62 || removalCm3 > 40 || (feature.holeCount || 0) > 12) level = 'complex';

  return {
    level,
    score,
    isSimple,
    removalRatio: roundMoney(removalRatio),
    removalIntensity: roundMoney(removalIntensity),
    featureUnits,
  };
}

function resolveSetupMinutes(complexity, rates) {
  return complexity.isSimple
    ? (rates.setupMinutesSimple ?? 15)
    : (rates.setupMinutesStandard ?? 45);
}

function resolveMaterialMrr(material, rates) {
  const byCategory = {
    '铝合金': rates.mrrAluminum,
    '铜合金': rates.mrrBrass,
    '合金钢': rates.mrrSteel,
    '不锈钢': rates.mrrStainless,
    '塑料': rates.mrrPlastic,
  };
  const override = byCategory[material.category];
  const base = Math.max(override ?? material.mrrCm3PerMin ?? 10, 0.5);
  const scale = rates.mrrScale ?? 1;
  return roundMoney(Math.max(base * scale, 0.3));
}

function computeFeatureMinutes(feature, rates, featureFactor, material) {
  const scale = rates.featureTimeScale ?? 1;
  const brassScale = material.category === '铜合金' ? (rates.brassFeatureScale ?? 1) : 1;
  let minutes = 0;
  minutes += feature.small * rates.smallHole;
  minutes += feature.standard * rates.standardHole;
  minutes += feature.large * rates.largeHole;
  minutes += feature.counterbored * rates.counterboredPremium;
  minutes += Math.min(feature.filletCount, rates.filletCap) * rates.filletEach;
  minutes += feature.cavityCount * rates.cavityEach;
  minutes += feature.shaftCount * rates.shaftEach;
  return roundMoney(minutes * featureFactor * scale * brassScale);
}

function computeMachiningMinutes(geometry, feature, material, rates) {
  const hourly = rates.machineHourlyCny;
  let minutes = 0;

  const mrr = resolveMaterialMrr(material, rates);
  if (geometry.removalCm3 != null && geometry.removalCm3 > 0) {
    minutes += geometry.removalCm3 / mrr;
  }
  if (geometry.volumeCm3 != null) {
    minutes += geometry.volumeCm3 * (rates.finishMinPerPartVolumeCm3 ?? 0.015);
  }
  if (geometry.bboxCm3 != null && geometry.bboxCm3 > rates.bboxThresholdCm3) {
    minutes += (geometry.bboxCm3 - rates.bboxThresholdCm3) * (rates.bboxExtraMinPerCm3 ?? 0.012);
  }
  if (feature.faceCount != null && feature.faceCount > rates.faceThreshold) {
    minutes += (feature.faceCount - rates.faceThreshold) * (rates.faceExtraMinEach ?? 0.08);
  }

  minutes *= (material.machiningFactor ?? 1) * (material.category === '铜合金' ? (rates.brassDurationFactor ?? 1) : 1);
  return { minutes: roundMoney(minutes), hourly, mrr };
}

function computeLargeRemovalSurcharge(geometry, rates) {
  const threshold = rates.largeRemovalThresholdCm3 ?? 35;
  const removal = geometry.removalCm3 ?? 0;
  if (removal <= threshold) return 0;
  const perCm3 = rates.largeRemovalSurchargePerCm3 ?? 0;
  return roundMoney((removal - threshold) * perCm3);
}

function computeBlankMaterialCost(geometry, material, rates) {
  const blankCm3 = geometry.bboxCm3 ?? geometry.volumeCm3;
  if (blankCm3 == null) return { materialCost: 0, blankMassG: null, blankCm3: null };

  const scrapFactor = rates.materialScrapFactor ?? 1.10;
  const priceMultiplier = rates.materialPriceMultiplier ?? 1;
  const pricePerKg = roundMoney(material.pricePerKg * priceMultiplier);
  let blankMassG = roundMoney(blankCm3 * material.density * scrapFactor);
  const minBillingG = rates.materialMinBillingG ?? 0;
  if (minBillingG > 0) blankMassG = Math.max(blankMassG, minBillingG);
  const materialCost = roundMoney((blankMassG / 1000) * pricePerKg);
  return { materialCost, blankMassG, blankCm3: roundMoney(blankCm3), pricePerKg };
}

function buildProcessDetail(materialCost, setupCost, featureCost, finishingFee, fixtureFee, material, complexity, hourly) {
  const parts = [
    `毛坯材料¥${materialCost}`,
    `调机¥${setupCost}`,
    `工序¥${featureCost}`,
  ];
  if (fixtureFee > 0) parts.push(`装夹¥${fixtureFee}`);
  if (finishingFee > 0) parts.push(`表面¥${finishingFee}`);
  const tag = complexity?.level === 'simple' ? ' 简单件' : '';
  return `${parts.join('+')} (${material.key} ¥${hourly}/h${tag})`;
}

function buildDurationDetail(machining, hourly) {
  return `切削${machining.minutes}min×¥${hourly}/h MRR${machining.mrr}`;
}

function buildTimeSummary(setupMinutes, featureMinutes, machiningMinutes) {
  return `调机${setupMinutes}min+工序${featureMinutes}min+切削${machiningMinutes}min`;
}

/**
 * @param {object} input
 */
export function estimateQuote(input = {}) {
  const baseRates = { ...DEFAULT_QUOTE_RATES, ...(input.rates || {}) };
  const material = resolveMaterialProfile(input.material, input.materialCategory);
  const quantity = Math.max(1, parseInt(input.quantity, 10) || 1);
  const { rates, tier, tierLabel, quoteMode } = resolveQuantityRates(
    baseRates,
    quantity,
    { pricingTier: input.pricingTier },
  );
  const hourly = rates.machineHourlyCny;

  const geometry = resolveGeometryInput(input);
  const feature = resolveFeatureInput(input);
  const finishingText = input.finishing ?? input.surfaceTreatment;
  const complexity = classifyPartComplexity(geometry, feature, rates);

  const { materialCost, blankMassG, blankCm3, pricePerKg } = computeBlankMaterialCost(geometry, material, rates);
  const partMassG = geometry.volumeCm3 != null
    ? roundMoney(geometry.volumeCm3 * material.density)
    : null;

  const setupMinutes = resolveSetupMinutes(complexity, rates);
  const setupHourly = rates.setupMachineHourlyCny ?? hourly;
  const setupCost = minutesToCost(setupMinutes, setupHourly * material.machiningFactor) / quantity;

  const featureMinutes = computeFeatureMinutes(feature, rates, material.featureFactor, material);
  const featureCost = minutesToCost(featureMinutes, hourly * material.machiningFactor);

  const machining = computeMachiningMinutes(geometry, feature, material, rates);
  const removalSurcharge = computeLargeRemovalSurcharge(geometry, rates);
  const durationCost = roundMoney(minutesToCost(machining.minutes, hourly) + removalSurcharge);

  const finishingResult = estimateFinishingFee(finishingText, rates, geometry, feature, complexity);
  const finishingFee = roundMoney(finishingResult.fee);
  const fixtureFee = roundMoney(rates.fixtureFeeCny ?? 0);
  const processCost = roundMoney(materialCost + setupCost + featureCost + finishingFee + fixtureFee);
  const manufacturingSubtotal = roundMoney(processCost + durationCost);

  const machineTimeCost = roundMoney(setupCost + featureCost + durationCost);
  const setupMinutesPerUnit = roundMoney(setupMinutes / quantity);
  const estimatedMinutes = roundMoney(setupMinutesPerUnit + featureMinutes + machining.minutes);
  const timeSummary = buildTimeSummary(setupMinutesPerUnit, featureMinutes, machining.minutes);

  const subtotalBeforeTax = roundMoney(manufacturingSubtotal + SHIPPING_CNY);
  const tax = roundMoney(subtotalBeforeTax * TAX_RATE);
  const unitTotal = roundMoney(subtotalBeforeTax + tax);
  const lineTotal = roundMoney(unitTotal * quantity);

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
  if (complexity.isSimple) {
    reviewReasons.push('simple_part_estimate');
  }
  if (!isNoSurfaceTreatment(finishingText) && finishingFee === 0) {
    reviewReasons.push('unknown_surface_treatment');
  }
  if (!MATERIAL_PROFILES[material.key] && !CATEGORY_DEFAULTS[material.category]) {
    reviewReasons.push('unknown_material');
  }

  const confidence = autoQuoteEligible
    ? (complexity.isSimple ? 'medium' : 'high')
    : 'review';
  if (!autoQuoteEligible && !reviewReasons.length) {
    reviewReasons.push('manual_review_required');
  }

  return {
    currency: 'CNY',
    quantity,
    unitPrice: unitTotal,
    totalPrice: lineTotal,
    quoteMode,
    pricingBasis: tier === 'small-batch' ? 'small-batch-market' : PRICING_BASIS,
    pricingTier: tier,
    pricingTierLabel: tierLabel,
    material: {
      key: material.key,
      label: material.label,
      category: material.category,
      density: material.density,
      pricePerKg: pricePerKg ?? material.pricePerKg,
      listPricePerKg: material.pricePerKg,
      mrrCm3PerMin: machining.mrr,
      featureFactor: material.featureFactor,
      machiningFactor: material.machiningFactor,
    },
    breakdown: {
      processCost,
      durationCost,
      manufacturingSubtotal,
      materialCost,
      blankCm3,
      setupCost,
      setupMinutes: setupMinutesPerUnit,
      featureCost,
      featureMinutes,
      machiningMinutes: machining.minutes,
      removalSurcharge,
      machineHourlyCny: hourly,
      mrrCm3PerMin: machining.mrr,
      fixtureFee,
      machineTimeCost,
      timeSummary,
      finishingFee,
      finishingDetail: finishingResult.detail,
      finishingAreaDm2: finishingResult.areaDm2,
      finishingComplexityMult: finishingResult.complexityMult,
      processDetail: buildProcessDetail(
        materialCost, setupCost, featureCost, finishingFee, fixtureFee, material, complexity, hourly,
      ),
      durationDetail: buildDurationDetail(machining, hourly),
      estimatedMinutes,
      shipping: SHIPPING_CNY,
      tax,
      taxRate: TAX_RATE,
      subtotalBeforeTax,
      profitMargin: 0,
      partComplexity: complexity.level,
      complexityScore: complexity.score,
      finishing: finishingFee,
    },
    geometry: {
      ...geometry,
      massG: partMassG,
      blankMassG,
      density: material.density,
      materialKey: material.key,
    },
    features: feature,
    autoQuoteEligible,
    confidence,
    requiresManualReview: !autoQuoteEligible,
    reviewReasons: [...new Set(reviewReasons)],
    formulaVersion: '1.5.1',
    calibrationSource: tier === 'small-batch'
      ? 'small-batch-market'
      : '4-order-cost-benchmark',
  };
}

export function buildQuoteShopifyAttributes(quote) {
  if (!quote) return [];

  const b = quote.breakdown;
  const m = quote.material;

  const priceTag = quote.pricingTier === 'small-batch' ? '(小批量)' : '(成本)';
  const modeLabel = quote.pricingTier === 'small-batch'
    ? '单件小批量市场价'
    : '市场成本价(不含利润)';

  const attrs = [
    {
      key: '自动估价',
      value: quote.autoQuoteEligible ? `¥${quote.unitPrice}${priceTag}` : '待人工报价',
    },
    { key: '估价模式', value: modeLabel },
    { key: '数量档位', value: quote.pricingTierLabel || '标准批量' },
    { key: '估价置信度', value: quote.confidence === 'high' ? '高' : quote.confidence === 'medium' ? '中(简单件)' : '需复核' },
    { key: '估价数量', value: String(quote.quantity) },
    { key: '估价总价', value: `¥${quote.totalPrice}` },
    { key: '加工工艺费', value: `¥${b.processCost} (${b.processDetail})` },
    { key: '加工时长费', value: `¥${b.durationCost} (${b.durationDetail})` },
    { key: '机时合计', value: `¥${b.machineTimeCost} (调机+工序+切削)` },
    { key: '预估加工时长', value: `${b.estimatedMinutes} 分钟 (${b.timeSummary})` },
    { key: '机时费率', value: `¥${b.machineHourlyCny}/h` },
    { key: '运费', value: `¥${b.shipping}` },
    { key: '税费', value: `¥${b.tax}` },
    { key: '材料大类', value: m.category },
    { key: '材料牌号', value: m.label },
    { key: '材料费', value: `¥${b.materialCost}(毛坯${quote.pricingTier === 'small-batch' ? '/最低开料' : ''})` },
    { key: '材料单价', value: `¥${m.pricePerKg}/kg` },
    { key: 'MRR', value: `${m.mrrCm3PerMin} cm³/min` },
    { key: '开机费', value: `¥${b.setupCost} (${b.setupMinutes}min)` },
    { key: '特征加工费', value: `¥${b.featureCost}` },
  ];

  if (b.fixtureFee > 0) {
    attrs.push({ key: '装夹费', value: `¥${b.fixtureFee}` });
  }
  if (b.finishingFee > 0) {
    const finishDetail = b.finishingDetail ? ` (${b.finishingDetail})` : '';
    attrs.push({ key: '表面处理费', value: `¥${b.finishingFee}${finishDetail}` });
  }
  if (quote.geometry.blankMassG != null) {
    attrs.push({ key: '毛坯质量', value: `${quote.geometry.blankMassG} g` });
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
    quoteMode: quote.quoteMode,
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
