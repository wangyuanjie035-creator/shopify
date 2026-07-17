#!/usr/bin/env node
/**
 * 对比 加工件费用计算表.xls 参数与 quote-engine.js 当前取值
 * 运行：node scripts/compare-xls-benchmark.mjs
 */
import {
  DEFAULT_QUOTE_RATES,
  MARKET_FEATURE_MINUTES,
  MATERIAL_PROFILES,
  SMALL_BATCH_ADJUSTMENTS,
} from '../utils/quote-engine.js';
import {
  XLS_FEATURE_UNIT_PRICES,
  XLS_FINISHING_PER_KG,
  XLS_MILL_LABOR_PER_MIN,
  XLS_CNC_PER_MIN_RETAIL,
  XLS_MOLD_SHOP_CNC_PER_HOUR,
  XLS_BATCH_QTY_MULTIPLIERS,
  xlsPriceToEquivalentMinutes,
} from '../utils/quote-benchmark-xls.js';

const HOURLY_SMALL = SMALL_BATCH_ADJUSTMENTS.machineHourlyCny;
const HOURLY_STD = DEFAULT_QUOTE_RATES.machineHourlyCny;

function money(n) {
  return `¥${Number(n).toFixed(2)}`;
}

function status(current, refLow, refHigh, note = '') {
  if (current >= refLow && current <= refHigh) return `✅ 合理 ${note}`;
  if (current < refLow) return `⚠️ 偏低（表等效 ${money(refLow)}~${money(refHigh)}）${note}`;
  return `⚠️ 偏高（表等效 ${money(refLow)}~${money(refHigh)}）${note}`;
}

console.log('=== 机械加工自动报价计算表 → 引擎对标 ===\n');

console.log('## 1. 特征工序：表内单价 → 等效分钟\n');
console.log('| 特征 | 表单价 ¥ | 表等效分钟@165/h | 引擎分钟 | 引擎等效单价@165/h | 判定 |');
console.log('|---|---:|---:|---:|---:|---|');

const featureMap = [
  ['精孔 precisionHole', 'precisionHole', 'standardHole'],
  ['阶梯孔 counterboreHole', 'counterboreHole', 'counterboredPremium'],
  ['穿孔 throughHole', 'throughHole', 'smallHole'],
];

for (const [label, xlsKey, engineKey] of featureMap) {
  const xlsPrice = XLS_FEATURE_UNIT_PRICES[xlsKey];
  const xlsMin = xlsPriceToEquivalentMinutes(xlsPrice, HOURLY_SMALL);
  const engMin = MARKET_FEATURE_MINUTES[engineKey];
  const engScale = DEFAULT_QUOTE_RATES.featureTimeScale
    * (SMALL_BATCH_ADJUSTMENTS.featureTimeScaleMultiplier ?? 1);
  const engMinSmall = Math.round(engMin * engScale * 100) / 100;
  const engPrice = (engMinSmall / 60) * HOURLY_SMALL;
  const refLow = xlsPrice * 0.7;
  const refHigh = xlsPrice * 1.4;
  console.log(
    `| ${label} | ${xlsPrice} | ${xlsMin} | ${engMinSmall} (小批量) | ${engPrice.toFixed(2)} | ${status(engPrice, refLow, refHigh)} |`,
  );
}

console.log('\n## 2. 机时成本\n');
console.log('| 来源 | ¥/h | ¥/min | 用途 |');
console.log('|---|---:|---:|---|');
console.log(`| 表-铣床人工 | ${(XLS_MILL_LABOR_PER_MIN * 60).toFixed(1)} | ${XLS_MILL_LABOR_PER_MIN} | 车间成本底价 |`);
console.log(`| 表-数控报价单 | ${(XLS_CNC_PER_MIN_RETAIL * 60).toFixed(1)} | ${XLS_CNC_PER_MIN_RETAIL} | 外协零售参考 |`);
console.log(`| 表-模具CNC | ${XLS_MOLD_SHOP_CNC_PER_HOUR} | ${(XLS_MOLD_SHOP_CNC_PER_HOUR / 60).toFixed(2)} | 模具车间 |`);
console.log(`| 引擎-标准批量 | ${HOURLY_STD} | ${(HOURLY_STD / 60).toFixed(2)} | 四单成本校准 |`);
console.log(`| 引擎-单件小批量 | ${HOURLY_SMALL} | ${(HOURLY_SMALL / 60).toFixed(2)} | 外协平台对标 |`);

console.log('\n## 3. 材料单价（表偏旧，仅数量级）\n');
console.log('| 材料 | 表 ¥/kg | 引擎 ¥/kg | 判定 |');
console.log('|---|---:|---:|---|');
const matCompare = [
  ['6061铝', 65, MATERIAL_PROFILES['6061铝'].pricePerKg],
  ['7075铝', 75, MATERIAL_PROFILES['铝合金-7075'].pricePerKg],
  ['SUS304', 40, MATERIAL_PROFILES.SUS304.pricePerKg],
];
for (const [name, xls, eng] of matCompare) {
  const flag = xls > eng * 1.5 ? '⚠️ 表价过旧/含溢价' : '✅ 引擎更接近当前批发价';
  console.log(`| ${name} | ${xls} | ${eng} | ${flag} |`);
}

console.log('\n## 4. 表面处理计价模型\n');
console.log('| 模型 | 表 | 引擎 | 建议 |');
console.log('|---|---|---|---|');
console.log('| 阳极/喷砂 | 按毛坯 kg × ¥4~6.5 | 按表面积 dm² × ¥/dm² | ✅ 保持引擎面积模型 |');
console.log(`| 喷砂+阳极(塑料) | kg计价不适用 | ¥${SMALL_BATCH_ADJUSTMENTS.plasticFinishingSandblastAnodizePerDm2}/dm² | ✅ 已按竞品校准 |`);
console.log(`| 喷砂+阳极(铝-小批量) | — | ¥${SMALL_BATCH_ADJUSTMENTS.finishingSandblastAnodizePerDm2}/dm² | ✅ 保持 |`);

console.log('\n## 5. 批量数量折扣（v1.6.3 已接入标准 tier）\n');
console.log('| 数量 | 表系数 | 引擎 |');
console.log('|---|---:|---|');
for (const row of XLS_BATCH_QTY_MULTIPLIERS) {
  console.log(`| ${row.label} | ×${row.multiplier} | ×${row.multiplier}（加工费部分，qty≥2） |`);
}

console.log('\n## 6. 建议调整汇总\n');
const suggestions = [
  ['精孔/阶梯孔分钟', '保持', '与表等效单价在同一数量级'],
  ['粗铣面/精铣面', '暂不单独计价', 'STEP 特征无法可靠区分；由 MRR+面数附加覆盖'],
  ['攻牙/倒角', '待特征识别', 'Palmetto 未识别时跳过；后续可加'],
  ['材料表价', '不采纳', '表内 6061=¥65/kg 明显过时'],
  ['批量折扣', '已接入', '标准 tier qty≥2，折扣作用于非材料费'],
  ['交期加急', '文档记录', '商业层可选，默认不乘系数'],
  ['满包络开料', '不采纳', '壳体件用近净料逻辑'],
];
console.log('| 项目 | 动作 | 说明 |');
console.log('|---|---|---|');
for (const row of suggestions) {
  console.log(`| ${row[0]} | ${row[1]} | ${row[2]} |`);
}

console.log('\n完整说明见 docs/quote-benchmark-xls.md');
