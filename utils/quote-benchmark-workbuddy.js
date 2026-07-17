/**
 * WorkBuddy build_cnc_quote.py 参数化报价引擎 — 提取常量
 * 来源：CNC加工自动报价计算表.xlsx 生成脚本
 * 仅作对标/文档，不直接参与计价（除非在 quote-engine 中显式引用）
 */

/** 材质：密度 kg/m³, 单价 ¥/kg, 加工性系数(越大越快), 废料系数 */
export const WB_MATERIALS = {
  'M01': { name: '铝合金6061-T6', density: 2700, pricePerKg: 25, machinability: 1.0, wasteFactor: 0.15 },
  'M02': { name: '铝合金7075-T6', density: 2810, pricePerKg: 55, machinability: 0.95, wasteFactor: 0.15 },
  'M03': { name: '不锈钢304', density: 7930, pricePerKg: 18, machinability: 0.60, wasteFactor: 0.10 },
  'M04': { name: '不锈钢316', density: 7990, pricePerKg: 22, machinability: 0.55, wasteFactor: 0.10 },
  'M05': { name: '碳钢45#', density: 7850, pricePerKg: 6, machinability: 0.80, wasteFactor: 0.10 },
  'M07': { name: '黄铜H62', density: 8500, pricePerKg: 45, machinability: 1.10, wasteFactor: 0.12 },
  'M10': { name: 'ABS塑料', density: 1050, pricePerKg: 8, machinability: 1.30, wasteFactor: 0.05 },
  'M12': { name: '亚克力PMMA', density: 1190, pricePerKg: 12, machinability: 1.25, wasteFactor: 0.05 },
};

/** 设备：小时费率 ¥/h, 基准工时系数, 设置时间 h, 操作员 ¥/h */
export const WB_MACHINES = {
  'E01': { name: '3轴数控铣', hourlyCny: 80, baseTimeCoeff: 1.0, setupHours: 1.5, operatorHourlyCny: 40 },
  'E03': { name: '5轴数控铣', hourlyCny: 150, baseTimeCoeff: 1.3, setupHours: 3.0, operatorHourlyCny: 55 },
};

/**
 * 特征：单特征加时系数 × 数量 × 复杂度系数 → 加到基础工时(小时)
 * 复杂度列：1=简单, 2=中等, 3=复杂
 */
export const WB_FEATURES = {
  F01: { name: '通孔', unitCoeff: 0.05, complexity: [0.8, 1.0, 1.5] },
  F02: { name: '盲孔', unitCoeff: 0.08, complexity: [0.9, 1.2, 1.8] },
  F03: { name: '螺纹孔M级', unitCoeff: 0.10, complexity: [0.9, 1.0, 1.3] },
  F08: { name: '斜面/倒角', unitCoeff: 0.05, complexity: [0.8, 1.0, 1.5] },
  F09: { name: '曲面/圆弧', unitCoeff: 0.15, complexity: [1.0, 1.5, 2.5] },
  F11: { name: '深腔', unitCoeff: 0.20, complexity: [1.2, 1.8, 2.5] },
  F14: { name: '圆角R<1mm', unitCoeff: 0.08, complexity: [1.0, 1.5, 2.0] },
  F15: { name: '沉头孔', unitCoeff: 0.06, complexity: [0.8, 1.0, 1.5] },
};

/** 公差等级时间系数 */
export const WB_TOLERANCE = {
  T01: { name: '普通±0.1', timeMult: 1.0, inspectMult: 1.0 },
  T02: { name: '精密±0.05', timeMult: 1.3, inspectMult: 1.2 },
  T03: { name: '高精±0.02', timeMult: 1.8, inspectMult: 1.5 },
  T05: { name: '自由±0.5', timeMult: 0.8, inspectMult: 0.8 },
};

/** 表面处理：成本级单价 ¥/dm²（按面积） */
export const WB_FINISHING_PER_DM2 = {
  S01: { name: '阳极氧化本色', perDm2: 5 },
  S02: { name: '阳极氧化彩色', perDm2: 8 },
  S03: { name: '硬质阳极', perDm2: 12 },
  S09: { name: '喷砂', perDm2: 2 },
};

