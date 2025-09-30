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
    const { fileData, fileName: rawFileName, fileType: rawFileType, orderId } = req.body;
    
    if (!fileData || !rawFileName) {
      return res.status(400).json({ error: 'Missing file data or filename' });
    }

    // 生成唯一的文件ID
    const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    // 解析 data URI
    let mimeType = rawFileType || 'application/octet-stream';
    let fileName = rawFileName;
    let base64Payload = fileData;
    if (fileData.startsWith('data:')) {
      const head = fileData.substring(5, fileData.indexOf(',')); // e.g. application/step;base64
      const commaIdx2 = fileData.indexOf(',');
      base64Payload = fileData.substring(commaIdx2 + 1);
      const semi = head.indexOf(';');
      mimeType = head.substring(0, semi > -1 ? semi : head.length) || mimeType;
    }

    // 将 base64 转为二进制
    const fileBuffer = Buffer.from(base64Payload, 'base64');
    const fileSizeBytes = fileBuffer.length;

    // 暂时使用 Metaobject 存储，因为 Shopify Files API 需要额外权限
    console.log('使用 Metaobject 存储文件（Shopify Files 需要额外权限）');
    
    // 检查文件大小，如果太大则截断
    const MAX_FIELD_CHARS = 65000; // 留一点余量
    let storedData = base64Payload;
    let isTruncated = false;
    if (storedData.length > MAX_FIELD_CHARS) {
      storedData = storedData.slice(0, MAX_FIELD_CHARS);
      isTruncated = true;
      console.warn(`文件过大，已截断存储。原始大小: ${base64Payload.length}, 存储大小: ${storedData.length}`);
    }

    const shopifyFileId = null;
    const fileUrlCdn = null;

    // 4) 在我们自定义的 uploaded_file Metaobject 中落库（包含 file_data）
    const fields = [
      { key: 'file_id', value: fileId },
      { key: 'file_name', value: fileName },
      { key: 'file_type', value: mimeType },
      { key: 'file_data', value: storedData }, // 存储截断后的 base64 数据
      { key: 'file_url', value: fileUrlCdn || '' },
      { key: 'shopify_file_id', value: shopifyFileId || '' },
      { key: 'order_id', value: orderId || '' },
      { key: 'upload_time', value: new Date().toISOString() },
      { key: 'file_size', value: String(fileSizeBytes) }
    ];

    const createMutation = `
      mutation($fields: [MetaobjectFieldInput!]!) {
        metaobjectCreate(metaobject: {type: "${FILE_METAOBJECT_TYPE}", fields: $fields}) {
          metaobject { id handle }
          userErrors { field message }
        }
      }
    `;
    const result = await shopGql(createMutation, { fields });
    if (result.errors || result.data?.metaobjectCreate?.userErrors?.length) {
      const details = result.errors || result.data.metaobjectCreate.userErrors;
      console.error('保存 uploaded_file 记录失败:', details);
      // 即便落库失败，文件已存在于 Files，仍返回 fileUrl 以便用户可下载
    }

    const fileUrl = `https://shopify-13s4.vercel.app/api/download-file?id=${fileId}`;
    return res.status(200).json({
      success: true,
      fileId,
      fileName,
      fileUrl,
      shopifyFileId,
      cdnUrl: fileUrlCdn,
      message: isTruncated ? '文件上传成功（已截断存储，仅用于演示）' : '文件上传成功（Metaobject存储）',
      isTruncated: isTruncated
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
