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
    
    // 如果草稿订单状态是COMPLETED，查找对应的正式订单
    if (draftOrder.status === 'COMPLETED') {
      isCompleted = true;
      
      // 通过订单号查找正式订单
      const orderName = draftOrder.name.replace('#', '');
      
      const getOrderQuery = `
        query($query: String!) {
          orders(first: 1, query: $query) {
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
        const orderResult = await shopGql(getOrderQuery, {
          query: `name:${orderName}`
        });
        
        if (orderResult.data.orders.edges.length > 0) {
          orderInfo = orderResult.data.orders.edges[0].node;
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
      }
    } else {
      // 草稿订单状态判断
      const totalPrice = parseFloat(draftOrder.totalPrice || 0);
      const customStatus = draftOrder.lineItems.edges.length > 0 ? 
        draftOrder.lineItems.edges[0].node.customAttributes.find(attr => attr.key === '状态')?.value : null;
      
      if (customStatus === '已报价' || totalPrice > 0) {
        status = '已报价';
        statusCode = 'quoted';
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
