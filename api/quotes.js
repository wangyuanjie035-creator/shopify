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
  // 🔧 修复 CORS 设置
  const allowedOrigins = [
    'https://sain-pdc-test.myshopify.com',
    'https://rt08kw-se.myshopify.com',
    'http://localhost:3000'
  ];
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
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
      return res.status(200).json({ records: data.data.metaobjects.nodes });
    }
    
    if (m === 'POST') {
      const { text='', author='', status='Pending', price='', invoice_url='' } = req.body || {};
      const fields = [
        { key:'text', value:String(text) },
        { key:'author', value:String(author) },
        { key:'status', value:String(status) },
        { key:'price', value:String(price) },
        { key:'invoice_url', value:String(invoice_url) }
      ];
      
      console.log('Creating new quote with fields:', fields);
      
      const mql = `mutation($fields:[MetaobjectFieldInput!]!){
        metaobjectCreate(metaobject:{type:"quote", fields:$fields}){
          metaobject{ id handle fields{ key value } } userErrors{ field message }
        }}`;
      const data = await shopGql(mql, { fields });
      
      console.log('Create response:', JSON.stringify(data, null, 2));
      
      const ue = data.data.metaobjectCreate.userErrors;
      if (ue?.length) return res.status(400).json({ errors: ue });
      return res.status(201).json(data.data.metaobjectCreate.metaobject);
    }
    
    if (m === 'PATCH' || m === 'PUT') {
      const handle = String(req.query.handle || '');
      if (!handle) return res.status(400).json({ error:'Missing handle' });
      
      console.log('PATCH request received for handle:', handle);
      
      // 🔧 修复：尝试两种查找方式
      let lookup, id;
      
      // 方式1：使用 metaobjectByHandle
      try {
        lookup = await shopGql(
          `query($handle:String!){ metaobjectByHandle(handle:$handle, type:"quote"){ id } }`,
          { handle }
        );
        console.log('metaobjectByHandle result:', JSON.stringify(lookup, null, 2));
        
        if (lookup.data?.metaobjectByHandle?.id) {
          id = lookup.data.metaobjectByHandle.id;
          console.log('Found via metaobjectByHandle, id:', id);
        }
      } catch (error) {
        console.log('metaobjectByHandle failed:', error.message);
      }
      
      // 方式2：如果方式1失败，使用 metaobjects 查询
      if (!id) {
        try {
          lookup = await shopGql(
            `query{ metaobjects(type:"quote", first:50){ nodes{ id handle } } }`,
            {}
          );
          console.log('metaobjects query result:', JSON.stringify(lookup, null, 2));
          
          const found = lookup.data?.metaobjects?.nodes?.find(node => node.handle === handle);
          if (found) {
            id = found.id;
            console.log('Found via metaobjects query, id:', id);
          }
        } catch (error) {
          console.log('metaobjects query failed:', error.message);
        }
      }
      
      if (!id) {
        console.error('Metaobject not found for handle:', handle);
        return res.status(404).json({ error:'Metaobject not found' });
      }
      
      const fields = Object.entries(req.body || {}).map(([k,v]) => ({ key:k, value:String(v ?? '') }));
      console.log('Fields to update:', fields);
      
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
      
      // 🔧 修复：使用与 PATCH 相同的查找逻辑
      let lookup, id;
      
      // 方式1：使用 metaobjectByHandle
      try {
        lookup = await shopGql(
          `query($handle:String!){ metaobjectByHandle(handle:$handle, type:"quote"){ id } }`,
          { handle }
        );
        
        if (lookup.data?.metaobjectByHandle?.id) {
          id = lookup.data.metaobjectByHandle.id;
        }
      } catch (error) {
        console.log('metaobjectByHandle failed:', error.message);
      }
      
      // 方式2：如果方式1失败，使用 metaobjects 查询
      if (!id) {
        try {
          lookup = await shopGql(
            `query{ metaobjects(type:"quote", first:50){ nodes{ id handle } } }`,
            {}
          );
          
          const found = lookup.data?.metaobjects?.nodes?.find(node => node.handle === handle);
          if (found) {
            id = found.id;
          }
        } catch (error) {
          console.log('metaobjects query failed:', error.message);
        }
      }
      
      if (!id) {
        console.log('Metaobject not found for handle:', handle);
        return res.status(404).json({ error:'Not found' });
      }
      
      const d = await shopGql(
        `mutation($id:ID!){ metaobjectDelete(id:$id){ deletedId userErrors{ field message } } }`,
        { id }
      );
      const ue = d.data.metaobjectDelete.userErrors;
      if (ue?.length) return res.status(400).json({ errors: ue });
      return res.json({ deletedId: d.data.metaobjectDelete.deletedId });
    }
    
    return res.status(405).json({ error:'Method Not Allowed' });
  } catch (e) {
    console.error('Server error:', e);
    return res.status(500).json({ error: e?.message || 'Server Error' });
  }
}
