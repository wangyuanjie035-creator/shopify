// 简化版submit-quote API用于测试
export default function handler(req, res) {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 返回简单的成功响应
  res.status(200).json({
    success: true,
    message: 'submit-quote API工作正常！',
    method: req.method,
    timestamp: new Date().toISOString(),
    note: '这是简化版本，用于测试API路由'
  });
}
