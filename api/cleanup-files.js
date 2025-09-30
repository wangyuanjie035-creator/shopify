// 清理所有标记为 Deleted 的 Metaobject 记录

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
    // 1. 查询所有 quote 记录
    console.log('查询所有 quote 记录...');
    const queryResult = await shopGql(`
      query {
        metaobjects(type: "quote", first: 100) {
          nodes {
            id
            handle
            fields {
              key
              value
            }
          }
        }
      }
    `, {});

    const allRecords = queryResult.data?.metaobjects?.nodes || [];
    console.log(`找到 ${allRecords.length} 条记录`);

    // 2. 找出所有状态为 Deleted 的记录
    const deletedRecords = allRecords.filter(record => {
      const statusField = record.fields.find(f => f.key === 'status');
      return statusField && statusField.value === 'Deleted';
    });

    console.log(`找到 ${deletedRecords.length} 条 Deleted 记录`);

    // 3. 删除这些记录
    const deleteResults = [];
    for (const record of deletedRecords) {
      try {
        console.log(`删除记录: ${record.handle} (${record.id})`);
        const deleteResult = await shopGql(`
          mutation($id: ID!) {
            metaobjectDelete(id: $id) {
              deletedId
              userErrors {
                field
                message
              }
            }
          }
        `, { id: record.id });

        if (deleteResult.data?.metaobjectDelete?.userErrors?.length > 0) {
          deleteResults.push({
            id: record.id,
            handle: record.handle,
            status: 'error',
            errors: deleteResult.data.metaobjectDelete.userErrors
          });
        } else {
          deleteResults.push({
            id: record.id,
            handle: record.handle,
            status: 'deleted',
            deletedId: deleteResult.data?.metaobjectDelete?.deletedId
          });
        }
      } catch (error) {
        deleteResults.push({
          id: record.id,
          handle: record.handle,
          status: 'error',
          error: error.message
        });
      }
    }

    // 4. 查询剩余记录
    const finalQueryResult = await shopGql(`
      query {
        metaobjects(type: "quote", first: 100) {
          nodes {
            id
            handle
            fields {
              key
              value
            }
          }
        }
      }
    `, {});

    const remainingRecords = finalQueryResult.data?.metaobjects?.nodes || [];
    console.log(`清理后剩余 ${remainingRecords.length} 条记录`);

    return res.status(200).json({
      success: true,
      message: '清理完成',
      before: {
        total: allRecords.length,
        deleted: deletedRecords.length
      },
      deleteResults: deleteResults,
      after: {
        total: remainingRecords.length
      },
      remainingRecords: remainingRecords
    });

  } catch (error) {
    console.error('清理失败:', error);
    return res.status(500).json({
      error: '清理失败',
      message: error.message,
      stack: error.stack
    });
  }
}

