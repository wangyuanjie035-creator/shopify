const { setCorsHeaders } = require('./_cors-config.js');

// Helper to normalize Shopify domain
function normalizeDomain(domain) {
  if (!domain) return null;
  return domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

// Helper for Shopify GraphQL API
async function shopGql(query, variables) {
  let storeDomain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOP;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.ADMIN_TOKEN;

  // Normalize domain
  storeDomain = normalizeDomain(storeDomain);

  // Add .myshopify.com if missing (optional, but good for safety)
  if (storeDomain && !storeDomain.includes('.')) {
    storeDomain += '.myshopify.com';
  }

  console.log('🔍 Config Check:', { 
    domain: storeDomain, 
    hasToken: !!accessToken 
  });

  if (!storeDomain || !accessToken) {
    const error = {
      message: 'Missing Shopify credentials',
      debug: {
        hasDomain: !!storeDomain,
        hasToken: !!accessToken,
        envKeys: Object.keys(process.env).filter(k => k.includes('SHOP') || k.includes('TOKEN'))
      }
    };
    console.error('❌ Credentials Error:', error);
    throw new Error(JSON.stringify(error));
  }

  const endpoint = `https://${storeDomain}/admin/api/2024-01/graphql.json`;
  
  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Shopify API Error (${resp.status}): ${text}`);
    }

    const json = await resp.json();
    if (json.errors) {
      throw new Error(json.errors[0].message);
    }
    return json;
  } catch (error) {
    console.error('❌ Fetch Error:', error);
    // Re-throw with more context
    throw new Error(`Fetch failed: ${error.message} (Endpoint: ${endpoint})`);
  }
}

// Helper: Upload file to Shopify (used in submitQuote)
async function uploadToShopify(fileData, fileName, fileType = 'application/octet-stream') {
    if (!fileData) return null;
    const base64Data = fileData.includes(',') ? fileData.split(',')[1] : fileData;
    const fileBuffer = Buffer.from(base64Data, 'base64');

    // 1. Staged Upload
    const stagedUploadMutation = `
      mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets { url resourceUrl parameters { name value } }
          userErrors { field message }
        }
      }
    `;
    const stagedRes = await shopGql(stagedUploadMutation, {
      input: [{ filename: fileName, mimeType: fileType, resource: 'FILE' }]
    });
    const target = stagedRes.data.stagedUploadsCreate.stagedTargets[0];

    // 2. Upload to URL
    const formData = new FormData();
    target.parameters.forEach(p => formData.append(p.name, p.value));
    formData.append('file', new Blob([fileBuffer], {type: fileType}), fileName);
    
    await fetch(target.url, { method: 'POST', body: formData });

    // 3. Create File
    const fileCreateMutation = `
      mutation fileCreate($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files { id originalFileSize url }
        }
      }
    `;
    const fileRes = await shopGql(fileCreateMutation, {
      files: [{ originalSource: target.resourceUrl, contentType: fileType, alt: fileName }]
    });
    
    return fileRes.data.fileCreate.files[0];
}

// --- Action Handlers ---

async function getDraftOrders(req, res) {
  const { status, limit = 50, id } = req.query;

  // Single Order
  if (id) {
    const query = `
      query($id: ID!) {
        draftOrder(id: $id) {
          id name email totalPrice status createdAt invoiceUrl
          lineItems(first: 5) {
            edges {
              node {
                id title quantity originalUnitPrice
                customAttributes { key value }
              }
            }
          }
        }
      }
    `;
    let finalId = id;
    if (!id.startsWith('gid://')) {
       const searchQuery = `query($q: String!) { draftOrders(first:1, query:$q) { edges { node { id } } } }`;
       const searchRes = await shopGql(searchQuery, { q: id.startsWith('#') ? `name:${id}` : `name:#${id}` });
       if (searchRes.data.draftOrders.edges.length > 0) {
           finalId = searchRes.data.draftOrders.edges[0].node.id;
       } else {
           return res.status(404).json({ error: 'Order not found' });
       }
    }

    try {
        const result = await shopGql(query, { id: finalId });
        const order = result.data.draftOrder;
        if (!order) return res.status(404).json({ error: 'Order not found' });
        
        const lineItems = order.lineItems.edges.map(e => e.node);
        const firstItem = lineItems[0] || {};
        const attrs = firstItem.customAttributes || [];
        const getAttr = k => attrs.find(a => a.key === k)?.value;

        return res.json({
            success: true,
            draftOrder: {
                id: order.id,
                name: order.name,
                email: order.email,
                status: order.status,
                totalPrice: order.totalPrice,
                invoiceUrl: order.invoiceUrl,
                lineItems,
                file: { name: getAttr('文件') || firstItem.title },
                customization: { material: getAttr('材料'), color: getAttr('颜色') },
                product: { title: firstItem.title }
            }
        });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
  }

  // List Orders
  const query = `
    query getDraftOrders($first: Int!) {
      draftOrders(first: $first) {
        edges {
          node {
            id name email totalPrice createdAt status invoiceUrl
            lineItems(first: 5) { edges { node { customAttributes { key value } } } }
          }
        }
      }
    }
  `;
  try {
      const data = await shopGql(query, { first: parseInt(limit) });
      const orders = data.data.draftOrders.edges.map(e => {
          const n = e.node;
          const firstItem = n.lineItems.edges[0]?.node;
          const statusAttr = firstItem?.customAttributes.find(a => a.key === '状态')?.value;
          return {
              id: n.id,
              name: n.name,
              email: n.email,
              totalPrice: n.totalPrice,
              createdAt: n.createdAt,
              status: statusAttr === '已报价' ? 'quoted' : 'pending',
              invoiceUrl: n.invoiceUrl
          };
      });
      
      let finalOrders = orders;
      if (status && status !== 'all') {
          finalOrders = orders.filter(o => o.status === status);
      }

      return res.json({
          success: true,
          draftOrders: finalOrders,
          total: orders.length
      });
  } catch (e) {
      return res.status(500).json({ error: e.message });
  }
}

