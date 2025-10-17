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
    
    console.log('📋 草稿订单状态详情:', {
      status: draftOrder.status,
      completedAt: draftOrder.completedAt,
      invoiceUrl: draftOrder.invoiceUrl
    });

    // 检查是否已经完成或已支付
    if (draftOrder.status === 'COMPLETED' || draftOrder.completedAt || draftOrder.invoiceUrl) {
      console.log('✅ 草稿订单已完成，返回现有结果');
      
      // 如果已经有付款链接，直接返回
      if (draftOrder.invoiceUrl) {
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
          message: '草稿订单已完成，可直接付款'
        });
      }
      
      // 如果没有付款链接，尝试重新生成
      console.log('🔄 草稿订单已完成但无付款链接，尝试重新生成...');
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
      const errorMessage = completeResult.data.draftOrderComplete.userErrors[0].message;
      console.log('❌ Shopify错误:', errorMessage);
      
      // 如果错误是"invoice has already been paid"，返回特殊处理
      if (errorMessage.includes('already been paid') || errorMessage.includes('invoice has already been paid')) {
        console.log('💰 发票已支付，返回现有订单信息');
        
        // 重新查询草稿订单获取最新信息
        const recheckResponse = await fetch(graphqlEndpoint, {
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
        
        const recheckResult = await recheckResponse.json();
        const latestDraftOrder = recheckResult.data?.draftOrder;
        
        if (latestDraftOrder) {
          return res.status(200).json({
            success: true,
            draftOrder: {
              id: latestDraftOrder.id,
              name: latestDraftOrder.name,
              email: latestDraftOrder.email,
              totalPrice: latestDraftOrder.totalPrice,
              status: latestDraftOrder.status,
              invoiceUrl: latestDraftOrder.invoiceUrl
            },
            message: '订单已支付，可直接查看'
          });
        }
      }
      
      throw new Error(`完成草稿订单失败: ${errorMessage}`);
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
