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

    // 临时方案：显示说明页面
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>文件下载说明 - ${id}</title>
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
          .title { color: #3498db; margin-bottom: 20px; }
          .info { color: #666; line-height: 1.6; }
          .file-id { 
            background: #f5f5f5; 
            padding: 10px; 
            border-radius: 3px; 
            font-family: monospace;
            margin: 10px 0;
          }
          .solution {
            background: #e8f5e8;
            padding: 15px;
            border-radius: 5px;
            margin: 15px 0;
            border-left: 4px solid #27ae60;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1 class="title">📁 文件下载说明</h1>
          <div class="info">
            <p><strong>文件ID:</strong></p>
            <div class="file-id">${id}</div>
            
            <div class="solution">
              <h3>🔧 当前状态</h3>
              <p>文件存储系统正在升级中，暂时无法直接下载文件。</p>
              
              <h3>💡 解决方案</h3>
              <ol>
                <li><strong>联系客户重新上传文件</strong> - 这是最直接的方法</li>
                <li><strong>请客户通过邮件发送文件</strong> - 客户可以将文件作为附件发送</li>
                <li><strong>指导客户在购物车页面下载</strong> - 客户可以在购物车页面下载文件后发送给您</li>
              </ol>
              
              <h3>📋 操作步骤</h3>
              <p>1. 联系客户，说明需要重新获取文件</p>
              <p>2. 请客户重新上传文件或通过邮件发送</p>
              <p>3. 收到文件后，可以继续处理报价</p>
            </div>
            
            <p><em>注：此问题将在系统升级完成后自动解决。</em></p>
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
