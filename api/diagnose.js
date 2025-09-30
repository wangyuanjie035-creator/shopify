// 诊断脚本 - 检查 Shopify Metaobject 配置和数据

const SHOP = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOP;
const ADMIN_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || process.env.ADMIN_TOKEN;

async function shopGql(query, variables) {
  const r = await fetch(`https://${SHOP}/admin/api/2024-07/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': ADMIN_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables })
  });
  if (!r.ok) {
    const errorText = await r.text();
    throw new Error(`GraphQL request failed: ${r.status} - ${errorText}`);
  }
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  
  try {
    const diagnostics = {
      timestamp: new Date().toISOString(),
      environment: {
        shop: SHOP,
        hasAdminToken: !!ADMIN_TOKEN,
        tokenLength: ADMIN_TOKEN ? ADMIN_TOKEN.length : 0
      },
      tests: []
    };

    // 测试 1: 检查 Metaobject 定义
    console.log('测试 1: 检查 Metaobject 定义...');
    try {
      const definitionQuery = `
        query {
          metaobjectDefinitions(first: 10) {
            nodes {
              name
              type
              fieldDefinitions {
                name
                key
                type {
                  name
                }
              }
            }
          }
        }
      `;
      const definitionResult = await shopGql(definitionQuery, {});
      diagnostics.tests.push({
        name: 'Metaobject Definitions',
        status: 'success',
        data: definitionResult.data
      });
      
      const quoteDefinition = definitionResult.data?.metaobjectDefinitions?.nodes?.find(
        def => def.type === 'quote'
      );
      
      if (quoteDefinition) {
        console.log('找到 quote 定义:', quoteDefinition);
        diagnostics.quoteDefinition = quoteDefinition;
      } else {
        console.warn('未找到 quote 类型的 Metaobject 定义！');
        diagnostics.warning = 'quote Metaobject 定义不存在';
      }
    } catch (error) {
      diagnostics.tests.push({
        name: 'Metaobject Definitions',
        status: 'error',
        error: error.message
      });
    }

    // 测试 2: 查询所有 quote 类型的 Metaobject
    console.log('测试 2: 查询所有 quote Metaobject...');
    try {
      const quotesQuery = `
        query {
          metaobjects(type: "quote", first: 50) {
            nodes {
              id
              handle
              displayName
              updatedAt
              fields {
                key
                value
              }
            }
          }
        }
      `;
      const quotesResult = await shopGql(quotesQuery, {});
      
      if (quotesResult.errors) {
        diagnostics.tests.push({
          name: 'Query Quotes',
          status: 'error',
          errors: quotesResult.errors
        });
      } else {
        const nodes = quotesResult.data?.metaobjects?.nodes || [];
        diagnostics.tests.push({
          name: 'Query Quotes',
          status: 'success',
          totalRecords: nodes.length,
          records: nodes
        });
        console.log(`找到 ${nodes.length} 条 quote 记录`);
      }
    } catch (error) {
      diagnostics.tests.push({
        name: 'Query Quotes',
        status: 'error',
        error: error.message
      });
    }

    // 测试 3: 尝试创建一个测试记录
    console.log('测试 3: 创建测试 Metaobject...');
    try {
      const testFields = [
        { key: 'text', value: '诊断测试.STEP' },
        { key: 'author', value: '诊断脚本 (test@example.com)' },
        { key: 'email', value: 'test@example.com' },
        { key: 'status', value: 'Pending' },
        { key: 'price', value: '' },
        { key: 'invoice_url', value: 'https://shopify-13s4.vercel.app/api/download-file?id=diagnose-test' }
      ];

      const createMutation = `
        mutation($fields: [MetaobjectFieldInput!]!) {
          metaobjectCreate(metaobject: { type: "quote", fields: $fields }) {
            metaobject {
              id
              handle
              fields {
                key
                value
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const createResult = await shopGql(createMutation, { fields: testFields });
      
      if (createResult.data?.metaobjectCreate?.userErrors?.length > 0) {
        diagnostics.tests.push({
          name: 'Create Test Metaobject',
          status: 'error',
          userErrors: createResult.data.metaobjectCreate.userErrors
        });
      } else {
        diagnostics.tests.push({
          name: 'Create Test Metaobject',
          status: 'success',
          createdMetaobject: createResult.data?.metaobjectCreate?.metaobject
        });
        console.log('测试记录创建成功:', createResult.data.metaobjectCreate.metaobject);
      }
    } catch (error) {
      diagnostics.tests.push({
        name: 'Create Test Metaobject',
        status: 'error',
        error: error.message
      });
    }

    // 返回诊断结果
    return res.status(200).json(diagnostics);

  } catch (error) {
    console.error('诊断脚本执行错误:', error);
    return res.status(500).json({
      error: '诊断失败',
      message: error.message,
      stack: error.stack
    });
  }
}
