// 删除所有 quote 记录
const SHOP = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOP;
const ADMIN_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || process.env.ADMIN_TOKEN;

async function shopGql(query, variables) {
  const r = await fetch(`https://${SHOP}/admin/api/2024-07/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': ADMIN_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables })
  });
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  
  const html = [];
  html.push('<!DOCTYPE html><html><head><meta charset="utf-8"><title>删除所有记录</title></head><body style="font-family: Arial; padding: 20px;">');
  html.push('<h1>🗑️ 删除所有 quote 记录</h1>');
  html.push('<pre style="background: #f5f5f5; padding: 15px; border-radius: 5px;">');
  
  try {
    // 查询所有记录
    const allRecords = await shopGql(`
      query { metaobjects(type: "quote", first: 100) { 
        nodes { id handle } 
      } }
    `, {});
    
    const nodes = allRecords.data?.metaobjects?.nodes || [];
    html.push(`找到 ${nodes.length} 条记录\n\n`);
    
    let deleted = 0;
    let failed = 0;
    
    for (const record of nodes) {
      html.push(`删除: ${record.handle} ... `);
      
      try {
        const deleteResult = await shopGql(`
          mutation($id: ID!) {
            metaobjectDelete(id: $id) {
              deletedId
              userErrors { field message }
            }
          }
        `, { id: record.id });
        
        if (deleteResult.data?.metaobjectDelete?.userErrors?.length > 0) {
          html.push(`❌ 失败: ${JSON.stringify(deleteResult.data.metaobjectDelete.userErrors)}\n`);
          failed++;
        } else {
          html.push(`✅ 成功\n`);
          deleted++;
        }
      } catch (error) {
        html.push(`❌ 错误: ${error.message}\n`);
        failed++;
      }
    }
    
    html.push(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    html.push(`总计: ${nodes.length} 条\n`);
    html.push(`✅ 成功删除: ${deleted} 条\n`);
    html.push(`❌ 失败: ${failed} 条\n`);
    html.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`);
    
    html.push('</pre>');
    html.push('<p><a href="/api/quotes" style="display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px;">查看剩余订单</a></p>');
    html.push('<p><a href="javascript:history.back()" style="display: inline-block; padding: 10px 20px; background: #6c757d; color: white; text-decoration: none; border-radius: 5px;">返回</a></p>');
    
  } catch (error) {
    html.push(`\n❌ 致命错误: ${error.message}\n`);
    html.push(`${error.stack}\n`);
  }
  
  html.push('</body></html>');
  return res.send(html.join(''));
}
