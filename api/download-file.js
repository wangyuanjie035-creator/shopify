// Vercel 文件下载 API
// 用于下载已上传的文件

import { shopGql } from './quotes-restored.js';

// 文件存储的 Metaobject 类型
const FILE_METAOBJECT_TYPE = 'uploaded_file';

export default async function handler(req, res) {
  // 设置 CORS 头
  res.setHeader('Access-Control-Allow-Origin', 'https://sain-pdc-test.myshopify.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
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

    // 从 Metaobject 中查找文件
    const query = `
      query($type: String!, $first: Int!) {
        metaobjects(type: $type, first: $first) {
          nodes {
            id
            handle
            fields {
              key
              value
            }
          }
        }
      }
    `;

    const result = await shopGql(query, { 
      type: FILE_METAOBJECT_TYPE, 
      first: 100 
    });

    // 查找匹配的文件
    const fileRecord = result.data.metaobjects.nodes.find(node => {
      const fileIdField = node.fields.find(f => f.key === 'file_id');
      return fileIdField && fileIdField.value === id;
    });

    if (!fileRecord) {
      // 文件不存在，返回错误页面
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>文件不存在 - ${id}</title>
          <meta charset="utf-8">
          <style>
            body { 
              font-family: Arial, sans-serif; 
              max-width: 600px; 
              margin: 50px auto; 
              padding: 20px;
              background-color: #f5f5f5;
            }
            .container {
              background: white;
              padding: 30px;
              border-radius: 8px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .title { color: #e74c3c; margin-bottom: 20px; }
            .info { color: #666; line-height: 1.6; }
            .file-id { 
              background: #f5f5f5; 
              padding: 10px; 
              border-radius: 3px; 
              font-family: monospace;
              margin: 10px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1 class="title">❌ 文件不存在</h1>
            <div class="info">
              <p><strong>文件ID:</strong></p>
              <div class="file-id">${id}</div>
              <p>抱歉，找不到指定的文件。文件可能已被删除或从未上传。</p>
            </div>
          </div>
        </body>
        </html>
      `;
      
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(404).send(html);
    }

    // 提取文件信息
    const getField = (key) => {
      const field = fileRecord.fields.find(f => f.key === key);
      return field ? field.value : '';
    };

    const fileName = getField('file_name');
    const fileType = getField('file_type');
    const fileData = getField('file_data');
    const uploadTime = getField('upload_time');
    const fileSize = getField('file_size');

    if (!fileData) {
      // 文件数据不存在
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>文件数据损坏 - ${fileName}</title>
          <meta charset="utf-8">
          <style>
            body { 
              font-family: Arial, sans-serif; 
              max-width: 600px; 
              margin: 50px auto; 
              padding: 20px;
              background-color: #f5f5f5;
            }
            .container {
              background: white;
              padding: 30px;
              border-radius: 8px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .title { color: #f39c12; margin-bottom: 20px; }
            .info { color: #666; line-height: 1.6; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1 class="title">⚠️ 文件数据损坏</h1>
            <div class="info">
              <p><strong>文件名:</strong> ${fileName}</p>
              <p><strong>文件ID:</strong> ${id}</p>
              <p>文件数据已损坏或丢失，无法下载。</p>
            </div>
          </div>
        </body>
        </html>
      `;
      
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(500).send(html);
    }

    // 返回文件下载
    console.log('开始下载文件:', { fileName, fileType, size: fileData.length });
    
    // 设置下载头
    res.setHeader('Content-Type', fileType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', fileData.length);
    
    // 将 base64 数据转换为二进制并返回
    const binaryData = Buffer.from(fileData, 'base64');
    return res.status(200).send(binaryData);

  } catch (error) {
    console.error('文件下载错误:', error);
    return res.status(500).json({ 
      error: '文件下载失败', 
      details: error.message 
    });
  }
}
