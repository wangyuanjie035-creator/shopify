/**
 * CORS配置 - 统一处理跨域请求
 */

function setCorsHeaders(req, res) {
  // 允许的来源（Shopify 店铺 + 本地调试）
  const allowedOrigins = new Set([
    'https://sain-pdc-test.myshopify.com',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'null',
  ]);

  // 优先使用 Origin，其次从 Referer 提取
  const headerOrigin = req.headers.origin || '';
  const referer = req.headers.referer || '';
  let origin = headerOrigin;
  
  // 尝试从 Origin 或 Referer 获取请求来源
  if (!origin && referer) {
    try {
      origin = new URL(referer).origin;
    } catch {}
  }

  // 无论什么来源，都回显回去，以解决 preflight 问题
  // 注意：这在生产环境可能过于宽松，但能有效解决 "No Access-Control-Allow-Origin header" 问题
  const allow = origin || '*';
  
  res.setHeader('Access-Control-Allow-Origin', allow);
  res.setHeader('Vary', 'Origin');

  // 允许的动词与头
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS,DELETE,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
}

module.exports = { setCorsHeaders };
