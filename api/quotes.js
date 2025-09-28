// 修复后的 Vercel 后端 API
// 处理 Shopify Metaobject 的 URL 字段限制

export default async function handler(req, res) {
  // CORS 设置
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOP;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || process.env.ADMIN_TOKEN;

  if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
    console.error('Missing Shopify configuration:', {
      SHOPIFY_STORE_DOMAIN: !!SHOPIFY_STORE_DOMAIN,
      SHOPIFY_ACCESS_TOKEN: !!SHOPIFY_ACCESS_TOKEN,
      SHOP: !!process.env.SHOP,
      ADMIN_TOKEN: !!process.env.ADMIN_TOKEN
    });
    return res.status(500).json({ error: 'Missing Shopify configuration' });
  }

  console.log('Shopify configuration loaded:', {
    domain: SHOPIFY_STORE_DOMAIN,
    tokenLength: SHOPIFY_ACCESS_TOKEN ? SHOPIFY_ACCESS_TOKEN.length : 0,
    tokenPrefix: SHOPIFY_ACCESS_TOKEN ? SHOPIFY_ACCESS_TOKEN.substring(0, 10) + '...' : 'none'
  });

  const graphqlEndpoint = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/graphql.json`;

  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(req, res, graphqlEndpoint);
      case 'POST':
        return await handlePost(req, res, graphqlEndpoint);
      case 'PATCH':
        return await handlePatch(req, res, graphqlEndpoint);
      case 'DELETE':
        return await handleDelete(req, res, graphqlEndpoint);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// GET - 获取所有报价
async function handleGet(req, res, graphqlEndpoint) {
  const query = `
    query {
      metaobjects(type: "quote", first: 50) {
        edges {
          node {
            id
            handle
            fields {
              key
              value
            }
          }
        }
      }
    }
  `;

  const response = await fetch(graphqlEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
    },
    body: JSON.stringify({ query }),
  });

  const data = await response.json();
  
  if (data.errors) {
    console.error('GraphQL errors:', data.errors);
    console.error('Response status:', response.status);
    console.error('Response headers:', Object.fromEntries(response.headers.entries()));
    return res.status(400).json({ errors: data.errors });
  }

  const records = data.data.metaobjects.edges.map(edge => edge.node);
  
  // 过滤掉已删除的记录
  const activeRecords = records.filter(record => {
    const statusField = record.fields.find(f => f.key === 'status');
    return statusField && statusField.value !== 'Deleted';
  });

  return res.json({ records: activeRecords });
}

// POST - 创建新报价
async function handlePost(req, res, graphqlEndpoint) {
  const { text, author, email, status = 'Pending', price = '', invoice_url } = req.body;

  console.log('POST 请求数据:', { text, author, email, status, price, invoice_url });

  // 处理文件URL - 如果是data: URI，存储为文本字段
  let fileData = '';
  let fileUrl = '';
  
  if (invoice_url) {
    if (invoice_url.startsWith('data:')) {
      // data: URI 存储为文本字段
      fileData = invoice_url.substring(0, 1000); // 限制长度
      fileUrl = 'data:uri'; // 占位符
      console.log('检测到 data: URI，存储为文本字段');
    } else if (invoice_url.startsWith('http://') || invoice_url.startsWith('https://')) {
      // 标准URL
      fileUrl = invoice_url;
      fileData = 'http:url';
      console.log('检测到标准 URL');
    } else {
      // 其他情况
      fileData = invoice_url;
      fileUrl = 'text:data';
      console.log('存储为文本数据');
    }
  }

  // 生成唯一的handle
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);
  const handle = `${email ? email.replace(/[^a-zA-Z0-9]/g, '-') : 'customer'}-${randomId}`;

  const mutation = `
    mutation metaobjectCreate($metaobject: MetaobjectCreateInput!) {
      metaobjectCreate(metaobject: $metaobject) {
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

  const variables = {
    metaobject: {
      type: 'quote',
      handle: handle,
      fields: [
        { key: 'text', value: text || '' },
        { key: 'author', value: author || '' },
        { key: 'email', value: email || '' },
        { key: 'status', value: status },
        { key: 'price', value: price },
        { key: 'invoice_url', value: fileUrl },
        { key: 'file_data', value: fileData } // 新增字段存储文件数据
      ]
    }
  };

  console.log('GraphQL 变量:', JSON.stringify(variables, null, 2));

  const response = await fetch(graphqlEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
    },
    body: JSON.stringify({ query: mutation, variables }),
  });

  const result = await response.json();
  console.log('GraphQL 响应:', JSON.stringify(result, null, 2));

  if (result.errors) {
    console.error('GraphQL errors:', result.errors);
    return res.status(400).json({ errors: result.errors });
  }

  if (result.data.metaobjectCreate.userErrors.length > 0) {
    console.error('User errors:', result.data.metaobjectCreate.userErrors);
    return res.status(400).json({ errors: result.data.metaobjectCreate.userErrors });
  }

  return res.json({ 
    success: true, 
    metaobject: result.data.metaobjectCreate.metaobject 
  });
}

