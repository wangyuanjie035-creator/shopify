import { setCorsHeaders } from './cors-config.js';

/**
 * ═══════════════════════════════════════════════════════════════
 * 获取 Draft Orders 列表 API - 管理端使用
 * ═══════════════════════════════════════════════════════════════
 * 
 * 功能：获取所有 Draft Orders 列表供管理端显示
 * 
 * 用途：
 * - 管理端显示所有询价单
 * - 支持状态过滤
 * - 提供统计信息
 * 
 * 请求示例：
 * GET /api/get-draft-orders?status=pending
 * GET /api/get-draft-orders?limit=20
 * 
 * 响应示例：
 * {
 *   "success": true,
 *   "draftOrders": [
 *     {
 *       "id": "gid://shopify/DraftOrder/1234567890",
 *       "name": "#D1001",
 *       "email": "customer@example.com",
 *       "status": "pending",
 *       "totalPrice": "99.00",
 *       "createdAt": "2025-10-15T08:00:00Z",
 *       "lineItems": [...]
 *     }
 *   ],
 *   "total": 10,
 *   "pending": 5,
 *   "quoted": 5
 * }
 */

export default async function handler(req, res) {
  // 设置CORS头
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 只接受GET请求
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('开始获取Draft Orders列表...');

    // 检查环境变量 - 支持多种变量名
    const storeDomain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOP;
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.ADMIN_TOKEN;
    
    if (!storeDomain || !accessToken) {
      console.log('环境变量未配置，返回模拟数据');
      
      // 返回模拟数据
      return res.status(200).json({
        success: true,
        message: '环境变量未配置，返回模拟数据',
        draftOrders: [
          {
            id: 'gid://shopify/DraftOrder/1234567890',
            name: '#D1001',
            email: 'customer@example.com',
            status: 'pending',
            totalPrice: '99.00',
            createdAt: new Date().toISOString(),
            lineItems: [
              {
                title: '3D打印服务',
                quantity: 1,
                originalUnitPrice: '99.00'
              }
            ]
          },
          {
            id: 'gid://shopify/DraftOrder/1234567891',
            name: '#D1002',
            email: 'test@example.com',
            status: 'quoted',
            totalPrice: '199.00',
            createdAt: new Date(Date.now() - 3600000).toISOString(),
            lineItems: [
              {
                title: '3D打印服务',
                quantity: 2,
                originalUnitPrice: '99.50'
              }
            ]
          }
        ],
        total: 2,
        pending: 1,
        quoted: 1,
        note: '这是模拟数据，请配置环境变量后重新部署'
      });
    }

    // 获取查询参数
    const { status, limit = 50 } = req.query;

    // GraphQL查询
    const query = `
      query getDraftOrders($first: Int!) {
        draftOrders(first: $first) {
          edges {
            node {
              id
              name
              email
              totalPrice
              createdAt
              updatedAt
              status
              invoiceUrl
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
        }
      }
    `;

    // 调用Shopify Admin API
    const response = await fetch(`https://${storeDomain}/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken
      },
      body: JSON.stringify({
        query: query,
        variables: { first: parseInt(limit) }
      })
    });

    const data = await response.json();
    console.log('Shopify API响应:', data);

    if (data.errors) {
      console.error('GraphQL错误:', data.errors);
      throw new Error(`GraphQL错误: ${data.errors[0].message}`);
    }

    // 处理响应数据
    const draftOrders = data.data.draftOrders.edges.map(edge => {
      const order = edge.node;
      
      // 从第一个lineItem的customAttributes中提取文件ID和文件数据
      let fileId = null;
      let fileData = null;
      if (order.lineItems.edges.length > 0) {
        const firstLineItem = order.lineItems.edges[0].node;
        const fileIdAttr = firstLineItem.customAttributes.find(attr => attr.key === '文件ID');
        if (fileIdAttr) {
          fileId = fileIdAttr.value;
        }
        
        const fileDataAttr = firstLineItem.customAttributes.find(attr => attr.key === '文件数据');
        if (fileDataAttr && fileDataAttr.value && fileDataAttr.value.startsWith('data:')) {
          fileData = fileDataAttr.value;
          console.log('✅ 从customAttributes提取到文件数据');
        }
      }

      // 从customAttributes中获取状态信息
      let orderStatus = 'pending';
      if (order.lineItems.edges.length > 0) {
        const firstLineItem = order.lineItems.edges[0].node;
        const statusAttr = firstLineItem.customAttributes.find(attr => attr.key === '状态');
        if (statusAttr && statusAttr.value === '已报价') {
          orderStatus = 'quoted';
        }
      }

      return {
        id: order.id,
        name: order.name,
        email: order.email,
        status: orderStatus, // 使用从customAttributes获取的状态
        totalPrice: order.totalPrice,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        invoiceUrl: order.invoiceUrl || 'data:stored',
        fileId: fileId, // 添加文件ID
        fileData: fileData, // 添加文件数据
        note: order.note, // 添加note字段
        lineItems: order.lineItems.edges.map(itemEdge => ({
          id: itemEdge.node.id,
          title: itemEdge.node.title,
          quantity: itemEdge.node.quantity,
          originalUnitPrice: itemEdge.node.originalUnitPrice,
          customAttributes: itemEdge.node.customAttributes
        }))
      };
    });

    // 状态过滤
    let filteredOrders = draftOrders;
    if (status && status !== 'all') {
      filteredOrders = draftOrders.filter(order => order.status === status);
    }

    // 计算统计信息
    const total = draftOrders.length;
    const pending = draftOrders.filter(o => o.status === 'pending').length;
    const quoted = draftOrders.filter(o => o.status === 'quoted').length;

    return res.status(200).json({
      success: true,
      message: 'Draft Orders获取成功',
      draftOrders: filteredOrders,
      total: total,
      pending: pending,
      quoted: quoted,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('获取Draft Orders失败:', error);
    
    return res.status(500).json({
      success: false,
      error: error.message,
      message: '获取Draft Orders失败',
      timestamp: new Date().toISOString()
    });
  }
}
