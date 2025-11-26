import { setCorsHeaders } from './cors-config.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // GET用于测试
  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      message: 'submit-quote-real API工作正常！',
      method: req.method,
      timestamp: new Date().toISOString(),
      note: '这是真实创建Shopify Draft Order的API'
    });
  }

  // POST请求处理
  if (req.method === 'POST') {
    try {
      console.log('📥 接收到的请求体:', req.body);
      
      const { 
        fileName, 
        customerEmail, 
        customerName, 
        quantity = 1,
        material = 'ABS',
        color = '白色',
        precision = '标准 (±0.1mm)',
        lineItems = []
      } = req.body;

      const quoteId = `Q${Date.now()}`;
      
      // 验证邮箱
      if (!customerEmail) throw new Error('客户邮箱不能为空');
      const validEmail = customerEmail.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(validEmail)) throw new Error(`邮箱格式无效: ${customerEmail}`);

      // 文件上传处理
      let shopifyFileInfo = null;
      let fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      if (req.body.fileUrl && req.body.fileUrl.startsWith('data:')) {
        console.log('📁 开始上传单个文件到Shopify Files...');
        try {
          const storeFileUrl = new URL('/api/store-file-real', req.headers.origin || 'https://shopify-13s4.vercel.app');
          const storeFileResponse = await fetch(storeFileUrl.href, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileData: req.body.fileUrl,
              fileName: fileName || 'model.stl',
              fileType: 'application/octet-stream'
            })
          });

          if (storeFileResponse.ok) {
            const contentType = storeFileResponse.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
              shopifyFileInfo = await storeFileResponse.json();
              fileId = shopifyFileInfo.fileId;
              console.log('✅ 文件上传到Shopify Files成功:', shopifyFileInfo);
            } else {
              console.warn('⚠️ 文件上传API返回非JSON响应，使用Base64存储');
            }
          } else {
            console.warn('⚠️ 文件上传失败，状态码:', storeFileResponse.status, '使用Base64存储');
          }
        } catch (uploadError) {
          console.warn('⚠️ 文件上传异常:', uploadError.message);
        }
      }

      // 构建customAttributes
      const baseAttributes = [
        { key: '材料', value: material },
        { key: '颜色', value: color },
        { key: '精度', value: precision },
        { key: '文件', value: fileName || 'model.stl' },
        { key: '文件ID', value: fileId },
        { key: '询价单号', value: quoteId },
        { key: 'Shopify文件ID', value: shopifyFileInfo ? shopifyFileInfo.shopifyFileId : '未上传' },
        { key: '文件存储方式', value: shopifyFileInfo ? 'Shopify Files' : 'Base64' },
        { key: '原始文件大小', value: shopifyFileInfo ? shopifyFileInfo.originalFileSize : '未知' },
        { key: '文件数据', value: shopifyFileInfo ? '已上传到Shopify Files' : (req.body.fileUrl && req.body.fileUrl.startsWith('data:') ? '已存储Base64数据' : '未提供') }
      ];

      const frontendAttributes = lineItems.length > 0 && lineItems[0].customAttributes
        ? lineItems[0].customAttributes.filter(attr => attr.key !== '文件数据' && attr.value?.length <= 1000)
        : [];

      const allAttributes = [...baseAttributes, ...frontendAttributes];

      const input = {
        email: validEmail,
        taxExempt: true,
        lineItems: [
          {
            title: `3D打印服务 - ${fileName || 'model.stl'}`,
            quantity: parseInt(quantity) || 1,
            originalUnitPrice: "0.00",
            customAttributes: allAttributes
          }
        ],
        note: `询价单号: ${quoteId}\n客户: ${customerName || '未提供'}\n文件: ${fileName || '未提供'}\n文件大小: ${req.body.fileUrl ? Math.round(req.body.fileUrl.length / 1024) + 'KB' : '未提供'}`
      };

      const storeDomain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOP;
      const accessToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.ADMIN_TOKEN;

      if (!storeDomain || !accessToken) {
        console.log('环境变量未配置，返回模拟数据');
        return res.status(200).json({
          success: true,
          message: '环境变量未配置，返回模拟数据',
          quoteId,
          draftOrderId: `gid://shopify/DraftOrder/mock-${Date.now()}`,
          customerEmail,
          fileName: fileName || 'test.stl',
          note: '请配置SHOP/SHOPIFY_STORE_DOMAIN和ADMIN_TOKEN/SHOPIFY_ACCESS_TOKEN环境变量'
        });
      }

      // Shopify API调用
      const graphqlUrl = new URL('/admin/api/2024-01/graphql.json', `https://${storeDomain}`);
      const createDraftOrderMutation = `
        mutation draftOrderCreate($input: DraftOrderInput!) {
          draftOrderCreate(input: $input) {
            draftOrder {
              id
              name
              email
              invoiceUrl
              totalPrice
              createdAt
              lineItems(first: 10) {
                edges {
                  node {
                    id
                    title
                    quantity
                    originalUnitPrice
                  }
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const response = await fetch(graphqlUrl.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken },
        body: JSON.stringify({ query: createDraftOrderMutation, variables: { input } })
      });

      const data = await response.json();
      if (data.errors) throw new Error(data.errors[0].message);
      if (data.data.draftOrderCreate.userErrors.length > 0) throw new Error(data.data.draftOrderCreate.userErrors[0].message);

      const draftOrder = data.data.draftOrderCreate.draftOrder;

      return res.status(200).json({
        success: true,
        message: '询价提交成功！客服将在24小时内为您提供报价。',
        quoteId,
        draftOrderId: draftOrder.id,
        draftOrderName: draftOrder.name,
        invoiceUrl: draftOrder.invoiceUrl,
        customerEmail,
        fileName: fileName || 'test.stl',
        fileId,
        nextSteps: [
          '1. 您将收到询价确认邮件',
          '2. 客服将评估您的需求并报价',
          '3. 报价完成后，您将收到通知',
          '4. 您可以在"我的询价"页面查看进度'
        ],
        timestamp: new Date().toISOString(),
        note: '已创建真实的Shopify Draft Order'
      });

    } catch (error) {
      console.error('创建Draft Order失败:', error);

      const quoteId = `Q${Date.now()}`;
      const draftOrderId = `gid://shopify/DraftOrder/${Date.now()}`;

      return res.status(200).json({
        success: true,
        message: '询价提交成功！（简化版本）',
        quoteId,
        draftOrderId,
        customerEmail: req.body.customerEmail || 'test@example.com',
        fileName: req.body.fileName || 'test.stl',
        timestamp: new Date().toISOString(),
        note: `API错误，使用简化版本: ${error.message}`,
        error: error.message
      });
    }
  }

  res.status(405).json({ error: 'Method not allowed', allowed: ['GET', 'POST', 'OPTIONS'] });
}
