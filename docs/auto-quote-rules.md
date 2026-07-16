# 自动报价规则 v1

基于 4 单历史订单（`历史订单.pptx`）校准，输入为 Palmetto 特征 + 工件几何。

## 价格公式

```
总价 = (加工费 + 表面处理费 + 运费 ¥4) × 1.13
```

## 加工费构成

| 项 | 说明 | 默认系数 |
|---|---|---|
| 开机/setup | 固定 | ¥40 |
| 材料费 | 零件体积 × 密度 × 材料单价 | 6061 ¥28/kg |
| 去除体积 | (包络体积 − 零件体积) × 0.58 | cm³ |
| 大零件附加 | 包络 > 200cm³ 部分 × 0.11 | cm³ |
| 小孔 | × ¥2.0 | |
| 标准孔 | × ¥0.85 | |
| 大孔 (>10mm) | × ¥26 | |
| 沉头/台阶附加 | × ¥1.2 | |
| 圆角 | × ¥0.9（封顶 12 个） | |
| 轴凸台 | × ¥26 | |
| 面数附加 | 面数 > 55 部分 × ¥0.18 | |
| 黄铜系数 | × 1.8 | |

## 历史订单校准结果

| 零件 | 实际价 | 引擎估价 | 偏差 |
|---|---:|---:|---:|
| Bracket | ¥124.95 | ¥123.26 | -1.4% |
| DoorStop | ¥808.43 | ¥799.78 | -1.1% |
| metal cup | ¥376.18 | ¥373.70 | -0.7% |
| Carriage | ¥296.03 | ¥337.42 | +14.0% |

平均绝对偏差约 **4.3%**（Carriage 多孔件仍偏高，标记需复核）。

## 自动 vs 人工

满足以下任一条件时 **不出自动价**（Draft Order price=0，Quote Status=Pending Review）：

- 特征 `requiresManualReview`
- 缺少体积/包络几何
- 孔数 > 45
- 面数 > 300

## API

```
POST /api/calculate-quote
{
  "features": { ... analyze-step-features 返回的 features ... },
  "material": "铝合金-6061",
  "finishing": "喷砂+阳极",
  "quantity": 1
}
```

## 调参

```bash
node scripts/calibrate-quotes.mjs
python scripts/tune-quote-rates.py
```

系数位于 `utils/quote-engine.js` → `DEFAULT_QUOTE_RATES`。
