// Vercel 文件上传 API
// 用于处理客户上传的3D模型文件，存储到 Shopify Metaobject

// 本地实现 shopGql，避免跨路由导入在 Vercel 中出错
async function shopGql(query, variables) {
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOP;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.ADMIN_TOKEN;

  if (!storeDomain || !accessToken) {
    return { errors: [{ message: 'Missing SHOPIFY_STORE_DOMAIN or SHOPIFY_ACCESS_TOKEN' }] };
  }

  const endpoint = `https://${storeDomain}/admin/api/2024-07/graphql.json`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await resp.json();
  return json;
}

// 文件存储的 Metaobject 类型
const FILE_METAOBJECT_TYPE = 'uploaded_file';

export default async function handler(req, res) {
  // 设置 CORS 头
  res.setHeader('Access-Control-Allow-Origin', 'https://sain-pdc-test.myshopify.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { fileData, fileName, fileType, orderId } = req.body;
    
    if (!fileData || !fileName) {
      return res.status(400).json({ error: 'Missing file data or filename' });
    }

    // 生成唯一的文件ID
    const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // 规范化与截断文件数据，避免超过 Shopify 字段 65536 字符限制
    const MAX_FIELD_CHARS = 65000; // 留一点余量
    let base64Data = fileData || '';
    // 若包含 data: 前缀，去掉头部
    const commaIdx = base64Data.indexOf(',');
    if (base64Data.startsWith('data:') && commaIdx !== -1) {
      base64Data = base64Data.substring(commaIdx + 1);
    }
    const originalSize = base64Data.length;
    let storedData = base64Data;
    let isTruncated = false;
    if (storedData.length > MAX_FIELD_CHARS) {
      storedData = storedData.slice(0, MAX_FIELD_CHARS);
      isTruncated = true;
    }

    // 将文件数据存储到 Shopify Metaobject（注意：仅适合小文件/示例数据）
    const fields = [
      { key: 'file_id', value: fileId },
      { key: 'file_name', value: fileName },
      { key: 'file_type', value: fileType || 'application/octet-stream' },
      { key: 'file_data', value: storedData }, // 存储截断后的 base64 数据
      { key: 'order_id', value: orderId || '' }, // 关联的订单ID
      { key: 'upload_time', value: new Date().toISOString() },
      { key: 'file_size', value: String(originalSize) }
    ];

    console.log('存储文件到 Metaobject:', { fileId, fileName, fileType, size: fileData.length });

    // 创建文件记录
    const createMutation = `
      mutation($fields: [MetaobjectFieldInput!]!) {
        metaobjectCreate(metaobject: {type: "${FILE_METAOBJECT_TYPE}", fields: $fields}) {
          metaobject { 
            id 
            handle 
            fields { key value } 
          }
          userErrors { field message }
        }
      }
    `;

    const result = await shopGql(createMutation, { fields });
    
    console.log('GraphQL 创建结果:', JSON.stringify(result, null, 2));
    
    if (result.errors) {
      console.error('GraphQL 错误:', result.errors);
      return res.status(500).json({ 
        error: 'GraphQL 错误', 
        details: result.errors 
      });
    }
    
    if (result.data.metaobjectCreate.userErrors.length > 0) {
      console.error('创建文件记录失败:', result.data.metaobjectCreate.userErrors);
      return res.status(400).json({ 
        error: '文件存储失败', 
        details: result.data.metaobjectCreate.userErrors 
      });
    }

    const fileRecord = result.data.metaobjectCreate.metaobject;
    const fileUrl = `https://shopify-13s4.vercel.app/api/download-file?id=${fileId}`;
    
    console.log('文件存储成功:', { fileId, metaobjectId: fileRecord.id });
    
    return res.status(200).json({
      success: true,
      fileId: fileId,
      fileName: fileName,
      fileUrl: fileUrl,
      metaobjectId: fileRecord.id,
      message: isTruncated ? '文件上传成功（已截断存储，仅用于演示）' : '文件上传成功'
    });

  } catch (error) {
    console.error('文件上传错误:', error);
    console.error('错误堆栈:', error.stack);
    return res.status(500).json({ 
      error: '文件上传失败', 
      details: error.message,
      stack: error.stack
    });
  }
}
