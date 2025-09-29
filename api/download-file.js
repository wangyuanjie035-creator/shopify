// Vercel 文件下载 API
// 用于下载已上传的文件

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

    // 在 Vercel 的无服务器环境中，我们无法持久化存储文件
    // 这里我们返回一个说明页面
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>文件下载 - ${id}</title>
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
          .title { color: #333; margin-bottom: 20px; }
          .info { color: #666; line-height: 1.6; }
          .solution { 
            background: #f0f8ff; 
            padding: 15px; 
            border-radius: 5px; 
            margin: 20px 0;
            border-left: 4px solid #007cba;
          }
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
          <h1 class="title">📁 文件下载</h1>
          <div class="info">
            <p><strong>文件ID:</strong></p>
            <div class="file-id">${id}</div>
            
            <p>由于技术限制，文件无法直接从此链接下载。</p>
            
            <div class="solution">
              <h3>💡 解决方案：</h3>
              <ol>
                <li><strong>联系客户</strong> - 请客户重新上传文件</li>
                <li><strong>邮件发送</strong> - 请客户通过邮件发送文件给您</li>
                <li><strong>购物车下载</strong> - 指导客户在购物车页面下载文件后发送给您</li>
              </ol>
            </div>
            
            <p><strong>说明：</strong> 这是 Shopify 3D 打印询价系统的文件管理页面。文件数据存储在客户的购物车中，客服无法直接访问。</p>
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
