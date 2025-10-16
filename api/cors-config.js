/**
 * CORS配置 - 统一处理跨域请求
 */

export function setCorsHeaders(req, res) {
  // 允许多个来源的CORS请求
  const allowedOrigins = [
    'https://sain-pdc-test.myshopify.com',
    'null', // 允许本地文件测试
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ];
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://sain-pdc-test.myshopify.com');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}
