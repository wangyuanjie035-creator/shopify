#!/usr/bin/env node
/**
 * WorkBuddy build_cnc_quote.py 与 quote-engine 对标
 * 运行：node scripts/compare-workbuddy-benchmark.mjs
 */
import { estimateQuote } from '../utils/quote-engine.js';
import {
  WB_MATERIALS,
  WB_MACHINES,
  WB_FINISHING_PER_DM2,
  WB_OVERHEAD,
  estimateWorkbuddyQuote,
} from '../utils/quote-benchmark-workbuddy.js';

console.log('=== WorkBuddy build_cnc_quote.py → 引擎对标 ===\n');

console.log('## 1. 公式结构\n');
console.log('| 费用块 | WorkBuddy | quote-engine |');
console.log('|---|---|---|');
console.log('| 材料 | vol×ρ×价×(1+废料) | 毛坯×ρ×价×损耗 |');
console.log('| 加工 | (vol/1000+特征)×1/加工性×公差×¥/h | 去除/MRR+工序分钟×¥/h |');
console.log('| 设置 | setupH×操作员/qty | 调机min×机时/qty |');
console.log('| 表面 | ¥/dm²或¥/kg | ¥/dm²×复杂度 |');
console.log('| 商业 | 利润15%+管理8%+最低¥50 | 不含利润；运费¥4+税13% |');

console.log('\n## 2. 材质\n');
console.log('| 材质 | WB¥/kg | WB加工性 | 引擎¥/kg | 判定 |');
const matKeys = [
  ['M01', '6061铝', '铝合金-6061'],
  ['M03', '304不锈钢', 'SUS304'],
  ['M10', 'ABS', '工程塑料-ABS（白色）'],
];
for (const [code, label, engKey] of matKeys) {
  const wb = WB_MATERIALS[code];
  const eng = estimateQuote({ material: engKey, quantity: 1 });
  const engPrice = eng.material.listPricePerKg;
  console.log(`| ${label} | ${wb.pricePerKg} | ${wb.machinability} | ${engPrice} | 加工性可互校 |`);
}

console.log('\n## 3. 机时\n');
console.log(`| WB 3轴CNC | ¥${WB_MACHINES.E01.hourlyCny}/h | 车间成本级 |`);
console.log('| 引擎标准 | ¥110/h | 四单成本校准 |');
console.log('| 引擎小批量 | ¥165/h | 外协零售价 |');

console.log('\n## 4. 表面成本 vs 零售 (¥/dm²)\n');
console.log('| 工艺 | WB成本 | 引擎标准 | 引擎小批量 |');
console.log(`| 阳极 | ${WB_FINISHING_PER_DM2.S01.perDm2} | 28 | 48 |`);
console.log(`| 喷砂 | ${WB_FINISHING_PER_DM2.S09.perDm2} | 18 | 32 |`);
console.log('| 倍率 | ~1× | ~5× | ~6× | 零售加价合理 |');

console.log('\n## 5. 同参数试算：80×80×7 铝件 8孔\n');
const volCm3 = 80 * 80 * 7 / 1000; // 44.8
const areaDm2 = 2 * (80 * 80 + 80 * 7 + 80 * 7) / 100; // ~13.44

const wb = estimateWorkbuddyQuote({
  materialCode: 'M01',
  machineCode: 'E01',
  toleranceCode: 'T01',
  surfaceCode: 'S09',
  quantity: 1,
  volumeCm3: volCm3,
  areaDm2,
  features: { F01: 8, F15: 0 },
});

const eng = estimateQuote({
  material: '6061铝',
  finishing: '喷砂',
  quantity: 1,
  workpiece: {
    volumeMm3: volCm3 * 1000,
    bboxVolumeMm3: volCm3 * 1000,
    surfaceAreaMm2: areaDm2 * 100,
  },
  features: {
    status: 'ok',
    summary: { holeCount: 8 },
    insights: { topology: { faceCount: 32 }, holes: { dedupedCount: 8 } },
  },
});

console.log('| 来源 | 单件含税估价 | 材料 | 加工相关 |');
console.log(`| WorkBuddy(含利润) | ¥${wb.unitPrice} | ¥${wb.breakdown.materialCost} | ¥${(wb.breakdown.machiningCost + wb.breakdown.setupPerUnit).toFixed(2)} |`);
console.log(`| 引擎小批量 | ¥${eng.unitPrice} | ¥${eng.breakdown.materialCost} | ¥${(eng.breakdown.setupCost + eng.breakdown.featureCost + eng.breakdown.durationCost).toFixed(2)} |`);
console.log(`\nWB 最低报价门槛: ¥${WB_OVERHEAD.minimumQuoteCny}`);

console.log('\n## 6. 建议\n');
console.log('- ✅ 参考：特征库 F01~F15、公差系数、成本级表面价、加工性表');
console.log('- ❌ 不照搬：基础工时=体积/1000、满包络材料');
console.log('- 📋 待接入：公差选项、螺纹孔、最低报价¥50');
console.log('\n详见 docs/quote-benchmark-workbuddy.md');
