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
    // CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://sain-pdc-test.myshopify.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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
    const fields = Object.entries(req.body || {}).map(([k,v]) => ({ key:k, value:String(v ?? '') }));
    const mql = `mutation($handle:String!, $fields:[MetaobjectFieldInput!]!){
      metaobjectUpdate(handle:$handle, metaobject:{fields:$fields}){
        metaobject{ id handle fields{ key value } } userErrors{ field message }
      }}`;
    // 🔧 添加调试日志
    console.log('PATCH request received for handle:', handle);
    console.log('Fields to update:', fields);
    console.log('GraphQL Mutation Query:', mql);
    console.log('GraphQL Mutation Variables:', { handle, fields });
    const data = await shopGql(mql, { handle, fields });
    // 🔧 添加调试日志
    console.log('Shopify GraphQL Response (data):', JSON.stringify(data, null, 2));
    // 🔧 检查顶层错误
    if (data.errors) {
      console.error('Shopify GraphQL top-level errors:', data.errors);
      return res.status(500).json({ errors: data.errors, message: 'Shopify GraphQL top-level errors' });
    }
    // 🔧 检查 metaobjectUpdate 是否存在
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
    
    // 🔧 添加调试日志
    console.log('Attempting to delete handle:', handle);
    
    const lookup = await shopGql(
      `query($handle:String!){ metaobjectByHandle(handle:$handle, type:"quote"){ id } }`,
      { handle }
    );
    console.log('Lookup result:', JSON.stringify(lookup, null, 2));
    const id = lookup.data?.metaobjectByHandle?.id;
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
    return res.status(500).json({ error: e?.message || 'Server Error' });
  }
}
