/**
 * 机械加工自动报价计算表.zip → 加工件费用计算表.xls 提取参数
 * 仅作对标校验，不直接参与计价。来源：机械设计君通用模板（价格偏旧，需结合当前市场）。
 */

/** @type {Record<string, number>} 特征工序单价 ¥/项（表内为勾选计数，非分钟） */
export const XLS_FEATURE_UNIT_PRICES = {
  cncPass: 2.5,
  roughMillFace: 3.0,
  finishMillFace: 7.0,
  pocket: 6.0,
  precisionHole: 8.0,
  counterboreHole: 4.0,
  throughHole: 2.0,
  roughGrindFace: 7.0,
  finishGrindFace: 15.0,
  tapM5Below: 3.0,
  tapM6Above: 4.0,
  threadInsert: 5.0,
  chamferC3Below: 3.0,
  chamferC4Above: 5.0,
  wireEdm: 10.0,
  edm: 20.0,
};

/** @type {Record<string, number>} 表面处理 ¥/kg（表按毛坯重量） */
export const XLS_FINISHING_PER_KG = {
  anodize: 6.5,
  hardAnodize: 6.5,
  sandblast: 4.0,
  nickel: 6.5,
  chrome: 6.5,
  paint: 6.5,
};

/** 铣床人工 ¥/min（≈¥35/h 车间成本） */
export const XLS_MILL_LABOR_PER_MIN = 0.583;

/** 机加工报价单：数控 ¥/min */
export const XLS_CNC_PER_MIN_RETAIL = 0.95;

/** 模具车间 CNC ¥/h */
export const XLS_MOLD_SHOP_CNC_PER_HOUR = 60;

/** 数量折扣（标准批量 tier，不含 qty=1 小批量） */
export const XLS_BATCH_QTY_MULTIPLIERS = [
  { minQty: 31, multiplier: 0.75, label: '30件以上' },
  { minQty: 10, multiplier: 0.80, label: '10~30件' },
  { minQty: 2, multiplier: 0.90, label: '2~9件' },
];

/** 交期系数（商业层，引擎暂未默认启用） */
export const XLS_LEAD_TIME_MULTIPLIERS = {
  within1Day: 1.2,
  within2Days: 1.1,
  within3to4Days: 1.0,
  within4to10Days: 0.95,
};

/**
 * 将表内特征单价换算为等效分钟（用于与 MARKET_FEATURE_MINUTES 对比）
 * @param {number} unitPriceCny
 * @param {number} hourlyCny
 */
export function xlsPriceToEquivalentMinutes(unitPriceCny, hourlyCny = 165) {
  if (!hourlyCny) return null;
  return Math.round((unitPriceCny / hourlyCny) * 60 * 100) / 100;
}

/**
 * @param {number} quantity
 * @returns {{ multiplier: number, label: string | null }}
 */
export function resolveXlsBatchQuantityDiscount(quantity) {
  if (quantity < 2) return { multiplier: 1, label: null };
  for (const row of XLS_BATCH_QTY_MULTIPLIERS) {
    if (quantity >= row.minQty) return row;
  }
  return { multiplier: 1, label: null };
}
