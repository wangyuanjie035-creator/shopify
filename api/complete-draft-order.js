// 直接设置CORS头
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://sain-pdc-test.myshopify.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24小时
}

export default async (req, res) => {
  console.log('🚀 complete-draft-order API 被调用:', req.method);
  
  // 设置CORS头
  setCorsHeaders(res);

  // 处理OPTIONS预检请求
  if (req.method === 'OPTIONS') {
    console.log('📡 处理OPTIONS预检请求');
    return res.status(200).end();
  }

  // 只允许POST请求
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed' 
    });
  }

  try {
    const { draftOrderId } = req.body;
    
    if (!draftOrderId) {
      return res.status(400).json({
        success: false,
        error: 'Draft Order ID is required'
      });
    }

    const shop = process.env.SHOP;
    const adminToken = process.env.ADMIN_TOKEN;

    if (!shop || !adminToken) {
      throw new Error('Missing environment variables: SHOP or ADMIN_TOKEN');
    }

    const shopifyDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;
    const graphqlEndpoint = `https://${shopifyDomain}/admin/api/2024-01/graphql.json`;

    console.log('🔄 开始完成草稿订单:', draftOrderId);

    // 首先检查草稿订单状态
    const checkDraftOrderQuery = `
      query getDraftOrder($id: ID!) {
        draftOrder(id: $id) {
          id
          name
          email
          totalPrice
          status
          invoiceUrl
          completedAt
        }
      }
    `;

    const checkResponse = await fetch(graphqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': adminToken,
      },
      body: JSON.stringify({
        query: checkDraftOrderQuery,
        variables: { id: draftOrderId }
      })
    });

    const checkResult = await checkResponse.json();
    console.log('📋 草稿订单状态检查:', checkResult);

    if (!checkResult.data?.draftOrder) {
      throw new Error('Draft order not found');
    }

    const draftOrder = checkResult.data.draftOrder;

    // 如果草稿订单已经完成，直接返回结果
    if (draftOrder.status === 'COMPLETED' || draftOrder.completedAt) {
      console.log('✅ 草稿订单已完成，返回现有结果');
      return res.status(200).json({
        success: true,
        draftOrder: {
          id: draftOrder.id,
          name: draftOrder.name,
          email: draftOrder.email,
          totalPrice: draftOrder.totalPrice,
          status: draftOrder.status,
          invoiceUrl: draftOrder.invoiceUrl
        },
        message: '草稿订单已完成'
      });
    }

    // 完成草稿订单
    const completeDraftOrderMutation = `
      mutation draftOrderComplete($id: ID!, $paymentPending: Boolean) {
        draftOrderComplete(id: $id, paymentPending: $paymentPending) {
          draftOrder {
            id
            name
            email
            totalPrice
            status
            invoiceUrl
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const completeResponse = await fetch(graphqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': adminToken,
      },
      body: JSON.stringify({
        query: completeDraftOrderMutation,
        variables: { 
          id: draftOrderId,
          paymentPending: true // 设置为待付款状态
        }
      })
    });

    const completeResult = await completeResponse.json();
    console.log('📋 完成草稿订单结果:', completeResult);

    if (completeResult.data?.draftOrderComplete?.userErrors?.length > 0) {
      throw new Error(`完成草稿订单失败: ${completeResult.data.draftOrderComplete.userErrors.map(e => e.message).join(', ')}`);
    }

    const completedDraftOrder = completeResult.data.draftOrderComplete.draftOrder;

    return res.status(200).json({
      success: true,
      draftOrder: {
        id: completedDraftOrder.id,
        name: completedDraftOrder.name,
        email: completedDraftOrder.email,
        totalPrice: completedDraftOrder.totalPrice,
        status: completedDraftOrder.status,
        invoiceUrl: completedDraftOrder.invoiceUrl
      },
      message: '草稿订单已完成，可以付款'
    });

  } catch (error) {
    console.error('❌ 完成草稿订单失败:', error);
    
    return res.status(500).json({
      success: false,
      error: error.message,
      message: '完成草稿订单失败'
    });
  }
};
