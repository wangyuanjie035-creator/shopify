/**
 * ═══════════════════════════════════════════════════════════════
 * 获取 Draft Order API - 客户查看询价详情
 * ═══════════════════════════════════════════════════════════════
 * 
 * 功能：根据 Draft Order 名称或 ID 获取详情
 * 
 * 用途：
 * - 客户查看自己的询价状态
 * - 客户查看报价金额
 * - 客户决定是否下单
 * 
 * 请求示例：
 * GET /api/get-draft-order?id=#D1001
 * GET /api/get-draft-order?id=gid://shopify/DraftOrder/123456789
 * 
 * 响应示例：
 * {
 *   "success": true,
 *   "draftOrder": {
 *     "id": "gid://shopify/DraftOrder/123456789",
 *     "name": "#D1001",
 *     "invoiceUrl": "https://checkout.shopify.com/...",
 *     "totalPrice": "1500.00",
 *     "status": "已报价",
 *     "lineItems": [...]
 *   }
 * }
 */

// ─────────────────────────────────────────────────────────────
// 辅助函数：调用 Shopify GraphQL API
// ─────────────────────────────────────────────────────────────
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
  
  if (!resp.ok) {
    throw new Error(`Shopify API 请求失败: ${resp.status}`);
  }
  
  const json = await resp.json();
  
  if (json.errors) {
    console.error('GraphQL 错误:', json.errors);
    throw new Error(`GraphQL 错误: ${json.errors[0].message}`);
  }
  
  return json;
}

// ─────────────────────────────────────────────────────────────
// 主处理函数
// ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // 设置 CORS 头 - 允许Shopify域名
  res.setHeader('Access-Control-Allow-Origin', 'https://sain-pdc-test.myshopify.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  // 处理 OPTIONS 预检请求
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  // 只接受 GET 请求
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { id } = req.query;
  
  if (!id) {
    return res.status(400).json({
      error: '缺少参数',
      message: '请提供 Draft Order 名称（如 #D1001）或 ID'
    });
  }
  
  try {
    console.log('查询 Draft Order:', id);
    
    let draftOrder = null;
    
    // ═══════════════════════════════════════════════════════════
    // 方案 A: 通过 ID 直接查询（如果是 gid:// 格式）
    // ═══════════════════════════════════════════════════════════
    
    if (id.startsWith('gid://shopify/DraftOrder/')) {
      const queryById = `
        query($id: ID!) {
          draftOrder(id: $id) {
            id
            name
            email
            invoiceUrl
            totalPrice
            subtotalPrice
            totalTax
            createdAt
            updatedAt
            status
            lineItems(first: 10) {
              edges {
                node {
                  id
                  title
                  quantity
                  originalUnitPrice
                  discountedUnitPrice
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
      
      const result = await shopGql(queryById, { id });
      draftOrder = result.data.draftOrder;
    }
    
    // ═══════════════════════════════════════════════════════════
    // 方案 B: 通过名称搜索（如果是 #D1001 格式）
    // ═══════════════════════════════════════════════════════════
    
    else {
      const queryByName = `
        query($query: String!) {
          draftOrders(first: 1, query: $query) {
            edges {
              node {
                id
                name
                email
                invoiceUrl
                totalPrice
                subtotalPrice
                totalTax
                createdAt
                updatedAt
                status
                lineItems(first: 10) {
                  edges {
                    node {
                      id
                      title
                      quantity
                      originalUnitPrice
                      discountedUnitPrice
                      customAttributes {
                        key
                        value
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;
      
      // 格式化搜索查询
      const searchQuery = id.startsWith('#') ? `name:${id}` : `name:#${id}`;
      
      const result = await shopGql(queryByName, {
        query: searchQuery
      });
      
      if (result.data.draftOrders.edges.length > 0) {
        draftOrder = result.data.draftOrders.edges[0].node;
      }
    }
    
    // ═══════════════════════════════════════════════════════════
    // 检查是否找到
    // ═══════════════════════════════════════════════════════════
    
    if (!draftOrder) {
      return res.status(404).json({
        error: '未找到询价单',
        message: `未找到 ID 为 "${id}" 的草稿订单`
      });
    }
    
    // ═══════════════════════════════════════════════════════════
    // 提取并格式化数据
    // ═══════════════════════════════════════════════════════════
    
    const lineItem = draftOrder.lineItems.edges[0]?.node;
    
    // 从 customAttributes 中提取状态
    const getAttr = (key) => {
      const attr = lineItem?.customAttributes.find(a => a.key === key);
      return attr ? attr.value : '';
    };
    
    const status = getAttr('状态');
    const fileName = getAttr('文件名');
    const quantity = getAttr('数量');
    const material = getAttr('材质');
    const color = getAttr('颜色');
    const quotedAmount = getAttr('报价金额');
    const quotedAt = getAttr('报价时间');
    const note = getAttr('备注');
    const fileId = getAttr('_fileId');
    const fileCdnUrl = getAttr('_fileCdnUrl');
    
    // ═══════════════════════════════════════════════════════════
    // 返回格式化的结果
    // ═══════════════════════════════════════════════════════════
    
    return res.json({
      success: true,
      draftOrder: {
        id: draftOrder.id,
        name: draftOrder.name,
        email: draftOrder.email,
        invoiceUrl: draftOrder.invoiceUrl,
        totalPrice: draftOrder.totalPrice,
        status: status || '待报价',
        isPending: status === '待报价',
        isQuoted: status === '已报价',
        createdAt: draftOrder.createdAt,
        updatedAt: draftOrder.updatedAt,
        
        // 商品信息
        product: {
          title: lineItem?.title || '',
          quantity: parseInt(quantity) || lineItem?.quantity || 1,
          price: lineItem?.originalUnitPrice || '0.01',
          quotedAmount: quotedAmount || ''
        },
        
        // 文件信息
        file: {
          name: fileName || '',
          id: fileId || '',
          url: fileCdnUrl || ''
        },
        
        // 定制信息
        customization: {
          quantity: quantity || '',
          material: material || '',
          color: color || ''
        },
        
        // 报价信息
        quote: {
          amount: lineItem?.originalUnitPrice || '0.01',
          displayAmount: quotedAmount || '',
          note: note || '',
          quotedAt: quotedAt || ''
        },
        
        // 客户信息（从email字段获取）
        customer: draftOrder.email ? {
          email: draftOrder.email,
          name: '客户'
        } : null,
        
        // 完整的 lineItems（供高级使用）
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

