/**
 * 创建订单记录API
 * 不使用购物车，直接创建订单记录
 */

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://sain-pdc-test.myshopify.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

export default async (req, res) => {
  setCorsHeaders(res);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    console.log('📋 创建订单记录请求:', req.body);
    
    const { draftOrderId, customerEmail, customerName } = req.body;
    
    if (!draftOrderId) {
      return res.status(400).json({
        success: false,
        error: 'Draft Order ID is required'
      });
    }

    const shop = process.env.SHOP;
    const adminToken = process.env.ADMIN_TOKEN;

    if (!shop || !adminToken) {
      throw new Error(`Missing environment variables: SHOP=${shop ? 'OK' : 'MISSING'} or ADMIN_TOKEN=${adminToken ? 'OK' : 'MISSING'}`);
    }

    const shopifyDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;
    const graphqlEndpoint = `https://${shopifyDomain}/admin/api/2024-01/graphql.json`;

    // 查询草稿订单详情
    const queryDraftOrder = `
      query($id: ID!) {
        draftOrder(id: $id) {
          id
          name
          email
          totalPrice
          status
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

    console.log('📋 查询草稿订单详情...');
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
    console.log('📋 草稿订单查询结果:', queryResult);

    const draftOrder = queryResult.data?.draftOrder;
    
    if (!draftOrder) {
      throw new Error('草稿订单不存在');
    }

    // 创建订单记录（存储到本地或数据库）
    const orderRecord = {
      id: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      draftOrderId: draftOrder.id,
      draftOrderName: draftOrder.name,
      customerEmail: customerEmail || draftOrder.email,
      customerName: customerName || '未提供',
      totalPrice: draftOrder.totalPrice,
      status: 'pending_payment', // 待付款
      createdAt: new Date().toISOString(),
      lineItems: draftOrder.lineItems.edges.map(edge => edge.node)
    };

    console.log('📝 创建订单记录:', orderRecord);

    // 这里可以将订单记录存储到数据库
    // 暂时返回订单记录信息
    return res.status(200).json({
      success: true,
      orderRecord: orderRecord,
      message: '订单记录创建成功'
    });

  } catch (error) {
    console.error('❌ 创建订单记录失败:', error);
    
    return res.status(500).json({
      success: false,
      error: error.message,
      message: '创建订单记录失败'
    });
  }
};
