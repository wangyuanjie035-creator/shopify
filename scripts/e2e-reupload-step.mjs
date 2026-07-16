#!/usr/bin/env node
/**
 * 方式二 E2E：模拟前台上传 → 特征分析 → 创建 Draft Order
 *
 * Usage:
 *   node scripts/e2e-reupload-step.mjs "e:\Chrome\文件下载\Carriage.STEP"
 *
 * Env:
 *   API_BASE=https://shopify-13s4.vercel.app/api  (default)
 *   CUSTOMER_EMAIL=test@example.com
 */

import fs from 'fs';
import path from 'path';

const API_BASE = (process.env.API_BASE || 'https://shopify-13s4.vercel.app/api').replace(/\/$/, '');
const CUSTOMER_EMAIL = process.env.CUSTOMER_EMAIL || 'jonathan.wang@sainstore.com';
const CUSTOMER_NAME = process.env.CUSTOMER_NAME || 'E2E测试';

const fileArg = process.argv[2];
if (!fileArg) {
  console.error('Usage: node scripts/e2e-reupload-step.mjs <file.step>');
  process.exit(1);
}

const filePath = path.resolve(fileArg);
const fileName = path.basename(filePath);
const fileBuffer = fs.readFileSync(filePath);
const base64 = fileBuffer.toString('base64');

function buildMachiningAttrs(analysisJson) {
  const features = analysisJson?.features;
  if (!features) return [{ key: '加工特征状态', value: '解析失败' }];

  const attrs = [
    { key: '加工特征状态', value: features.statusLabel || features.status },
    { key: '孔数量', value: String(features.summary?.holeCount ?? 0) },
    { key: '型腔数量', value: String(features.summary?.cavityCount ?? 0) },
    { key: '圆角数量', value: String(features.summary?.filletCount ?? 0) },
    { key: '轴凸台数量', value: String(features.summary?.shaftCount ?? 0) },
    { key: '需人工复核', value: features.requiresManualReview ? '是' : '否' },
  ];

  if (features.reviewReasons?.length) {
    attrs.push({ key: '复核原因', value: features.reviewReasons.join(', ') });
  }
  if (analysisJson.shopifyDetailAttributes) {
    for (const item of analysisJson.shopifyDetailAttributes || []) {
      attrs.push({ key: item.key, value: String(item.value) });
    }
  }
  return attrs;
}

async function main() {
  console.log('API:', API_BASE);
  console.log('File:', fileName, `(${(fileBuffer.length / 1024).toFixed(1)} KB)`);

  // 0. API health
  const health = await fetch(`${API_BASE}/analyze-step-features`);
  const healthJson = await health.json();
  console.log('\n[0] analyze-step-features health:', health.ok ? 'OK' : 'FAIL', healthJson.palmetto?.baseUrl || healthJson.message);

  // 1. Upload to Shopify Files
  console.log('\n[1] Uploading to Shopify Files...');
  const uploadResp = await fetch(`${API_BASE}/store-file-real`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName, fileData: base64, fileType: 'application/step' }),
  });
  const uploadJson = await uploadResp.json();
  if (!uploadResp.ok || !uploadJson.success) {
    throw new Error(`Upload failed: ${uploadJson.message || uploadResp.status}`);
  }
  console.log('    fileId:', uploadJson.fileId);
  console.log('    shopifyFileUrl:', uploadJson.shopifyFileUrl?.slice(0, 80) + '...');

  // 2. Feature analysis (Vercel -> Palmetto)
  console.log('\n[2] Analyzing STEP features...');
  const analyzeResp = await fetch(`${API_BASE}/analyze-step-features`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileUrl: uploadJson.shopifyFileUrl,
      fileName,
    }),
  });
  const analyzeJson = await analyzeResp.json();
  if (!analyzeResp.ok || !analyzeJson.success) {
    throw new Error(`Analyze failed: ${analyzeJson.message || analyzeResp.status}`);
  }

  const f = analyzeJson.features;
  console.log('    schemaVersion:', f.schemaVersion);
  console.log('    holeCount:', f.summary?.holeCount, '(raw:', f.summary?.holeCountRaw, 'merged:', f.summary?.holesMergedAway, ')');
  console.log('    counterbored:', f.insights?.holes?.counterboredCount);
  console.log('    requiresManualReview:', f.requiresManualReview);

  // 3. Create draft order
  console.log('\n[3] Creating draft order...');
  const machiningAttrs = buildMachiningAttrs(analyzeJson);
  const lineItems = [{
    title: fileName,
    quantity: 1,
    price: 0,
    requires_shipping: false,
    customAttributes: [
      { key: 'Order Type', value: '3D Model Quote' },
      { key: '文件类型', value: '3D' },
      { key: '客户姓名', value: CUSTOMER_NAME },
      { key: '客户邮箱', value: CUSTOMER_EMAIL },
      { key: '材料', value: '铝合金-6061' },
      { key: 'Quote Status', value: f.requiresManualReview ? 'Pending Review' : 'Features Analyzed' },
      { key: '文件ID', value: uploadJson.fileId },
      { key: 'Shopify文件URL', value: uploadJson.shopifyFileUrl },
      ...machiningAttrs,
    ],
  }];

  const quoteResp = await fetch(`${API_BASE}/submit-quote-real`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerName: CUSTOMER_NAME,
      customerEmail: CUSTOMER_EMAIL,
      fileName,
      lineItems,
    }),
  });
  const quoteJson = await quoteResp.json();
  if (!quoteResp.ok || !quoteJson.success) {
    throw new Error(`submit-quote failed: ${quoteJson.message || quoteResp.status}`);
  }

  const draftId = quoteJson.draftOrderId;
  console.log('    draftOrderId:', draftId);
  console.log('    quoteId:', quoteJson.quoteId);

  // 4. Read back draft order (admin view)
  console.log('\n[4] Reading draft order back...');
  const idParam = encodeURIComponent(draftId);
  const orderResp = await fetch(`${API_BASE}/get-draft-order-simple?id=${idParam}&admin=1&email=${encodeURIComponent(CUSTOMER_EMAIL)}`);
  const orderJson = await orderResp.json();

  const attrs = orderJson?.order?.lineItems?.[0]?.customAttributes
    || orderJson?.lineItems?.[0]?.customAttributes
    || [];

  const pick = (key) => attrs.find((a) => a.key === key)?.value;
  console.log('\n=== 后台订单属性（核对） ===');
  for (const key of ['孔数量', '孔识别原始数', '孔去重合并数', '沉头/台阶孔数', '需人工复核', '加工特征状态', 'schemaVersion']) {
    const v = pick(key);
    if (v != null) console.log(`  ${key}: ${v}`);
  }
  if (!pick('孔识别原始数')) {
    console.log('  (孔识别原始数/孔去重合并数 在 shopifyDetailAttributes 中，见下方)');
    for (const a of attrs) {
      if (a.key.includes('孔')) console.log(`  ${a.key}: ${a.value}`);
    }
  }

  console.log('\n后台查看: /pages/admin-draft-orders');
  console.log('Draft Order ID:', draftId);
}

main().catch((err) => {
  console.error('\nE2E failed:', err.message);
  process.exit(1);
});