async function submitQuote(req, res) {
    const { fileName, customerEmail, customerName, quantity, material, color, precision, lineItems, fileUrl } = req.body;
    
    let shopifyFile = null;
    if (fileUrl && fileUrl.startsWith('data:')) {
        try {
            shopifyFile = await uploadToShopify(fileUrl, fileName);
        } catch (e) {
            console.error('File upload failed in submitQuote', e);
        }
    }

    const quoteId = `Q${Date.now()}`;
    const attributes = [
        { key: '材料', value: material || 'Default' },
        { key: '颜色', value: color || 'Default' },
        { key: '文件', value: fileName || 'unknown' },
        { key: '询价单号', value: quoteId },
        { key: 'Shopify文件ID', value: shopifyFile ? shopifyFile.id : '' }
    ];
    
    if (lineItems && lineItems[0] && lineItems[0].customAttributes) {
        lineItems[0].customAttributes.forEach(attr => {
            if (!['fileData', 'file_data'].includes(attr.key) && attr.value.length < 1000) {
                attributes.push(attr);
            }
        });
    }

    const input = {
        email: customerEmail,
        taxExempt: true,
        lineItems: [{
            title: `3D打印服务 - ${fileName}`,
            quantity: parseInt(quantity) || 1,
            originalUnitPrice: "0.00",
            customAttributes: attributes
        }],
        note: `询价单号: ${quoteId}\n客户: ${customerName}`
    };

    try {
        const mutation = `
            mutation draftOrderCreate($input: DraftOrderInput!) {
                draftOrderCreate(input: $input) {
                    draftOrder { id name invoiceUrl }
                    userErrors { message }
                }
            }
        `;
        const result = await shopGql(mutation, { input });
        if (result.data.draftOrderCreate.userErrors.length > 0) {
            throw new Error(result.data.draftOrderCreate.userErrors[0].message);
        }
        const order = result.data.draftOrderCreate.draftOrder;
        
        return res.json({
            success: true,
            quoteId,
            draftOrderId: order.id,
            message: '询价提交成功'
        });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}

async function updateQuote(req, res) {
    const { draftOrderId, amount, note } = req.body;
    const mutation = `
        mutation draftOrderUpdate($id: ID!, $input: DraftOrderInput!) {
            draftOrderUpdate(id: $id, input: $input) {
                draftOrder { id totalPrice }
                userErrors { message }
            }
        }
    `;
    
    try {
        const getQ = `query($id: ID!) { draftOrder(id: $id) { lineItems(first:1) { edges { node { title quantity customAttributes { key value } } } } } }`;
        const getRes = await shopGql(getQ, { id: draftOrderId });
        const item = getRes.data.draftOrder.lineItems.edges[0].node;
        
        const newAttrs = item.customAttributes.filter(a => a.key !== '状态' && a.key !== '报价金额');
        newAttrs.push({ key: '状态', value: '已报价' });
        newAttrs.push({ key: '报价金额', value: amount.toString() });

        const input = {
            lineItems: [{
                title: item.title,
                quantity: item.quantity,
                originalUnitPrice: amount.toString(),
                customAttributes: newAttrs
            }],
            note: note
        };

        await shopGql(mutation, { id: draftOrderId, input });
        return res.json({ success: true, message: '报价已更新' });

    } catch(e) {
        return res.status(500).json({ error: e.message });
    }
}

async function deleteDraftOrder(req, res) {
    const { id } = req.query; 
    const draftOrderId = id || req.body.draftOrderId;
    if (!draftOrderId) return res.status(400).json({ error: 'Missing ID' });
    
    const mutation = `mutation($id: ID!) { draftOrderDelete(input: {id: $id}) { deletedId userErrors { message } } }`;
    try {
        await shopGql(mutation, { id: draftOrderId });
        return res.json({ success: true, message: 'Deleted' });
    } catch(e) {
        return res.status(500).json({ error: e.message });
    }
}

async function sendInvoice(req, res) {
    const { draftOrderId } = req.body;
    const mutation = `mutation($id: ID!) { draftOrderInvoiceSend(id: $id) { draftOrder { invoiceUrl } userErrors { message } } }`;
    try {
        const result = await shopGql(mutation, { id: draftOrderId });
        if (result.data.draftOrderInvoiceSend.userErrors.length) throw new Error(result.data.draftOrderInvoiceSend.userErrors[0].message);
        return res.json({ success: true, message: 'Invoice sent' });
    } catch(e) {
        return res.status(500).json({ error: e.message });
    }
}

async function completeDraftOrder(req, res) {
    const { draftOrderId } = req.body;
    const mutation = `mutation($id: ID!) { draftOrderComplete(id: $id, paymentPending: true) { draftOrder { status } userErrors { message } } }`;
    try {
        await shopGql(mutation, { id: draftOrderId });
        return res.json({ success: true, message: 'Order completed' });
    } catch(e) {
        return res.status(500).json({ error: e.message });
    }
}

module.exports = async function handler(req, res) {
  try {
      setCorsHeaders(req, res);
  } catch (err) {
      console.error('CORS Error:', err);
  }

  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
      if (req.method === 'GET') {
          return await getDraftOrders(req, res);
      }
      if (req.method === 'DELETE') {
          return await deleteDraftOrder(req, res);
      }
      if (req.method === 'POST') {
          const { action } = req.query;
          if (action === 'update') return await updateQuote(req, res);
          if (action === 'invoice') return await sendInvoice(req, res);
          if (action === 'complete') return await completeDraftOrder(req, res);
          return await submitQuote(req, res); 
      }
      return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
      console.error(e);
      // Return explicit error details to the client for debugging
      return res.status(500).json({ 
        error: 'Internal Server Error', 
        details: e.message,
        // Only show this in development/debugging
        debugInfo: {
          timestamp: new Date().toISOString()
        }
      });
  }
};
