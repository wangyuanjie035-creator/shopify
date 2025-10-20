import { setCorsHeaders } from './cors-config.js';

/**
 * ═══════════════════════════════════════════════════════════════
 * 获取订单状态 API - 获取完整的订单状态信息
 * ═══════════════════════════════════════════════════════════════
 * 
 * 功能：获取草稿订单或已完成订单的详细状态信息
 * 
 * 支持的订单状态：
 * - 待报价 (Pending Quote)
 * - 已报价 (Quoted) 
 * - 已付款 (Paid)
 * - 已发货 (Fulfilled)
 * - 已完成 (Completed)
 * - 已取消 (Cancelled)
 * 
 * 请求示例：
 * GET /api/get-order-status?draftOrderId=gid://shopify/DraftOrder/123456789
 * 
 * 响应示例：
 * {
 *   "success": true,
 *   "orderId": "gid://shopify/DraftOrder/123456789",
 *   "orderName": "#D1001",
 *   "status": "已付款",
 *   "statusCode": "paid",
 *   "totalPrice": "1500.00",
 *   "paidAt": "2025-01-29T10:30:00Z",
 *   "fulfilledAt": null,
 *   "invoiceUrl": "https://checkout.shopify.com/...",
 *   "fulfillments": []
 * }
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

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { draftOrderId } = req.query;

  // 验证必填字段
  if (!draftOrderId) {
    return res.status(400).json({
      error: '缺少必填字段',
      required: ['draftOrderId']
    });
  }

  try {
    console.log('获取订单状态:', { draftOrderId });

    // ═══════════════════════════════════════════════════════════
    // 步骤 1: 查询草稿订单信息
    // ═══════════════════════════════════════════════════════════
    
    const getDraftOrderQuery = `
      query($id: ID!) {
        draftOrder(id: $id) {
          id
          name
          email
          invoiceUrl
          totalPrice
          status
          createdAt
          updatedAt
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
    
    const draftOrderResult = await shopGql(getDraftOrderQuery, {
      id: draftOrderId
    });
    
    if (!draftOrderResult.data.draftOrder) {
      return res.status(404).json({ error: '未找到草稿订单' });
    }
    
    const draftOrder = draftOrderResult.data.draftOrder;
    
    // ═══════════════════════════════════════════════════════════
    // 步骤 2: 检查是否已完成并转换为正式订单
    // ═══════════════════════════════════════════════════════════
    
    let orderInfo = null;
    let isCompleted = false;
    
    // 检查草稿订单是否已完成（状态为COMPLETED或已转换为正式订单）
    // 如果草稿订单有invoiceUrl且状态为COMPLETED，说明已转换为正式订单
    // 或者如果草稿订单有totalPrice > 0，说明已经报价，可能已转换为正式订单
    if (draftOrder.status === 'COMPLETED' || (draftOrder.invoiceUrl && draftOrder.totalPrice > 0) || draftOrder.totalPrice > 0) {
      isCompleted = true;
      
      // 通过订单号查找正式订单
      const orderName = draftOrder.name.replace('#', '');
      
      const getOrderQuery = `
        query($query: String!) {
          orders(first: 10, query: $query) {
            edges {
              node {
                id
                name
                email
                totalPrice
                financialStatus
                fulfillmentStatus
                processedAt
                createdAt
                updatedAt
                fulfillments(first: 10) {
                  edges {
                    node {
                      id
                      status
                      createdAt
                      trackingInfo {
                        number
                        url
                        company
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;
      
      try {
        // 尝试多种查询方式
        const queries = [
          `name:${orderName}`,           // 按订单名称查询
          `name:#${orderName}`,          // 带#号查询
          `email:${draftOrder.email}`,   // 按邮箱查询最近的订单
          `financial_status:paid`        // 查询已付款的订单
        ];
        
        for (const query of queries) {
          console.log('尝试查询订单:', query);
          const orderResult = await shopGql(getOrderQuery, { query });
          
          if (orderResult.data.orders.edges.length > 0) {
            // 找到匹配的订单（优先匹配订单名称，其次匹配邮箱和金额）
            const matchingOrder = orderResult.data.orders.edges.find(edge => {
              const order = edge.node;
              return order.name === orderName || 
                     order.name === `#${orderName}` ||
                     (order.email === draftOrder.email && 
                      Math.abs(parseFloat(order.totalPrice) - parseFloat(draftOrder.totalPrice)) < 0.01);
            });
            
            if (matchingOrder) {
              orderInfo = matchingOrder.node;
              console.log('✅ 找到匹配的正式订单:', orderInfo.name);
              break;
            }
          }
        }
      } catch (orderError) {
        console.warn('查询正式订单失败:', orderError.message);
      }
    }
    
    // ═══════════════════════════════════════════════════════════
    // 步骤 3: 确定订单状态
    // ═══════════════════════════════════════════════════════════
    
    let status = '待报价';
    let statusCode = 'pending';
    let paidAt = null;
    let fulfilledAt = null;
    let fulfillments = [];
    
    if (isCompleted && orderInfo) {
      // 已完成的订单，根据财务状态和履行状态确定状态
      const financialStatus = orderInfo.financialStatus;
      const fulfillmentStatus = orderInfo.fulfillmentStatus;
      
      console.log('订单状态分析:', {
        financialStatus,
        fulfillmentStatus,
        totalPrice: orderInfo.totalPrice
      });
      
      if (financialStatus === 'PAID') {
        status = '已付款';
        statusCode = 'paid';
        paidAt = orderInfo.processedAt || orderInfo.updatedAt;
        
        if (fulfillmentStatus === 'FULFILLED') {
          status = '已发货';
          statusCode = 'fulfilled';
          fulfilledAt = orderInfo.fulfillments.edges.length > 0 ? 
            orderInfo.fulfillments.edges[0].node.createdAt : null;
          fulfillments = orderInfo.fulfillments.edges.map(edge => ({
            id: edge.node.id,
            status: edge.node.status,
            createdAt: edge.node.createdAt,
            trackingInfo: edge.node.trackingInfo
          }));
        }
      } else if (financialStatus === 'PENDING') {
        status = '待付款';
        statusCode = 'pending_payment';
      } else if (financialStatus === 'PARTIALLY_PAID') {
        status = '部分付款';
        statusCode = 'partially_paid';
        paidAt = orderInfo.processedAt || orderInfo.updatedAt;
      }
    } else {
      // 检查草稿订单是否已标记为已付款（通过customAttributes）
      const customStatus = draftOrder.lineItems.edges.length > 0 ? 
        draftOrder.lineItems.edges[0].node.customAttributes.find(attr => attr.key === '状态')?.value : null;
      
      // 如果草稿订单状态显示已付款，但还没有转换为正式订单
      if (customStatus === '已付款' || customStatus === '已发货') {
        status = customStatus;
        statusCode = customStatus === '已付款' ? 'paid' : 'fulfilled';
      } else {
        // 草稿订单状态判断
        const totalPrice = parseFloat(draftOrder.totalPrice || 0);
      
        if (customStatus === '已报价' || totalPrice > 0) {
          status = '已报价';
          statusCode = 'quoted';
        }
      }
    }
    
    console.log('订单状态分析:', {
      isCompleted,
      status,
      statusCode,
      totalPrice: draftOrder.totalPrice,
      financialStatus: orderInfo?.financialStatus,
      fulfillmentStatus: orderInfo?.fulfillmentStatus
    });
    
    // ═══════════════════════════════════════════════════════════
    // 返回结果
    // ═══════════════════════════════════════════════════════════
    
    return res.json({
      success: true,
      orderId: draftOrder.id,
      orderName: draftOrder.name,
      status,
      statusCode,
      totalPrice: draftOrder.totalPrice,
      paidAt,
      fulfilledAt,
      fulfillments,
      invoiceUrl: draftOrder.invoiceUrl,
      isCompleted,
      orderInfo: orderInfo ? {
        id: orderInfo.id,
        name: orderInfo.name,
        financialStatus: orderInfo.financialStatus,
        fulfillmentStatus: orderInfo.fulfillmentStatus,
        processedAt: orderInfo.processedAt
      } : null,
      updatedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('获取订单状态失败:', error);
    return res.status(500).json({
      error: '获取订单状态失败',
      message: error.message
    });
  }
}
