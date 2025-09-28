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
      
      // 将 email 信息合并到 author 字段中
      const authorWithEmail = email ? `${author} (${email})` : author;
      
      const fields = [
        { key:'text', value:String(text) },
        { key:'author', value:String(authorWithEmail) },
        { key:'status', value:String(status) },
        { key:'price', value:String(price) },
        { key:'invoice_url', value:fileUrl }
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
      
      // 🔧 修复：先通过 handle 查找 id，支持部分匹配
      console.log('PATCH request received for handle:', handle);
      
      let lookup = await shopGql(
        `query($handle:String!){ metaobjectByHandle(handle:$handle, type:"quote"){ id } }`,
        { handle }
      );
      
      console.log('Direct lookup result:', JSON.stringify(lookup, null, 2));
      
      let id = lookup.data?.metaobjectByHandle?.id;
      
      // 如果直接查找失败，尝试部分匹配
      if (!id) {
        console.log('Direct lookup failed, trying partial match for:', handle);
        
        const allRecords = await shopGql(
          `query { metaobjects(type:"quote", first:100){ nodes{ id handle fields{ key value } } } }`,
          {}
        );
        
        // 查找包含 handle 的记录
        const matchingRecord = allRecords.data?.metaobjects?.nodes?.find(record => 
          record.handle.includes(handle) || handle.includes(record.handle)
        );
        
        if (matchingRecord) {
          id = matchingRecord.id;
          console.log('Found matching record via partial match:', matchingRecord);
        }
      }
      
      if (!id) {
        console.error('Metaobject not found for handle:', handle);
        return res.status(404).json({ error:'Metaobject not found' });
      }
      
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
      
      // 使用标记删除而不是真正删除
      try {
        // 先尝试直接查找
        let lookup = await shopGql(
          `query($handle:String!){ metaobjectByHandle(handle:$handle, type:"quote"){ id handle fields{ key value } } }`,
          { handle }
        );
        
        console.log('Direct lookup result:', JSON.stringify(lookup, null, 2));
        
        let id = lookup.data?.metaobjectByHandle?.id;
        
        // 如果直接查找失败，尝试部分匹配
        if (!id) {
          console.log('Direct lookup failed, trying partial match for:', handle);
          
          const allRecords = await shopGql(
            `query { metaobjects(type:"quote", first:100){ nodes{ id handle fields{ key value } } } }`,
            {}
          );
          
          console.log('All records:', JSON.stringify(allRecords, null, 2));
          
          // 查找包含 handle 的记录
          const matchingRecord = allRecords.data?.metaobjects?.nodes?.find(record => 
            record.handle.includes(handle) || handle.includes(record.handle)
          );
          
          if (matchingRecord) {
            id = matchingRecord.id;
            console.log('Found matching record via partial match:', matchingRecord);
          }
        }
        
        if (!id) {
          console.log('Metaobject not found for handle:', handle);
          return res.status(404).json({ error:'Metaobject not found' });
        }
        
        console.log('Found metaobject id for deletion:', id);
        
        // 标记为已删除而不是真正删除
        const updateResult = await shopGql(
          `mutation($id:ID!){ 
            metaobjectUpdate(id:$id, metaobject:{fields:[{key:"status", value:"Deleted"}]}){
              metaobject{ id handle fields{ key value } } 
              userErrors{ field message } 
            } 
          }`,
          { id }
        );
        
        console.log('Mark as deleted result:', JSON.stringify(updateResult, null, 2));
        
        const ue = updateResult.data?.metaobjectUpdate?.userErrors;
        if (ue?.length) {
          console.error('Update user errors:', ue);
          return res.status(400).json({ errors: ue });
        }
        
        return res.json({ 
          success: true,
          message: 'Metaobject marked as deleted successfully'
        });
        
      } catch (error) {
        console.error('Delete operation failed:', error);
        return res.status(500).json({ error: error.message });
      }
    }
    return res.status(405).json({ error:'Method Not Allowed' });
  } catch (e) {
    console.error('Server error:', e);
    return res.status(500).json({ error: e?.message || 'Server Error' });
  }
}
