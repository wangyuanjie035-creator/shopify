/**
 * 简化版获取 Draft Order API - 避免权限问题
 */

// 辅助函数：调用 Shopify GraphQL API
async function shopGql(query, variables) {
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOP;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.ADMIN_TOKEN;
  
  if (!storeDomain || !accessToken) {
    throw new Error('缺少 Shopify 配置');
  }
  
  const endpoint = `https://${storeDomain}/admin/api/2024-01/graphql.json`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await resp.json();
  
  if (!resp.ok) {
    throw new Error(`Shopify API 请求失败: ${resp.status}`);
  }
  
  if (json.errors) {
    throw new Error(`GraphQL 错误: ${json.errors[0].message}`);
  }
  
  return json;
}

export default async function handler(req, res) {
  // 设置 CORS 头
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
  
  const { id } = req.query;
  
  if (!id) {
    return res.status(400).json({
      error: '缺少参数',
      message: '请提供询价单ID'
    });
  }

  try {
    console.log('查找询价单:', id);
    
    // 简化的查询 - 只获取基本信息，避免权限问题
    const query = `
      query($id: ID!) {
        draftOrder(id: $id) {
          id
          name
          email
          totalPrice
          status
          createdAt
          lineItems(first: 5) {
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
    
    const result = await shopGql(query, { id });
    const draftOrder = result.data.draftOrder;
    
    if (!draftOrder) {
      return res.status(404).json({
        error: '未找到询价单',
        message: `询价单 ${id} 不存在`
      });
    }
    
    // 简化的响应数据
    return res.status(200).json({
      success: true,
      draftOrder: {
        id: draftOrder.id,
        name: draftOrder.name,
        email: draftOrder.email,
        status: draftOrder.status === 'INVOICE_SENT' ? '已报价' : '待报价',
        totalPrice: draftOrder.totalPrice,
        createdAt: draftOrder.createdAt,
        lineItems: draftOrder.lineItems.edges.map(edge => edge.node)
      }
    });
    
  } catch (error) {
    console.error('获取 Draft Order 失败:', error);
    return res.status(500).json({
      error: '获取询价失败',
      message: error.message
    });
  }
}
