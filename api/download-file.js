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

    // 临时测试：返回简单响应
    console.log('文件下载请求:', { id });
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>文件下载测试 - ${id}</title>
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
          .title { color: #27ae60; margin-bottom: 20px; }
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
          <h1 class="title">✅ 文件下载API正常</h1>
          <div class="info">
            <p><strong>文件ID:</strong></p>
            <div class="file-id">${id}</div>
            <p>文件下载API已成功部署并运行正常。</p>
            <p>下一步将恢复完整的文件存储和下载功能。</p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);

  } catch (error) {
    console.error('文件下载错误:', error);
    return res.status(500).json({ 
      error: '文件下载失败', 
      details: error.message 
    });
  }
}
