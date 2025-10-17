// 直接设置CORS头
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://sain-pdc-test.myshopify.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

export default async (req, res) => {
  // 设置CORS头
  setCorsHeaders(res);

  // 处理OPTIONS预检请求
  if (req.method === 'OPTIONS') {
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
    console.log('📋 收到请求:', req.body);
    
    const { draftOrderId } = req.body;
    
    if (!draftOrderId) {
      console.log('❌ 缺少draftOrderId');
      return res.status(400).json({
        success: false,
        error: 'Draft Order ID is required'
      });
    }

    const shop = process.env.SHOP;
    const adminToken = process.env.ADMIN_TOKEN;

    console.log('🔧 环境变量检查:');
    console.log('- SHOP:', shop ? '已设置' : '未设置');
    console.log('- ADMIN_TOKEN:', adminToken ? '已设置' : '未设置');

    if (!shop || !adminToken) {
      console.log('❌ 环境变量缺失');
      throw new Error(`Missing environment variables: SHOP=${shop ? 'OK' : 'MISSING'} or ADMIN_TOKEN=${adminToken ? 'OK' : 'MISSING'}`);
    }

    const shopifyDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;
    const graphqlEndpoint = `https://${shopifyDomain}/admin/api/2024-01/graphql.json`;

    console.log('🔄 开始完成草稿订单:', draftOrderId);

    // 先查询草稿订单的当前状态
    const queryDraftOrder = `
      query($id: ID!) {
        draftOrder(id: $id) {
          id
          name
          email
          totalPrice
          status
          invoiceUrl
          completedAt
          lineItems(first: 10) {
            edges {
              node {
                id
                title
                quantity
                originalUnitPrice
                customAttributes {
                  key
                  value
                }
              }
            }
          }
        }
      }
    `;

    console.log('📋 查询草稿订单状态...');
    const queryResponse = await fetch(graphqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': adminToken,
      },
      body: JSON.stringify({
        query: queryDraftOrder,
        variables: { id: draftOrderId }
      })
    });

    const queryResult = await queryResponse.json();
    console.log('📋 查询结果:', queryResult);

    const currentDraftOrder = queryResult.data?.draftOrder;
    
    if (!currentDraftOrder) {
      throw new Error('草稿订单不存在');
    }

    // 如果已经完成或有发票链接，直接返回
    if (currentDraftOrder.status === 'COMPLETED' || currentDraftOrder.completedAt || currentDraftOrder.invoiceUrl) {
      console.log('✅ 草稿订单已完成，返回现有信息');
      return res.status(200).json({
        success: true,
        draftOrder: {
          id: currentDraftOrder.id,
          name: currentDraftOrder.name,
          email: currentDraftOrder.email,
          totalPrice: currentDraftOrder.totalPrice,
          status: currentDraftOrder.status,
          invoiceUrl: currentDraftOrder.invoiceUrl
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
      const errorMessages = completeResult.data.draftOrderComplete.userErrors.map(e => e.message);
      console.log('⚠️ 完成草稿订单遇到错误:', errorMessages);
      
      // 如果是"invoice has already been paid"错误，重新查询订单状态
      if (errorMessages.some(msg => msg.includes('invoice has already been paid'))) {
        console.log('🔄 发票已支付，重新查询订单状态...');
        
        const reQueryResponse = await fetch(graphqlEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': adminToken,
          },
          body: JSON.stringify({
            query: queryDraftOrder,
            variables: { id: draftOrderId }
          })
        });

        const reQueryResult = await reQueryResponse.json();
        const reQueryDraftOrder = reQueryResult.data?.draftOrder;
        
        if (reQueryDraftOrder) {
          return res.status(200).json({
            success: true,
            draftOrder: {
              id: reQueryDraftOrder.id,
              name: reQueryDraftOrder.name,
              email: reQueryDraftOrder.email,
              totalPrice: reQueryDraftOrder.totalPrice,
              status: reQueryDraftOrder.status,
              invoiceUrl: reQueryDraftOrder.invoiceUrl
            },
            message: '草稿订单已完成'
          });
        }
      }
      
      throw new Error(`完成草稿订单失败: ${errorMessages.join(', ')}`);
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
    console.error('❌ 错误堆栈:', error.stack);
    
    return res.status(500).json({
      success: false,
      error: error.message,
      message: '完成草稿订单失败',
      details: {
        draftOrderId: req.body?.draftOrderId,
        timestamp: new Date().toISOString(),
        shop: process.env.SHOP ? '已设置' : '未设置',
        adminToken: process.env.ADMIN_TOKEN ? '已设置' : '未设置'
      }
    });
  }
};
