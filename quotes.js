// Vercel Serverless Function（Node 18+）
// GET    /api/quotes
// POST   /api/quotes
// PATCH  /api/quotes?handle=xxx
// DELETE /api/quotes?handle=xxx

const SHOP = process.env.SHOP;              // 例：sain-pdc-test.myshopify.com
const ADMIN_TOKEN = process.env.ADMIN_TOKEN; // Admin API access token

async function shopGql(query, variables) {
  const r = await fetch(`https://${SHOP}/admin/api/2024-07/graphql.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': ADMIN_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, variables })
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Shopify ${r.status}: ${text}`);
  }
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  try {
    const method = req.method.toUpperCase();

    if (method === 'GET') {
      const q = `
        query {
          metaobjects(type: "quote", first: 50) {
            nodes { id handle fields { key value } createdAt updatedAt }
          }
        }`;
      const data = await shopGql(q, {});
      return res.status(200).json({ records: data.data.metaobjects.nodes });
    }

    if (method === 'POST') {
      const body = req.body || {};
      const { text = '', author = '', status = 'Pending', price = '', invoice_url = '' } = body;
      const m = `
        mutation($fields:[MetaobjectFieldInput!]!) {
          metaobjectCreate(metaobject: {type:"quote", fields:$fields}) {
            metaobject { id handle fields { key value } }
            userErrors { field message }
          }
        }`;
      const fields = [
        { key: 'text', value: String(text) },
        { key: 'author', value: String(author) },
        { key: 'status', value: String(status) },
        { key: 'price', value: String(price) },
        { key: 'invoice_url', value: String(invoice_url) }
      ];
      const data = await shopGql(m, { fields });
      const ue = data.data.metaobjectCreate.userErrors;
      if (ue && ue.length) return res.status(400).json({ errors: ue });
      return res.status(201).json(data.data.metaobjectCreate.metaobject);
    }

    if (method === 'PATCH' || method === 'PUT') {
      const handle = String(req.query.handle || '');
      if (!handle) return res.status(400).json({ error: 'Missing handle' });

      const patch = req.body || {};
      const fields = Object.entries(patch).map(([k, v]) => ({ key: k, value: String(v ?? '') }));
      const m = `
        mutation($handle:String!, $fields:[MetaobjectFieldInput!]!) {
          metaobjectUpdate(handle:$handle, metaobject:{fields:$fields}) {
            metaobject { id handle fields { key value } }
            userErrors { field message }
          }
        }`;
      const data = await shopGql(m, { handle, fields });
      const ue = data.data.metaobjectUpdate.userErrors;
      if (ue && ue.length) return res.status(400).json({ errors: ue });
      return res.status(200).json(data.data.metaobjectUpdate.metaobject);
    }

    if (method === 'DELETE') {
      const handle = String(req.query.handle || '');
      if (!handle) return res.status(400).json({ error: 'Missing handle' });

      const lookup = await shopGql(
        `query($handle:String!){ metaobjectByHandle(handle:$handle, type:"quote"){ id } }`,
        { handle }
      );
      const id = lookup.data?.metaobjectByHandle?.id;
      if (!id) return res.status(404).json({ error: 'Not found' });

      const d = await shopGql(
        `mutation($id:ID!){ metaobjectDelete(id:$id){ deletedId userErrors { field message } } }`,
        { id }
      );
      const ue = d.data.metaobjectDelete.userErrors;
      if (ue && ue.length) return res.status(400).json({ errors: ue });
      return res.status(200).json({ deletedId: d.data.metaobjectDelete.deletedId });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Server Error' });
  }
}