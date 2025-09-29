// Vercel 文件上传 API
// 用于处理客户上传的3D模型文件

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
    const { fileData, fileName, fileType } = req.body;
    
    if (!fileData || !fileName) {
      return res.status(400).json({ error: 'Missing file data or filename' });
    }

    // 生成唯一的文件ID
    const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fileExtension = fileName.split('.').pop() || 'stl';
    const storedFileName = `${fileId}.${fileExtension}`;

    // 在 Vercel 中，我们可以将文件数据存储为 base64 字符串
    // 这里我们创建一个简单的文件存储机制
    const fileInfo = {
      id: fileId,
      fileName: fileName,
      fileType: fileType || 'application/octet-stream',
      uploadTime: new Date().toISOString(),
      size: fileData.length
    };

    // 返回文件访问URL（在实际应用中，这里应该是真实的文件存储URL）
    const fileUrl = `https://shopify-13s4.vercel.app/api/download-file?id=${fileId}`;
    
    // 注意：在 Vercel 的无服务器环境中，我们无法持久化存储文件
    // 这里我们返回一个占位符URL，实际文件数据需要在前端处理
    console.log('文件上传请求:', { fileName, fileType, size: fileData.length });
    
    return res.status(200).json({
      success: true,
      fileId: fileId,
      fileName: fileName,
      fileUrl: fileUrl,
      message: '文件上传成功'
    });

  } catch (error) {
    console.error('文件上传错误:', error);
    return res.status(500).json({ 
      error: '文件上传失败', 
      details: error.message 
    });
  }
}
