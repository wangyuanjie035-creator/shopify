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
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ error: 'Missing file ID' });
    }

    // 查询存储在 Metaobject 中的文件记录（支持分页）
    const query = `
      query($type: String!, $first: Int!, $after: String) {
        metaobjects(type: $type, first: $first, after: $after) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            handle
            fields { key value }
          }
        }
      }
    `;

    let nodes = [];
    let fileRecord = null;
    let hasNextPage = true;
    let cursor = null;

    try {
      // 分页查询所有Metaobject记录，直到找到目标文件
      while (hasNextPage && !fileRecord) {
        const result = await shopGql(query, { 
          type: FILE_METAOBJECT_TYPE, 
          first: 250, // 每次查询250条记录
          after: cursor 
        });
        
        if (result?.errors) {
          console.error('GraphQL errors:', result.errors);
          break;
        }

        const metaobjects = result?.data?.metaobjects || {};
        const batchNodes = metaobjects.nodes || [];
        nodes = nodes.concat(batchNodes);

        // 在当前批次中查找文件记录
        fileRecord = batchNodes.find(node => {
          const f = node.fields.find(x => x.key === 'file_id');
          return f && f.value === id;
        });

        // 检查是否有下一页
        hasNextPage = metaobjects.pageInfo?.hasNextPage || false;
        cursor = metaobjects.pageInfo?.endCursor || null;

        // 如果已找到文件记录，提前退出
        if (fileRecord) {
          console.log(`✅ 找到文件记录，共查询了 ${nodes.length} 条记录`);
          break;
        }
      }

      if (!fileRecord) {
        console.log(`⚠️ 未找到文件记录，共查询了 ${nodes.length} 条记录`);
      }
    } catch (gqlErr) {
      console.error('GraphQL request failed:', gqlErr);
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>文件服务暂不可用</title><style>body{font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:40px auto;background:#f7f7f7} .card{background:#fff;padding:28px 32px;border-radius:10px;box-shadow:0 3px 16px rgba(0,0,0,.08)} h1{color:#e67e22;font-size:22px;margin:0 0 12px} p{color:#555;line-height:1.7;margin:8px 0} code{background:#f2f2f2;padding:4px 6px;border-radius:4px}</style></head><body><div class="card"><h1>⚠️ 文件服务暂不可用</h1><p>文件ID：<code>${id}</code></p><p>后台文件存储服务暂时不可用，请稍后重试，或联系客户重新提供文件。</p></div></body></html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(503).send(html);
    }

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
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>文件数据缺失</title><style>body{font-family:Arial,sans-serif;max-width:680px;margin:40px auto;background:#f7f7f7;padding:20px}.card{background:#fff;padding:28px 32px;border-radius:10px;box-shadow:0 3px 16px rgba(0,0,0,.08)}h1{color:#e67e22;font-size:22px;margin:0 0 12px}p{color:#555;line-height:1.7;margin:8px 0}code{background:#f2f2f2;padding:4px 6px;border-radius:4px}</style></head><body><div class="card"><h1>⚠️ 文件数据缺失</h1><p>文件ID：<code>${id}</code></p><p>文件名：<code>${fileName}</code></p><p>此文件的数据未能正确存储。可能的原因：</p><ul><li>文件上传过程中断</li><li>文件过大被截断</li><li>Shopify Files API 存储失败且Base64存储也失败</li></ul><p>建议：请联系客户重新上传文件。</p></div></body></html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(500).send(html);
    }

    try {
      // 处理Base64数据：可能包含data: URI前缀，也可能没有
      let base64Data = fileData;
      if (fileData.includes(',')) {
        // 如果有逗号，可能是data: URI格式，提取Base64部分
        const parts = fileData.split(',');
        if (parts.length > 1) {
          base64Data = parts[1];
        }
      }

      const buffer = Buffer.from(base64Data, 'base64');
      console.log('✅ 成功解码Base64数据，文件大小:', buffer.length, '字节');
      
      res.setHeader('Content-Type', fileType);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
      res.setHeader('Content-Length', buffer.length);
      return res.status(200).send(buffer);
    } catch (decodeError) {
      console.error('❌ Base64解码失败:', decodeError);
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>文件解码失败</title><style>body{font-family:Arial,sans-serif;max-width:680px;margin:40px auto;background:#f7f7f7;padding:20px}.card{background:#fff;padding:28px 32px;border-radius:10px;box-shadow:0 3px 16px rgba(0,0,0,.08)}h1{color:#e67e22;font-size:22px;margin:0 0 12px}p{color:#555;line-height:1.7;margin:8px 0}code{background:#f2f2f2;padding:4px 6px;border-radius:4px}</style></head><body><div class="card"><h1>⚠️ 文件解码失败</h1><p>文件ID：<code>${id}</code></p><p>文件名：<code>${fileName}</code></p><p>文件数据已损坏，无法解码。请联系客户重新上传文件。</p></div></body></html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(500).send(html);
    }

  } catch (error) {
    console.error('文件下载错误:', error);
    return res.status(500).json({ 
      error: '文件下载失败', 
      details: error.message 
    });
  }
}
