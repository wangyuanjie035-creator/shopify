const SHOP = process.env.SHOP;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

async function shopGql(query, variables) {
  const r = await fetch(`https://${SHOP}/admin/api/2024-07/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': ADMIN_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables })
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export default async function handler(req, res) {
    // CORS - 支持多个域名
  const allowedOrigins = [
    'https://sain-pdc-test.myshopify.com',
    'https://rt08kw-se.myshopify.com',
    'http://localhost:3000'
  ];
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://sain-pdc-test.myshopify.com');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Accept,Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    const m = req.method.toUpperCase();
    if (m === 'GET') {
      const q = `query { metaobjects(type:"quote", first:50){ nodes{ id handle fields{ key value } } } }`;
      const data = await shopGql(q, {});
      
      // 过滤掉已删除的记录
      const activeRecords = data.data.metaobjects.nodes.filter(record => {
        const statusField = record.fields.find(f => f.key === 'status');
        return statusField && statusField.value !== 'Deleted';
      });
      
      console.log(`Found ${data.data.metaobjects.nodes.length} total records, ${activeRecords.length} active records`);
      
      return res.status(200).json({ records: activeRecords });
    }
    if (m === 'POST') {
      const { text='', author='', status='Pending', price='', invoice_url='', email='' } = req.body || {};
      
      console.log('POST request data:', { text, author, status, price, invoice_url, email });
      
      // 处理文件URL - 支持 data: URI
      let fileUrl = String(invoice_url || '');
      let fileData = '';
      
      if (fileUrl.startsWith('data:')) {
        // data: URI 存储为文本字段
        fileData = fileUrl.substring(0, 2000); // 限制长度
        fileUrl = 'data:uri'; // 占位符
        console.log('检测到 data: URI，存储为文本字段');
      } else if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
        // 标准URL
        fileData = 'http:url';
        console.log('检测到标准 URL');
      } else if (fileUrl) {
        // 其他情况
        fileData = fileUrl;
        fileUrl = 'text:data';
        console.log('存储为文本数据');
      }
      
      const fields = [
        { key:'text', value:String(text) },
        { key:'author', value:String(author) },
        { key:'email', value:String(email) },
        { key:'status', value:String(status) },
        { key:'price', value:String(price) },
        { key:'invoice_url', value:fileUrl },
        { key:'file_data', value:fileData } // 新增字段存储文件数据
      ];
      const mql = `mutation($fields:[MetaobjectFieldInput!]!){
        metaobjectCreate(metaobject:{type:"quote", fields:$fields}){
          metaobject{ id handle fields{ key value } } userErrors{ field message }
        }}`;
      const data = await shopGql(mql, { fields });
      const ue = data.data.metaobjectCreate.userErrors;
      if (ue?.length) return res.status(400).json({ errors: ue });
      return res.status(201).json(data.data.metaobjectCreate.metaobject);
    }
    if (m === 'PATCH' || m === 'PUT') {
      const handle = String(req.query.handle || '');
      if (!handle) return res.status(400).json({ error:'Missing handle' });
      
      // 🔧 修复：先通过 handle 查找 id
      console.log('PATCH request received for handle:', handle);
      
      const lookup = await shopGql(
        `query($handle:String!){ metaobjectByHandle(handle:$handle, type:"quote"){ id } }`,
        { handle }
      );
      
      console.log('Lookup result:', JSON.stringify(lookup, null, 2));
      
      if (!lookup.data?.metaobjectByHandle?.id) {
        console.error('Metaobject not found for handle:', handle);
        return res.status(404).json({ error:'Metaobject not found' });
      }
      
      const id = lookup.data.metaobjectByHandle.id;
      console.log('Found metaobject id:', id);
      
      const fields = Object.entries(req.body || {}).map(([k,v]) => ({ key:k, value:String(v ?? '') }));
      console.log('Fields to update:', fields);
      
      // 🔧 修复：使用 id 而不是 handle
      const mql = `mutation($id:ID!, $fields:[MetaobjectFieldInput!]!){
        metaobjectUpdate(id:$id, metaobject:{fields:$fields}){
          metaobject{ id handle fields{ key value } } userErrors{ field message }
        }}`;
      
      console.log('GraphQL Mutation Query:', mql);
      console.log('GraphQL Mutation Variables:', { id, fields });

      const data = await shopGql(mql, { id, fields });

      console.log('Shopify GraphQL Response (data):', JSON.stringify(data, null, 2));

      // 检查顶层错误
      if (data.errors) {
        console.error('Shopify GraphQL top-level errors:', data.errors);
        return res.status(500).json({ errors: data.errors, message: 'Shopify GraphQL top-level errors' });
      }

      // 检查 metaobjectUpdate 是否存在
      if (!data.data || !data.data.metaobjectUpdate) {
        console.error('Shopify GraphQL response missing data.data.metaobjectUpdate:', data);
        return res.status(500).json({ error: 'Unexpected Shopify GraphQL response structure', response: data });
      }

      const ue = data.data.metaobjectUpdate.userErrors;
      if (ue?.length) {
        console.error('Shopify GraphQL user errors:', ue);
        return res.status(400).json({ errors: ue });
      }
      return res.json(data.data.metaobjectUpdate.metaobject);
    }
    if (m === 'DELETE') {
      const handle = String(req.query.handle || '');
      if (!handle) return res.status(400).json({ error:'Missing handle' });
      
      console.log('DELETE request received for handle:', handle);
      
      // 查找要删除的 Metaobject - 使用更健壮的查询
      let lookup;
      try {
        lookup = await shopGql(
          `query($handle:String!){ metaobjectByHandle(handle:$handle, type:"quote"){ id handle fields{ key value } } }`,
          { handle }
        );
        console.log('metaobjectByHandle lookup result:', JSON.stringify(lookup, null, 2));
      } catch (error) {
        console.error('metaobjectByHandle query failed:', error);
        lookup = null;
      }
      
      let id = lookup?.data?.metaobjectByHandle?.id;
      
      // 如果直接查询失败，尝试从所有记录中查找
      if (!id) {
        console.log('Direct lookup failed, trying fallback query');
        try {
          const fallbackQuery = `query { metaobjects(type:"quote", first:100){ nodes{ id handle fields{ key value } } } }`;
          const fallbackResult = await shopGql(fallbackQuery, {});
          console.log('Fallback query result:', JSON.stringify(fallbackResult, null, 2));
          
          const matchingNode = fallbackResult.data?.metaobjects?.nodes?.find(node => node.handle === handle);
          if (matchingNode) {
            id = matchingNode.id;
            console.log('Found matching node via fallback:', matchingNode);
          }
        } catch (fallbackError) {
          console.error('Fallback query failed:', fallbackError);
        }
      }
      
      if (!id) {
        console.log('Metaobject not found for handle:', handle);
        return res.status(404).json({ error:'Metaobject not found' });
      }
      
      console.log('Found metaobject id for deletion:', id);
      
      const d = await shopGql(
        `mutation($id:ID!){ metaobjectDelete(id:$id){ deletedId userErrors{ field message } } }`,
        { id }
      );
      
      console.log('Delete mutation result:', JSON.stringify(d, null, 2));
      
      const ue = d.data?.metaobjectDelete?.userErrors;
      if (ue?.length) {
        console.error('Delete user errors:', ue);
        return res.status(400).json({ errors: ue });
      }
      
      return res.json({ 
        success: true,
        deletedId: d.data.metaobjectDelete.deletedId,
        message: 'Metaobject deleted successfully'
      });
    }
    return res.status(405).json({ error:'Method Not Allowed' });
  } catch (e) {
    console.error('Server error:', e);
    return res.status(500).json({ error: e?.message || 'Server Error' });
  }
}
