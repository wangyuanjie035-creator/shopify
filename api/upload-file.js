// Vercel 文件上传 API
// 用于处理客户上传的3D模型文件，存储到 Shopify Metaobject

import { shopGql } from './quotes-restored.js';

// 文件存储的 Metaobject 类型
const FILE_METAOBJECT_TYPE = 'uploaded_file';

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
    const { fileData, fileName, fileType, orderId } = req.body;
    
    if (!fileData || !fileName) {
      return res.status(400).json({ error: 'Missing file data or filename' });
    }

    // 生成唯一的文件ID
    const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // 将文件数据存储到 Shopify Metaobject
    const fields = [
      { key: 'file_id', value: fileId },
      { key: 'file_name', value: fileName },
      { key: 'file_type', value: fileType || 'application/octet-stream' },
      { key: 'file_data', value: fileData }, // 存储 base64 数据
      { key: 'order_id', value: orderId || '' }, // 关联的订单ID
      { key: 'upload_time', value: new Date().toISOString() },
      { key: 'file_size', value: String(fileData.length) }
    ];

    console.log('存储文件到 Metaobject:', { fileId, fileName, fileType, size: fileData.length });

    // 创建文件记录
    const createMutation = `
      mutation($fields: [MetaobjectFieldInput!]!) {
        metaobjectCreate(metaobject: {type: "${FILE_METAOBJECT_TYPE}", fields: $fields}) {
          metaobject { 
            id 
            handle 
            fields { key value } 
          }
          userErrors { field message }
        }
      }
    `;

    const result = await shopGql(createMutation, { fields });
    
    console.log('GraphQL 创建结果:', JSON.stringify(result, null, 2));
    
    if (result.errors) {
      console.error('GraphQL 错误:', result.errors);
      return res.status(500).json({ 
        error: 'GraphQL 错误', 
        details: result.errors 
      });
    }
    
    if (result.data.metaobjectCreate.userErrors.length > 0) {
      console.error('创建文件记录失败:', result.data.metaobjectCreate.userErrors);
      return res.status(400).json({ 
        error: '文件存储失败', 
        details: result.data.metaobjectCreate.userErrors 
      });
    }

    const fileRecord = result.data.metaobjectCreate.metaobject;
    const fileUrl = `https://shopify-13s4.vercel.app/api/download-file?id=${fileId}`;
    
    console.log('文件存储成功:', { fileId, metaobjectId: fileRecord.id });
    
    return res.status(200).json({
      success: true,
      fileId: fileId,
      fileName: fileName,
      fileUrl: fileUrl,
      metaobjectId: fileRecord.id,
      message: '文件上传成功'
    });

  } catch (error) {
    console.error('文件上传错误:', error);
    console.error('错误堆栈:', error.stack);
    return res.status(500).json({ 
      error: '文件上传失败', 
      details: error.message,
      stack: error.stack
    });
  }
}
