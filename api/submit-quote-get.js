// 支持GET请求的submit-quote API用于测试
export default function handler(req, res) {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 支持GET和POST请求
  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      message: 'submit-quote API工作正常！(GET版本)',
      method: req.method,
      timestamp: new Date().toISOString(),
      note: '原始API只支持POST请求，这是GET测试版本'
    });
  }

  // POST请求的简化处理
  if (req.method === 'POST') {
    return res.status(200).json({
      success: true,
      message: 'submit-quote API工作正常！(POST版本)',
      method: req.method,
      timestamp: new Date().toISOString(),
      note: '这是POST测试版本，不包含完整的询价逻辑'
    });
  }

  // 其他方法
  res.status(405).json({
    error: 'Method not allowed',
    allowed: ['GET', 'POST', 'OPTIONS']
  });
}