// PATCH - 更新报价
async function handlePatch(req, res, graphqlEndpoint) {
  const { handle } = req.query;
  const updateData = req.body;

  console.log('PATCH 请求:', { handle, updateData });

  if (!handle) {
    return res.status(400).json({ error: 'Missing handle parameter' });
  }

  // 首先获取 Metaobject ID
  const metaobjectId = await getMetaobjectIdByHandle(handle, graphqlEndpoint);
  
  if (!metaobjectId) {
    return res.status(404).json({ error: 'Metaobject not found' });
  }

  console.log('找到 Metaobject ID:', metaobjectId);

  // 构建更新字段
  const fields = [];
  
  if (updateData.status !== undefined) {
    fields.push({ key: 'status', value: String(updateData.status) });
  }
  if (updateData.price !== undefined) {
    fields.push({ key: 'price', value: String(updateData.price) });
  }
  if (updateData.note !== undefined) {
    fields.push({ key: 'note', value: String(updateData.note) });
  }

  const mutation = `
    mutation metaobjectUpdate($id: ID!, $metaobject: MetaobjectUpdateInput!) {
      metaobjectUpdate(id: $id, metaobject: $metaobject) {
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

  const variables = {
    id: metaobjectId,
    metaobject: {
      fields: fields
    }
  };

  console.log('PATCH GraphQL 变量:', JSON.stringify(variables, null, 2));

  const response = await fetch(graphqlEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
    },
    body: JSON.stringify({ query: mutation, variables }),
  });

  const result = await response.json();
  console.log('PATCH GraphQL 响应:', JSON.stringify(result, null, 2));

  if (result.errors) {
    console.error('GraphQL errors:', result.errors);
    return res.status(400).json({ errors: result.errors });
  }

  if (result.data.metaobjectUpdate.userErrors.length > 0) {
    console.error('User errors:', result.data.metaobjectUpdate.userErrors);
    return res.status(400).json({ errors: result.data.metaobjectUpdate.userErrors });
  }

  return res.json({ 
    success: true, 
    metaobject: result.data.metaobjectUpdate.metaobject 
  });
}

// DELETE - 删除报价
async function handleDelete(req, res, graphqlEndpoint) {
  const { handle } = req.query;

  console.log('DELETE 请求:', { handle });

  if (!handle) {
    return res.status(400).json({ error: 'Missing handle parameter' });
  }

  // 首先获取 Metaobject ID
  const metaobjectId = await getMetaobjectIdByHandle(handle, graphqlEndpoint);
  
  if (!metaobjectId) {
    return res.status(404).json({ error: 'Metaobject not found' });
  }

  console.log('找到 Metaobject ID:', metaobjectId);

  const mutation = `
    mutation metaobjectDelete($id: ID!) {
      metaobjectDelete(id: $id) {
        deletedId
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    id: metaobjectId
  };

  console.log('DELETE GraphQL 变量:', JSON.stringify(variables, null, 2));

  const response = await fetch(graphqlEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
    },
    body: JSON.stringify({ query: mutation, variables }),
  });

  const result = await response.json();
  console.log('DELETE GraphQL 响应:', JSON.stringify(result, null, 2));

  if (result.errors) {
    console.error('GraphQL errors:', result.errors);
    return res.status(400).json({ errors: result.errors });
  }

  if (result.data.metaobjectDelete.userErrors.length > 0) {
    console.error('User errors:', result.data.metaobjectDelete.userErrors);
    return res.status(400).json({ errors: result.data.metaobjectDelete.userErrors });
  }

  return res.json({ 
    success: true, 
    deletedId: result.data.metaobjectDelete.deletedId 
  });
}

// 辅助函数：通过 handle 获取 Metaobject ID
async function getMetaobjectIdByHandle(handle, graphqlEndpoint) {
  console.log('查找 Metaobject ID，handle:', handle);

  // 首先尝试通过 handle 直接查询
  const query = `
    query metaobjectByHandle($handle: String!, $type: String!) {
      metaobjectByHandle(handle: $handle, type: $type) {
        id
        handle
        fields {
          key
          value
        }
      }
    }
  `;

  const variables = {
    handle: handle,
    type: 'quote'
  };

  try {
    const response = await fetch(graphqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
      },
      body: JSON.stringify({ query, variables }),
    });

    const result = await response.json();
    console.log('metaobjectByHandle 响应:', JSON.stringify(result, null, 2));

    if (result.data.metaobjectByHandle) {
      return result.data.metaobjectByHandle.id;
    }
  } catch (error) {
    console.warn('metaobjectByHandle 查询失败:', error);
  }

  // 如果直接查询失败，尝试从所有记录中查找
  console.log('回退到全量查询');
  
  const fallbackQuery = `
    query {
      metaobjects(type: "quote", first: 100) {
        edges {
          node {
            id
            handle
            fields {
              key
              value
            }
          }
        }
      }
    }
  `;

  try {
    const response = await fetch(graphqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
      },
      body: JSON.stringify({ query: fallbackQuery }),
    });

    const result = await response.json();
    
    if (result.data.metaobjects.edges) {
      const matchingNode = result.data.metaobjects.edges.find(edge => 
        edge.node.handle === handle
      );
      
      if (matchingNode) {
        console.log('通过全量查询找到匹配项');
        return matchingNode.node.id;
      }
    }
  } catch (error) {
    console.error('全量查询失败:', error);
  }

  console.warn('未找到匹配的 Metaobject');
  return null;
}
