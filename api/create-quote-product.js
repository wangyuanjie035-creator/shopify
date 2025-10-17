/**
 * 创建报价产品API
 * 在管理端报价后，动态创建一个产品供用户购买
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
    console.log('📋 创建报价产品请求:', req.body);
    
    const { 
      draftOrderId, 
      customerEmail, 
      customerName, 
      fileName,
      material,
      color,
      quantity,
      quotedPrice 
    } = req.body;
    
    if (!draftOrderId || !quotedPrice) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数: draftOrderId 和 quotedPrice'
      });
    }

    const shop = process.env.SHOP;
    const adminToken = process.env.ADMIN_TOKEN;

    if (!shop || !adminToken) {
      throw new Error(`Missing environment variables: SHOP=${shop ? 'OK' : 'MISSING'} or ADMIN_TOKEN=${adminToken ? 'OK' : 'MISSING'}`);
    }

    const shopifyDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;
    const graphqlEndpoint = `https://${shopifyDomain}/admin/api/2024-01/graphql.json`;

    // 创建产品
    const productTitle = `3D打印服务 - ${fileName || '定制化产品'}`;
    const productDescription = `
      <p><strong>定制化3D打印服务</strong></p>
      <p><strong>文件:</strong> ${fileName || '未指定'}</p>
      <p><strong>材料:</strong> ${material || '未指定'}</p>
      <p><strong>颜色:</strong> ${color || '未指定'}</p>
      <p><strong>数量:</strong> ${quantity || 1}</p>
      <p><strong>询价单号:</strong> ${draftOrderId}</p>
      <p><em>此产品基于您的询价创建，价格已由客服确认。</em></p>
    `;

    const createProductMutation = `
      mutation productCreate($input: ProductInput!) {
        productCreate(input: $input) {
          product {
            id
            title
            handle
            variants(first: 1) {
              edges {
                node {
                  id
                  price
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    console.log('📝 创建产品:', productTitle);
    
    const createResponse = await fetch(graphqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': adminToken,
      },
      body: JSON.stringify({
        query: createProductMutation,
        variables: {
          input: {
            title: productTitle,
            bodyHtml: productDescription,
            productType: '3D打印服务',
            vendor: '定制化加工服务',
            tags: ['3D打印', '定制化', '询价产品'],
            variants: [
              {
                price: quotedPrice,
                inventoryQuantity: 1,
                inventoryManagement: 'SHOPIFY',
                inventoryPolicy: 'DENY'
              }
            ]
          }
        }
      })
    });

    const createResult = await createResponse.json();
    console.log('📝 产品创建结果:', createResult);

    if (createResult.data?.productCreate?.userErrors?.length > 0) {
      throw new Error(`产品创建失败: ${createResult.data.productCreate.userErrors.map(e => e.message).join(', ')}`);
    }

    const product = createResult.data?.productCreate?.product;
    if (!product) {
      throw new Error('产品创建失败：未返回产品信息');
    }

    const variantId = product.variants.edges[0]?.node?.id;
    if (!variantId) {
      throw new Error('产品创建失败：未返回变体ID');
    }

    console.log('✅ 产品创建成功:', {
      productId: product.id,
      variantId: variantId,
      price: quotedPrice
    });

    return res.status(200).json({
      success: true,
      product: {
        id: product.id,
        title: product.title,
        handle: product.handle,
        variantId: variantId,
        price: quotedPrice
      },
      message: '报价产品创建成功'
    });

  } catch (error) {
    console.error('❌ 创建报价产品失败:', error);
    
    return res.status(500).json({
      success: false,
      error: error.message,
      message: '创建报价产品失败'
    });
  }
};
