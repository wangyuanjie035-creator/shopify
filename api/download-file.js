import { setCorsHeaders } from './cors-config.js';

// Metaobject 文件类型
const FILE_METAOBJECT_TYPE = 'uploaded_file';

// 本地实现 Shopify GraphQL 调用
async function shopGql(query, variables) {
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOP;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.ADMIN_TOKEN;

  if (!storeDomain || !accessToken) {
    return { errors: [{ message: 'Missing SHOPIFY_STORE_DOMAIN or SHOPIFY_ACCESS_TOKEN' }] };
  }

  const endpoint = new URL(`/admin/api/2024-01/graphql.json`, `https://${storeDomain}`);

  const resp = await fetch(endpoint.href, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  return resp.json();
}

// Shopify 文件下载
async function handleShopifyFileDownload(res, shopifyFileId, fileName) {
  try {
    const query = `
      query($id: ID!) {
        file(id: $id) {
          ... on GenericFile {
            url
            originalFileSize
            contentType
          }
          ... on MediaImage {
            image { url }
          }
        }
      }
    `;

    const result = await shopGql(query, { id: shopifyFileId });

    if (!result?.data?.file) {
      return res.status(404).json({ error: '文件未找到' });
    }

    const file = result.data.file;
    let fileUrl = file.url || file.image?.url;

    if (!fileUrl) return res.status(404).json({ error: '文件URL不可用' });

    console.log('文件URL获取成功:', fileUrl);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName || 'download'}"`);
    res.writeHead(302, { Location: fileUrl });
    return res.end();

  } catch (error) {
    console.error('Shopify文件下载失败:', error);
    return res.status(500).json({ error: '文件下载失败', message: error.message });
  }
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { id, shopifyFileId, fileName } = req.query;

    if (shopifyFileId) return handleShopifyFileDownload(res, shopifyFileId, fileName);

    if (!id) return res.status(400).json({ error: 'Missing file ID' });

    // 查询 Metaobject
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

    const result = await shopGql(query, { type: FILE_METAOBJECT_TYPE, first: 100 });
    const nodes = result?.data?.metaobjects?.nodes || [];

    const fileRecord = nodes.find(node =>
      node.fields.some(f => f.key === 'file_id' && f.value === id)
    );

    if (!fileRecord) {
      if (id.startsWith('file_')) {
        return res.status(200).send(`<html><body>📁 文件在客户本地浏览器存储中，无法直接下载。文件ID: ${id}</body></html>`);
      }
      return res.status(404).send(`<html><body>文件不存在: ${id}</body></html>`);
    }

    const getField = (key) => fileRecord.fields.find(f => f.key === key)?.value || '';
    const fileData = getField('file_data');
    const fileType = getField('file_type') || 'application/octet-stream';
    const finalFileName = getField('file_name') || 'download.bin';
    const fileUrlCdn = getField('file_url');

    // Shopify CDN 文件直接重定向
    if (fileUrlCdn?.startsWith('http')) {
      res.writeHead(302, { Location: fileUrlCdn });
      return res.end();
    }

    if (!fileData) return res.status(500).send(`<html><body>⚠️ 文件数据缺失，文件ID: ${id}</body></html>`);

    const buffer = Buffer.from(fileData, 'base64');
    res.setHeader('Content-Type', fileType);
    res.setHeader('Content-Disposition', `attachment; filename="${finalFileName}"`);
    res.setHeader('Content-Length', buffer.length);
    return res.status(200).send(buffer);

  } catch (error) {
    console.error('文件下载错误:', error);
    return res.status(500).json({ error: '文件下载失败', details: error.message });
  }
}
