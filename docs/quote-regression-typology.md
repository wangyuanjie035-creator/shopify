# 零件分型批量回归

对标集：`scripts/fixtures/regression-parts.json`  
命令：`node scripts/regress-part-typology.mjs`

## 分型

| typology | 中文 | 典型件 |
|----------|------|--------|
| `simple-plate` | 简单薄板 | 侧孔板 |
| `low-removal-multi-hole` | 低去除多孔板 | 烙铁支架上层 |
| `low-removal-standard` | 低去除标准件 | 烙铁支架下层 |
| `plastic-shell` | 壳体塑料件 | 手电筒 ABS |
| `shell` | 壳体/空心件 | 金属薄壁壳体 |
| `large-removal-complex` | 大去除/复杂件 | DoorStop / Carriage |

壳体判定：`去除/体积 > 4` **且** `体积/包络 ≤ 0.12`（避免 DoorStop 类大块开料被当成壳体）。

## 最新结果（v1.6.6）

| 件 | 分型 | 对标 | 估价 | 误差 |
|----|------|-----:|-----:|-----:|
| 侧孔板 | 简单薄板 | 56.48 | 58.08 | +2.8% |
| 烙铁上层 | 低去除多孔板 | 77.01 | 80.90 | +5.1% |
| 烙铁下层 | 低去除标准件 | 161.47 | 144.56 | -10.5% |
| 手电筒 | 壳体塑料件 | 308.14 | 232.31 | -24.6% |
| Bracket | 大去除/复杂 | 124.95 | 91.11 | -27.1% |
| DoorStop | 大去除/复杂 | 808.43 | 884.30 | +9.4% |
| metal cup | 大去除/复杂 | 376.18 | 419.35 | +11.5% |
| Carriage | 大去除/复杂 | 296.03 | 383.16 | +29.4% |

- **整体 MAPE：15.1%**（n=8）
- **平台零售件 MAPE：10.8%**（n=4）
- **成本四单 MAPE：19.4%**（n=4，`pricingTier=standard`）

`80×80×7` 暂 skip（无真实 STEP）。

## 说明

- 平台件用 `manufacturingSubtotal` 或 `unitPrice` 对齐截图口径
- 成本四单强制 `pricingTier: standard`，与 `calibrate-quotes.mjs` 一致
- 分型不符会单独打印；加新件时写入 fixture 再跑本脚本
