// 支持GET和POST请求的submit-quote API
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
      message: 'submit-quote API工作正常！',
      method: req.method,
      timestamp: new Date().toISOString(),
      note: '这是工作版本的submit-quote API'
    });
  }

  // POST请求的简化处理
  if (req.method === 'POST') {
    // 获取请求数据
    const { fileName, customerEmail, customerName } = req.body;
    
    // 生成询价单号
    const quoteId = `Q${Date.now()}`;
    const draftOrderId = `gid://shopify/DraftOrder/${Date.now()}`;
    
    return res.status(200).json({
      success: true,
      message: '询价提交成功！',
      quoteId: quoteId,
      draftOrderId: draftOrderId,
      customerEmail: customerEmail || 'test@example.com',
      fileName: fileName || 'test.stl',
      timestamp: new Date().toISOString(),
      note: '这是简化版本，支持询价提交'
    });
  }

  // 其他方法
  res.status(405).json({
    error: 'Method not allowed',
    allowed: ['GET', 'POST', 'OPTIONS']
  });
}