/** 商业层：管理费/利润/税/最低报价 */
export const WB_OVERHEAD = {
  managementRate: 0.08,
  profitRate: 0.15,
  taxRate: 0.13,
  packagingRate: 0.03,
  scrapRate: 0.03,
  minimumQuoteCny: 50,
};

/**
 * WorkBuddy 核心公式（与 build_cnc_quote.py 一致）
 *
 * materialCost = pricePerKg × density × volumeCm³/1e6 × (1 + wasteFactor)
 * baseTimeH = volumeCm³/1000 × machineBaseCoeff
 * featureAddH = Σ(qty × unitCoeff × complexityMult)
 * machiningTimeH = (baseTimeH + featureAddH) × (1/machinability) × toleranceTimeMult
 * machiningCost = machiningTimeH × machineHourlyCny
 * setupPerUnit = setupHours × operatorHourlyCny / quantity
 * finishingCost = perDm2 × areaDm²  (按面积时)
 * mfgCost = material + machining + setup + finishing + inspect
 * final = (mfgCost + scrap + mgmt + pkg) × (1+profit) × (1+tax)
 */
export function estimateWorkbuddyQuote(input = {}) {
  const mat = WB_MATERIALS[input.materialCode ?? 'M01'];
  const mach = WB_MACHINES[input.machineCode ?? 'E01'];
  const tol = WB_TOLERANCE[input.toleranceCode ?? 'T01'];
  const surf = WB_FINISHING_PER_DM2[input.surfaceCode ?? 'S13'];
  const quantity = Math.max(1, input.quantity ?? 1);
  const volumeCm3 = input.volumeCm3 ?? 0;
  const areaDm2 = input.areaDm2 ?? 0;

  const materialCost = mat.pricePerKg * mat.density * volumeCm3 / 1e6 * (1 + mat.wasteFactor);
  const baseTimeH = volumeCm3 / 1000 * mach.baseTimeCoeff;

  let featureAddH = 0;
  for (const [code, qty] of Object.entries(input.features ?? {})) {
    const feat = WB_FEATURES[code];
    if (!feat || !qty) continue;
    const level = Math.min(3, Math.max(1, input.featureComplexity?.[code] ?? 2)) - 1;
    featureAddH += qty * feat.unitCoeff * feat.complexity[level];
  }

  const machiningTimeH = (baseTimeH + featureAddH) * (1 / mat.machinability) * tol.timeMult;
  const machiningCost = machiningTimeH * mach.hourlyCny;
  const setupPerUnit = mach.setupHours * mach.operatorHourlyCny / quantity;
  const finishingCost = surf?.perDm2 ? surf.perDm2 * areaDm2 : 0;
  const inspectCost = tol.inspectMult * machiningTimeH * mach.operatorHourlyCny * 0.3;

  const mfgCost = materialCost + machiningCost + setupPerUnit + finishingCost + inspectCost;
  const withOverhead = mfgCost * (1 + WB_OVERHEAD.scrapRate + WB_OVERHEAD.managementRate + WB_OVERHEAD.packagingRate);
  const withProfit = withOverhead * (1 + WB_OVERHEAD.profitRate);
  const unitWithTax = withProfit * (1 + WB_OVERHEAD.taxRate) / quantity;
  const unitPrice = Math.max(unitWithTax, WB_OVERHEAD.minimumQuoteCny);

  return {
    unitPrice: Math.round(unitPrice * 100) / 100,
    breakdown: {
      materialCost: Math.round(materialCost * 100) / 100,
      machiningCost: Math.round(machiningCost * 100) / 100,
      setupPerUnit: Math.round(setupPerUnit * 100) / 100,
      finishingCost: Math.round(finishingCost * 100) / 100,
      machiningTimeH: Math.round(machiningTimeH * 1000) / 1000,
      featureAddH: Math.round(featureAddH * 1000) / 1000,
    },
  };
}
