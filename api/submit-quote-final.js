// 最终版本的submit-quote API - 支持GET和POST
export default function handler(req, res) {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // GET请求 - 用于测试API是否可访问
  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      message: 'submit-quote API工作正常！',
      method: req.method,
      timestamp: new Date().toISOString(),
      note: '这是最终版本的submit-quote API，支持GET和POST请求'
    });
  }

  // POST请求 - 用于实际询价提交
  if (req.method === 'POST') {
    try {
      // 获取请求数据
      const { 
        fileName, 
        fileData, 
        customerEmail, 
        customerName,
        quantity = 1,
        material = '未指定',
        color = '自然色',
        precision = '标准 (±0.1mm)',
        tolerance = 'GB/T 1804-2000 m级',
        roughness = 'Ra3.2',
        hasThread = 'no',
        hasAssembly = 'no',
        scale = 100,
        note = ''
      } = req.body;

      // 基本验证
      if (!fileName || !customerEmail) {
        return res.status(400).json({
          success: false,
          error: '缺少必要字段',
          required: ['fileName', 'customerEmail']
        });
      }

      // 模拟创建询价单
      const quoteId = `#Q${Date.now()}`;
      const draftOrderId = `gid://shopify/DraftOrder/${Date.now()}`;
      
      return res.status(200).json({
        success: true,
        message: '询价提交成功！',
        quoteId: quoteId,
        draftOrderId: draftOrderId,
        customerEmail: customerEmail,
        fileName: fileName,
        quantity: quantity,
        material: material,
        color: color,
        timestamp: new Date().toISOString(),
        note: '这是简化版本，用于测试POST请求功能'
      });

    } catch (error) {
      return res.status(500).json({
        success: false,
        error: '服务器错误',
        message: error.message
      });
    }
  }

  // 其他方法
  res.status(405).json({
    success: false,
    error: 'Method not allowed',
    allowed: ['GET', 'POST', 'OPTIONS']
  });
}
