// 测试版本的get-draft-order API
export default function handler(req, res) {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 支持GET请求
  if (req.method === 'GET') {
    const { id } = req.query;
    
    return res.status(200).json({
      success: true,
      message: 'get-draft-order-test API工作正常！',
      quoteId: id || 'test',
      timestamp: new Date().toISOString(),
      note: '这是测试版本的get-draft-order API'
    });
  }

  // 其他方法
  res.status(405).json({
    error: 'Method not allowed',
    allowed: ['GET', 'OPTIONS']
  });
}
