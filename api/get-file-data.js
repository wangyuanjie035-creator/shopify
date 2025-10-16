export default async function handler(req, res) {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', 'https://sain-pdc-test.myshopify.com');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    const { fileId } = req.query;

    if (!fileId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameter: fileId'
      });
    }

    // 从内存存储获取文件数据
    if (!global.fileStorage) {
      global.fileStorage = new Map();
    }

    const fileData = global.fileStorage.get(fileId);

    if (!fileData) {
      return res.status(404).json({
        success: false,
        message: '文件数据未找到',
        fileId
      });
    }

    console.log('✅ 文件数据获取成功:', { fileId, fileName: fileData.fileName });

    return res.status(200).json({
      success: true,
      message: '文件数据获取成功',
      fileId,
      fileName: fileData.fileName,
      fileData: fileData.fileData,
      uploadTime: fileData.uploadTime,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ 文件获取失败:', error);
    return res.status(500).json({
      success: false,
      message: '文件获取失败',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
