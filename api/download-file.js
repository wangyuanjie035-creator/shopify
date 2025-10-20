// Vercel 文件下载 API
// 用于下载已上传的文件
const FILE_METAOBJECT_TYPE = 'uploaded_file';

// 本地实现 shopGql，避免跨路由导入在 Vercel 中丢失
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

import { setCorsHeaders } from './cors-config.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id, draftOrderId, shopifyFileId, fileName: requestedFileName } = req.query;
    
    // 如果提供了draftOrderId，则获取多文件信息
    if (draftOrderId) {
      return await handleMultipleFilesDownload(req, res, draftOrderId);
    }
    
    // 如果提供了shopifyFileId，则通过Shopify Files下载
    if (shopifyFileId) {
      return await handleShopifyFileDownload(req, res, shopifyFileId, requestedFileName);
    }
    
    if (!id) {
      return res.status(400).json({ error: 'Missing file ID' });
    }

    // 查询存储在 Metaobject 中的文件记录
    const query = `
      query($type: String!, $first: Int!) {
        metaobjects(type: $type, first: $first) {
          nodes {
            id
            handle
            fields { key value }
          }
        }
      }
    `;

    let nodes = [];
    try {
      const result = await shopGql(query, { type: FILE_METAOBJECT_TYPE, first: 100 });
      if (result?.errors) {
        console.error('GraphQL errors:', result.errors);
      }
      nodes = result?.data?.metaobjects?.nodes || [];
    } catch (gqlErr) {
      console.error('GraphQL request failed:', gqlErr);
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>文件服务暂不可用</title><style>body{font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:40px auto;background:#f7f7f7} .card{background:#fff;padding:28px 32px;border-radius:10px;box-shadow:0 3px 16px rgba(0,0,0,.08)} h1{color:#e67e22;font-size:22px;margin:0 0 12px} p{color:#555;line-height:1.7;margin:8px 0} code{background:#f2f2f2;padding:4px 6px;border-radius:4px}</style></head><body><div class="card"><h1>⚠️ 文件服务暂不可用</h1><p>文件ID：<code>${id}</code></p><p>后台文件存储服务暂时不可用，请稍后重试，或联系客户重新提供文件。</p></div></body></html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(503).send(html);
    }
    const fileRecord = nodes.find(node => {
      const f = node.fields.find(x => x.key === 'file_id');
      return f && f.value === id;
    });

    if (!fileRecord) {
      // 特殊处理本地存储的文件ID（我们生成的file_开头的ID）
      if (id.startsWith('file_')) {
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>本地存储文件</title><style>body{font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:40px auto;background:#f7f7f7} .card{background:#fff;padding:28px 32px;border-radius:10px;box-shadow:0 3px 16px rgba(0,0,0,.08)} h1{color:#27ae60;font-size:22px;margin:0 0 12px} p{color:#555;line-height:1.7;margin:8px 0} code{background:#f2f2f2;padding:4px 6px;border-radius:4px} .info{background:#e8f5e8;padding:16px;border-radius:6px;border-left:4px solid #27ae60} .download-btn{background:#27ae60;color:white;border:none;padding:12px 24px;border-radius:6px;cursor:pointer;font-size:16px;margin:10px 5px} .download-btn:hover{background:#219a52}</style></head><body><div class="card"><h1>📁 本地存储文件</h1><p>文件ID：<code>${id}</code></p><div class="info"><p><strong>说明：</strong>此文件存储在客户浏览器的本地存储中。</p><p><strong>下载方式：</strong>请在客户浏览器中访问此文件ID进行下载。</p><p><strong>注意：</strong>文件仅在客户浏览器中可用，无法通过API直接下载。</p></div><button class="download-btn" onclick="window.close()">关闭</button></body></html>`;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(200).send(html);
      }
      
      // 特殊处理 placeholder 文件ID
      if (id === 'placeholder') {
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>文件上传失败</title><style>body{font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:40px auto;background:#f7f7f7} .card{background:#fff;padding:28px 32px;border-radius:10px;box-shadow:0 3px 16px rgba(0,0,0,.08)} h1{color:#e67e22;font-size:22px;margin:0 0 12px} p{color:#555;line-height:1.7;margin:8px 0} code{background:#f2f2f2;padding:4px 6px;border-radius:4px}</style></head><body><div class="card"><h1>⚠️ 文件上传失败</h1><p>文件ID：<code>${id}</code></p><p>此文件在上传过程中失败，无法下载。请联系客户重新上传文件。</p></div></body></html>`;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(404).send(html);
      }
      
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>文件不存在</title></head><body>文件不存在：${id}</body></html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(404).send(html);
    }

    const getField = (key) => {
      const f = fileRecord.fields.find(x => x.key === key);
      return f ? f.value : '';
    };

    const fileName = getField('file_name') || 'download.bin';
    const fileType = getField('file_type') || 'application/octet-stream';
    const fileData = getField('file_data');
    const fileUrlCdn = getField('file_url');
    
    console.log('文件记录:', { id, fileName, fileType, fileUrlCdn, hasFileData: !!fileData });

    // 如果有 Shopify Files 的 URL，则直接重定向
    if (fileUrlCdn && (fileUrlCdn.startsWith('http://') || fileUrlCdn.startsWith('https://'))) {
      console.log('重定向到 Shopify CDN:', fileUrlCdn);
      res.writeHead(302, { Location: fileUrlCdn });
      return res.end();
    }

    if (!fileData) {
      console.log('文件数据缺失，file_url:', fileUrlCdn);
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>文件数据缺失</title><style>body{font-family:Arial,sans-serif;max-width:680px;margin:40px auto;background:#f7f7f7;padding:20px}.card{background:#fff;padding:28px 32px;border-radius:10px;box-shadow:0 3px 16px rgba(0,0,0,.08)}h1{color:#e67e22;font-size:22px;margin:0 0 12px}p{color:#555;line-height:1.7;margin:8px 0}code{background:#f2f2f2;padding:4px 6px;border-radius:4px}</style></head><body><div class="card"><h1>⚠️ 文件数据缺失</h1><p>文件ID：<code>${id}</code></p><p>文件名：<code>${fileName}</code></p><p>此文件的数据未能正确存储。可能的原因：</p><ul><li>文件上传过程中断</li><li>文件过大被截断</li><li>Shopify Files API 存储失败</li></ul><p>建议：请联系客户重新上传文件。</p></div></body></html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(500).send(html);
    }

    const buffer = Buffer.from(fileData, 'base64');
    res.setHeader('Content-Type', fileType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', buffer.length);
    return res.status(200).send(buffer);

  } catch (error) {
    console.error('文件下载错误:', error);
    return res.status(500).json({ 
      error: '文件下载失败', 
      details: error.message 
    });
  }
}

// 处理多文件下载
async function handleMultipleFilesDownload(req, res, draftOrderId) {
  try {
    console.log('开始获取订单文件信息:', draftOrderId);

    // 查询草稿订单信息
    const getDraftOrderQuery = `
      query($id: ID!) {
        draftOrder(id: $id) {
          id
          name
          email
          lineItems(first: 10) {
            edges {
              node {
                id
                title
                customAttributes {
                  key
                  value
                }
              }
            }
          }
        }
      }
    `;
    
    const draftOrderResult = await shopGql(getDraftOrderQuery, {
      id: draftOrderId
    });
    
    if (!draftOrderResult.data.draftOrder) {
      return res.status(404).json({ error: '未找到草稿订单' });
    }
    
    const draftOrder = draftOrderResult.data.draftOrder;
    const lineItem = draftOrder.lineItems.edges[0]?.node;
    
    if (!lineItem) {
      return res.status(404).json({ error: '未找到订单项目' });
    }

    // 解析文件信息
    const customAttributes = lineItem.customAttributes;
    const files = [];
    
    // 获取文件数量
    const fileCountAttr = customAttributes.find(attr => attr.key === '上传文件数量');
    const fileCount = fileCountAttr ? parseInt(fileCountAttr.value) : 1;
    
    console.log('订单文件数量:', fileCount);
    
    // 解析每个文件的信息
    for (let i = 1; i <= fileCount; i++) {
      const fileNameAttr = customAttributes.find(attr => attr.key === `文件${i}_名称`);
      const shopifyFileIdAttr = customAttributes.find(attr => attr.key === `文件${i}_ShopifyID`);
      const cdnUrlAttr = customAttributes.find(attr => attr.key === `文件${i}_CDN链接`);
      
      if (fileNameAttr) {
        let downloadUrl = null;
        
        // Choose file download URL based on storage method
        if (cdnUrlAttr && cdnUrlAttr.value && cdnUrlAttr.value !== '未上传') {
          // Use CDN URL if available
          downloadUrl = cdnUrlAttr.value;
        } else if (shopifyFileIdAttr && shopifyFileIdAttr.value && shopifyFileIdAttr.value !== '未上传') {
          // Use Shopify File ID
          downloadUrl = `${req.headers.origin || 'https://shopify-13s4.vercel.app'}/api/download-file?shopifyFileId=${encodeURIComponent(shopifyFileIdAttr.value)}&fileName=${encodeURIComponent(fileNameAttr.value)}`;
        } else {
          // For files without Shopify File ID, show error instead of creating loop
          downloadUrl = null;
          console.warn(`文件 ${fileNameAttr.value} 没有有效的下载链接`);
        }
        
        const fileInfo = {
          index: i,
          name: fileNameAttr.value,
          shopifyFileId: shopifyFileIdAttr?.value || null,
          cdnUrl: cdnUrlAttr?.value || null,
          downloadUrl: downloadUrl
        };
        
        files.push(fileInfo);
        console.log(`文件${i}:`, fileInfo);
      }
    }
    
    // 如果没有找到多文件信息，尝试获取单文件信息（兼容旧版本）
    if (files.length === 0) {
      const fileNameAttr = customAttributes.find(attr => attr.key === '文件');
      const shopifyFileIdAttr = customAttributes.find(attr => attr.key === 'Shopify文件ID');
      const mainFileShopifyIdAttr = customAttributes.find(attr => attr.key === '主文件ShopifyID');
      
      if (fileNameAttr) {
        let downloadUrl = null;
        
        // 优先使用主文件ShopifyID，然后是Shopify文件ID
        const shopifyFileId = mainFileShopifyIdAttr?.value || shopifyFileIdAttr?.value;
        
        if (shopifyFileId && shopifyFileId !== '未上传') {
          downloadUrl = `${req.headers.origin || 'https://shopify-13s4.vercel.app'}/api/download-file?shopifyFileId=${encodeURIComponent(shopifyFileId)}&fileName=${encodeURIComponent(fileNameAttr.value)}`;
        } else {
          // For files without Shopify File ID, show error instead of creating loop
          downloadUrl = null;
          console.warn(`单文件 ${fileNameAttr.value} 没有有效的下载链接`);
        }
        
        const fileInfo = {
          index: 1,
          name: fileNameAttr.value,
          shopifyFileId: shopifyFileId,
          downloadUrl: downloadUrl
        };
        
        files.push(fileInfo);
        console.log('单文件信息:', fileInfo);
      }
    }

    // 返回结果
    return res.json({
      success: true,
      draftOrderId: draftOrder.id,
      draftOrderName: draftOrder.name,
      customerEmail: draftOrder.email,
      fileCount: files.length,
      files: files,
      message: `找到 ${files.length} 个文件`
    });
    
  } catch (error) {
    console.error('获取文件信息失败:', error);
    return res.status(500).json({
      error: '获取文件信息失败',
      message: error.message
    });
  }
}

// 处理Shopify文件下载
async function handleShopifyFileDownload(req, res, shopifyFileId, fileName) {
  try {
    console.log('开始下载Shopify文件:', { shopifyFileId, fileName });

    // 构建GraphQL查询来获取文件URL
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

    if (!result.data.file) {
      return res.status(404).json({ error: '文件未找到' });
    }

    const file = result.data.file;
    let fileUrl = null;

    // 获取文件URL
    if (file.url) {
      fileUrl = file.url;
    } else if (file.image && file.image.url) {
      fileUrl = file.image.url;
    }

    if (!fileUrl) {
      return res.status(404).json({ error: '文件URL不可用' });
    }

    console.log('文件URL获取成功:', fileUrl);

    // 设置下载头并重定向到文件URL
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
