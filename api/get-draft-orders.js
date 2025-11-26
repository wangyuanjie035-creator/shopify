import { setCorsHeaders } from './cors-config.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('开始获取Draft Orders列表...');

    const storeDomain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOP;
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.ADMIN_TOKEN;

    if (!storeDomain || !accessToken) {
      console.log('环境变量未配置，返回模拟数据');
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
              { title: '3D打印服务', quantity: 1, originalUnitPrice: '99.00' }
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
              { title: '3D打印服务', quantity: 2, originalUnitPrice: '99.50' }
            ]
          }
        ],
        total: 2,
        pending: 1,
        quoted: 1,
        note: '这是模拟数据，请配置环境变量后重新部署'
      });
    }

    const { status, limit = 50 } = req.query;

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

    // 使用 WHATWG URL API 构建 Shopify GraphQL URL
    const graphqlUrl = new URL(`/admin/api/2024-01/graphql.json`, `https://${storeDomain}`);

    const response = await fetch(graphqlUrl.href, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken
      },
      body: JSON.stringify({ query, variables: { first: parseInt(limit) } })
    });

    const data = await response.json();
    console.log('Shopify API响应:', data);

    if (data.errors) throw new Error(`GraphQL错误: ${data.errors[0].message}`);

    const draftOrders = data.data.draftOrders.edges.map(edge => {
      const order = edge.node;

      let fileId = null;
      let fileData = null;

      if (order.lineItems.edges.length > 0) {
        const firstItem = order.lineItems.edges[0].node;

        const fileIdAttr = firstItem.customAttributes.find(attr => attr.key === '文件ID');
        if (fileIdAttr) fileId = fileIdAttr.value;

        const fileDataAttr = firstItem.customAttributes.find(attr => attr.key === '文件数据');
        if (fileDataAttr && fileDataAttr.value?.startsWith('data:')) fileData = fileDataAttr.value;
      }

      let orderStatus = 'pending';
      if (order.lineItems.edges.length > 0) {
        const firstItem = order.lineItems.edges[0].node;
        const statusAttr = firstItem.customAttributes.find(attr => attr.key === '状态');
        if (statusAttr && statusAttr.value === '已报价') orderStatus = 'quoted';
      }

      return {
        id: order.id,
        name: order.name,
        email: order.email,
        status: orderStatus,
        totalPrice: order.totalPrice,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        invoiceUrl: order.invoiceUrl || 'data:stored',
        fileId,
        fileData,
        note: order.note,
        lineItems: order.lineItems.edges.map(itemEdge => ({
          id: itemEdge.node.id,
          title: itemEdge.node.title,
          quantity: itemEdge.node.quantity,
          originalUnitPrice: itemEdge.node.originalUnitPrice,
          customAttributes: itemEdge.node.customAttributes
        }))
      };
    });

    let filteredOrders = draftOrders;
    if (status && status !== 'all') filteredOrders = draftOrders.filter(o => o.status === status);

    const total = draftOrders.length;
    const pending = draftOrders.filter(o => o.status === 'pending').length;
    const quoted = draftOrders.filter(o => o.status === 'quoted').length;

    return res.status(200).json({
      success: true,
      message: 'Draft Orders获取成功',
      draftOrders: filteredOrders,
      total,
      pending,
      quoted,
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
