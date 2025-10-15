/**
 * 诊断提交询价API的问题
 */
export default async function handler(req, res) {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 诊断信息
  const diagnostics = {
    timestamp: new Date().toISOString(),
    environment: {
      hasStoreDomain: !!process.env.SHOPIFY_STORE_DOMAIN,
      hasAccessToken: !!process.env.SHOPIFY_ACCESS_TOKEN,
      storeDomain: process.env.SHOPIFY_STORE_DOMAIN || '未配置',
      accessTokenLength: process.env.SHOPIFY_ACCESS_TOKEN ? process.env.SHOPIFY_ACCESS_TOKEN.length : 0
    },
    testDraftOrderCreation: null
  };

  // 测试创建Draft Order
  if (process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_ACCESS_TOKEN) {
    try {
      const testMutation = `
        mutation draftOrderCreate($input: DraftOrderInput!) {
          draftOrderCreate(input: $input) {
            draftOrder {
              id
              name
              email
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const testInput = {
        email: 'test@example.com',
        lineItems: [
          {
            title: '测试询价单',
            quantity: 1,
            originalUnitPrice: "0.00"
          }
        ]
      };

      const response = await fetch(`https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
        },
        body: JSON.stringify({
          query: testMutation,
          variables: { input: testInput }
        })
      });

      const data = await response.json();
      
      diagnostics.testDraftOrderCreation = {
        success: response.ok,
        status: response.status,
        data: data,
        hasErrors: data.errors && data.errors.length > 0,
        hasUserErrors: data.data?.draftOrderCreate?.userErrors?.length > 0
      };

    } catch (error) {
      diagnostics.testDraftOrderCreation = {
        success: false,
        error: error.message
      };
    }
  }

  return res.status(200).json({
    success: true,
    message: '诊断信息',
    diagnostics: diagnostics
  });
}
