/**
 * 测试Shopify连接API
 * 用于验证环境变量和Shopify API连接是否正常
 */

export default async function handler(req, res) {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', 'https://sain-pdc-test.myshopify.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 检查环境变量
    const storeDomain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOP;
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.ADMIN_TOKEN;
    
    console.log('环境变量检查:');
    console.log('SHOP:', storeDomain);
    console.log('ADMIN_TOKEN:', accessToken ? `${accessToken.substring(0, 10)}...` : 'undefined');
    
    if (!storeDomain || !accessToken) {
      return res.status(500).json({
        success: false,
        error: '环境变量配置错误',
        details: {
          SHOP: storeDomain ? '已配置' : '未配置',
          ADMIN_TOKEN: accessToken ? '已配置' : '未配置'
        }
      });
    }
    
    // 测试Shopify API连接
    const endpoint = `https://${storeDomain}/admin/api/2024-01/graphql.json`;
    console.log('测试连接:', endpoint);
    
    const testQuery = `
      query {
        shop {
          name
          id
        }
      }
    `;
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({ query: testQuery }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`Shopify API响应错误: ${response.status} - ${JSON.stringify(data)}`);
    }
    
    if (data.errors) {
      throw new Error(`GraphQL错误: ${data.errors[0].message}`);
    }
    
    // 测试获取草稿订单
    const draftOrderQuery = `
      query {
        draftOrders(first: 5) {
          edges {
            node {
              id
              name
              email
              status
              totalPrice
              createdAt
            }
          }
        }
      }
    `;
    
    const draftOrderResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({ query: draftOrderQuery }),
    });
    
    const draftOrderData = await draftOrderResponse.json();
    
    return res.status(200).json({
      success: true,
      message: 'Shopify连接正常',
      shop: data.data.shop,
      draftOrders: {
        total: draftOrderData.data.draftOrders.edges.length,
        orders: draftOrderData.data.draftOrders.edges.map(edge => ({
          id: edge.node.id,
          name: edge.node.name,
          email: edge.node.email,
          status: edge.node.status,
          totalPrice: edge.node.totalPrice
        }))
      },
      environment: {
        SHOP: storeDomain,
        API_VERSION: '2024-01',
        TOKEN_PREFIX: accessToken.substring(0, 10) + '...'
      }
    });
    
  } catch (error) {
    console.error('Shopify连接测试失败:', error);
    return res.status(500).json({
      success: false,
      error: 'Shopify连接失败',
      message: error.message,
      stack: error.stack
    });
  }
}
