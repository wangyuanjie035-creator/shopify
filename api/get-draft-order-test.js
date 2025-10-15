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
    
    // 模拟询价单数据
    const mockQuote = {
      success: true,
      draftOrder: {
        id: `gid://shopify/DraftOrder/${Date.now()}`,
        name: id || 'Q123456',
        status: 'pending',
        totalPrice: '99.00',
        currency: 'CNY',
        customer: {
          email: 'test@example.com',
          firstName: '测试',
          lastName: '用户'
        },
        lineItems: [
          {
            title: '3D打印服务',
            quantity: 1,
            price: '99.00',
            customAttributes: [
              { key: '材料', value: 'ABS' },
              { key: '颜色', value: '白色' },
              { key: '精度', value: '标准 (±0.1mm)' }
            ]
          }
        ],
        createdAt: new Date().toISOString(),
        note: '这是测试询价单'
      },
      message: '询价单加载成功',
      timestamp: new Date().toISOString()
    };
    
    return res.status(200).json(mockQuote);
  }

  // 其他方法
  res.status(405).json({
    error: 'Method not allowed',
    allowed: ['GET', 'OPTIONS']
  });
}
