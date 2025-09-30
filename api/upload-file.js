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

    console.log(`开始上传文件到 Shopify Files: ${fileName}, 大小: ${fileSizeBytes} 字节`);

    // 1) 申请 staged upload 目标
    const stagedMutation = `
      mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters { name value }
          }
          userErrors { field message }
        }
      }
    `;
    const stagedVars = {
      input: [
        {
          resource: 'FILE',
          filename: fileName,
          mimeType: mimeType,
          httpMethod: 'POST'
        }
      ]
    };
    const staged = await shopGql(stagedMutation, stagedVars);
    if (staged.errors || staged.data?.stagedUploadsCreate?.userErrors?.length) {
      const details = staged.errors || staged.data.stagedUploadsCreate.userErrors;
      console.error('stagedUploadsCreate 错误:', details);
      return res.status(500).json({ error: 'stagedUploadsCreate failed', details });
    }
    const target = staged.data.stagedUploadsCreate.stagedTargets[0];
    console.log('获取到 staged upload 目标:', target.url);

    // 2) 将文件 POST 到 target.url（multipart/form-data）
    // 在 Vercel/Node.js 18+ 环境中使用 form-data 包
    const FormDataNode = (await import('form-data')).default;
    const form = new FormDataNode();
    for (const p of target.parameters) {
      form.append(p.name, p.value);
    }
    form.append('file', fileBuffer, { filename: fileName, contentType: mimeType });
    
    const uploadResp = await fetch(target.url, { 
      method: 'POST', 
      body: form,
      headers: form.getHeaders()
    });
    
    if (!uploadResp.ok) {
      const text = await uploadResp.text();
      console.error('直传文件失败:', uploadResp.status, text);
      return res.status(502).json({ error: 'Upload to staged target failed', status: uploadResp.status, body: text });
    }
    console.log('文件直传成功');

    // 3) 在 Shopify Files 中创建文件记录
    const fileCreateMutation = `
      mutation fileCreate($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files { 
            id 
            url
            alt
          }
          userErrors { field message }
        }
      }
    `;
    const fileCreateVars = {
      files: [
        {
          originalSource: target.resourceUrl,
          filename: fileName,
          contentType: mimeType
        }
      ]
    };
    const fileCreateRes = await shopGql(fileCreateMutation, fileCreateVars);
    if (fileCreateRes.errors || fileCreateRes.data?.fileCreate?.userErrors?.length) {
      const details = fileCreateRes.errors || fileCreateRes.data.fileCreate.userErrors;
      console.error('fileCreate 错误:', details);
      return res.status(500).json({ error: 'fileCreate failed', details });
    }
    const created = fileCreateRes.data.fileCreate.files[0];
    const shopifyFileId = created.id;
    const fileUrlCdn = created.url;
    console.log('Shopify Files 记录创建成功:', { shopifyFileId, fileUrlCdn });

    // 4) 在我们自定义的 uploaded_file Metaobject 中落库（只存储元数据，不存储文件内容）
    const fields = [
      { key: 'file_id', value: fileId },
      { key: 'file_name', value: fileName },
      { key: 'file_type', value: mimeType },
      { key: 'file_data', value: '' }, // 不再存储文件内容，文件在 Shopify Files 中
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
    
    console.log('Metaobject创建结果:', JSON.stringify(result, null, 2));
    
    if (result.errors) {
      console.error('GraphQL 错误:', result.errors);
      return res.status(500).json({ 
        error: 'GraphQL 错误', 
        details: result.errors 
      });
    }
    
    if (result.data?.metaobjectCreate?.userErrors?.length > 0) {
      console.error('保存 uploaded_file 记录失败:', result.data.metaobjectCreate.userErrors);
      return res.status(400).json({ 
        error: '文件存储失败', 
        details: result.data.metaobjectCreate.userErrors 
      });
    }
    
    const fileRecord = result.data?.metaobjectCreate?.metaobject;
    if (!fileRecord) {
      console.error('未能创建 Metaobject 记录');
      return res.status(500).json({ 
        error: '文件存储失败', 
        details: '未能创建文件记录' 
      });
    }
    
    console.log('文件存储成功:', { fileId, metaobjectId: fileRecord.id });

    const fileUrl = `https://shopify-13s4.vercel.app/api/download-file?id=${fileId}`;
    return res.status(200).json({
      success: true,
      fileId,
      fileName,
      fileUrl,
      shopifyFileId,
      cdnUrl: fileUrlCdn,
      fileSize: fileSizeBytes,
      message: '文件上传成功（Shopify Files 完整存储）'
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
