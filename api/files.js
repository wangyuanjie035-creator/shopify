import { setCorsHeaders } from './cors-config.js';

const FILE_METAOBJECT_TYPE = 'uploaded_file';

// Helper for Shopify GraphQL API
async function shopGql(query, variables) {
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOP;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.ADMIN_TOKEN;

  if (!storeDomain || !accessToken) {
    return { errors: [{ message: 'Missing SHOPIFY_STORE_DOMAIN or SHOPIFY_ACCESS_TOKEN' }] };
  }

  const endpoint = `https://${storeDomain}/admin/api/2024-01/graphql.json`;
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

// Handle Shopify File Download
async function handleShopifyFileDownload(req, res, shopifyFileId, fileName) {
  try {
    console.log('开始下载Shopify文件:', { shopifyFileId, fileName });

    const query = `
      query($id: ID!) {
        file(id: $id) {
          ... on GenericFile {
            url
            originalFileSize
            contentType
          }
          ... on MediaImage {
            image {
              url
            }
          }
        }
      }
    `;

    const result = await shopGql(query, { id: shopifyFileId });

    if (!result.data || !result.data.file) {
      return res.status(404).json({ error: '文件未找到' });
    }

    const file = result.data.file;
    let fileUrl = null;

    if (file.url) {
      fileUrl = file.url;
    } else if (file.image && file.image.url) {
      fileUrl = file.image.url;
    }

    if (!fileUrl) {
      return res.status(404).json({ error: '文件URL不可用' });
    }

    console.log('文件URL获取成功:', fileUrl);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName || 'download'}"`);
    return res.redirect(302, fileUrl);

  } catch (error) {
    console.error('Shopify文件下载失败:', error);
    return res.status(500).json({
      error: '文件下载失败',
      message: error.message
    });
  }
}

// Handle File Upload (Store to Shopify Files)
async function handleFileUpload(req, res) {
  try {
    const { fileData, fileName, fileType } = req.body;

    if (!fileData || !fileName) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数：fileData 和 fileName'
      });
    }

    const base64Data = fileData.includes(',') ? fileData.split(',')[1] : fileData;
    const fileBuffer = Buffer.from(base64Data, 'base64');
    const fileSize = fileBuffer.length;

    console.log(`📁 开始上传文件: ${fileName}, 大小: ${fileSize} 字节`);

    const storeDomain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOP;
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.ADMIN_TOKEN;

    if (!storeDomain || !accessToken) {
      return res.status(500).json({
        success: false,
        message: '环境变量未配置'
      });
    }

    // 1. Create Staged Upload
    const stagedUploadMutation = `
      mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters {
              name
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

    const stagedUploadResult = await shopGql(stagedUploadMutation, {
      input: [{
        filename: fileName,
        mimeType: fileType || 'application/octet-stream',
        resource: 'FILE'
      }]
    });

    if (stagedUploadResult.errors || stagedUploadResult.data.stagedUploadsCreate.userErrors.length > 0) {
      throw new Error('Staged Upload创建失败');
    }

    const stagedTarget = stagedUploadResult.data.stagedUploadsCreate.stagedTargets[0];

    // 2. Upload to temporary URL
    const formData = new FormData();
    stagedTarget.parameters.forEach(param => {
      formData.append(param.name, param.value);
    });
    const blob = new Blob([fileBuffer], { type: fileType || 'application/octet-stream' });
    formData.append('file', blob, fileName);

    const uploadResponse = await fetch(stagedTarget.url, {
      method: 'POST',
      body: formData
    });

    if (!uploadResponse.ok) {
      throw new Error(`文件上传失败: ${uploadResponse.status}`);
    }

    // 3. Create File Record
    const fileCreateMutation = `
      mutation fileCreate($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files {
            id
            url
            originalFileSize
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const fileCreateResult = await shopGql(fileCreateMutation, {
      files: [{
        originalSource: stagedTarget.resourceUrl,
        contentType: fileType || 'application/octet-stream',
        alt: fileName
      }]
    });

    if (fileCreateResult.errors || fileCreateResult.data.fileCreate.userErrors.length > 0) {
      throw new Error('文件记录创建失败');
    }

    const fileRecord = fileCreateResult.data.fileCreate.files[0];
    const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return res.status(200).json({
      success: true,
      message: '文件上传成功',
      fileId: fileId,
      fileName: fileName,
      fileUrl: fileRecord.url,
      shopifyFileId: fileRecord.id,
      originalFileSize: fileRecord.originalFileSize,
      uploadedFileSize: fileSize,
      sizeMatch: fileRecord.originalFileSize === fileSize,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('上传失败:', error);
    return res.status(500).json({
      success: false,
      message: '文件存储失败',
      error: error.message
    });
  }
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // GET: Download
  if (req.method === 'GET') {
    const { id, shopifyFileId, fileName } = req.query;
    if (shopifyFileId) {
      return await handleShopifyFileDownload(req, res, shopifyFileId, fileName);
    }
    
    // Legacy support for metaobject based download if needed
    if (id) {
       // ... (Simplified logic or return not found if metaobject storage is deprecated)
       // Keeping simple for now based on "consolidation"
       if (id.startsWith('file_')) {
          // It's a local ID, but without data we can't download.
          // Unless we fetch from metaobject. The original code had complex metaobject logic.
          // Since we are moving to real Shopify Files, maybe we just error or try to find it.
          // For now, let's keep the metaobject query logic if we want to be safe, 
          // or assume we are moving away from it.
          // Let's include the metaobject query logic from download-file.js just in case.
       }
    }
    
    // Fallback to original download-file.js logic for metaobjects
    const query = `
      query($type: String!, $first: Int!) {
        metaobjects(type: $type, first: $first) {
          nodes {
            id
            fields { key value }
          }
        }
      }
    `;
    
    try {
        if (!id) return res.status(400).json({ error: 'Missing file ID' });
        
        const result = await shopGql(query, { type: FILE_METAOBJECT_TYPE, first: 100 });
        const nodes = result?.data?.metaobjects?.nodes || [];
        const fileRecord = nodes.find(node => {
            const f = node.fields.find(x => x.key === 'file_id');
            return f && f.value === id;
        });
        
        if (fileRecord) {
             const getField = (key) => fileRecord.fields.find(x => x.key === key)?.value;
             const fileUrlCdn = getField('file_url');
             if (fileUrlCdn) {
                 res.writeHead(302, { Location: fileUrlCdn });
                 return res.end();
             }
        }
    } catch(e) {}

    return res.status(404).send('File not found');
  }

  // POST: Upload
  if (req.method === 'POST') {
    return await handleFileUpload(req, res);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

