// Vercel 文件清理 API
// 用于删除与订单关联的文件

import { shopGql } from './quotes-restored.js';

// 文件存储的 Metaobject 类型
const FILE_METAOBJECT_TYPE = 'uploaded_file';

export default async function handler(req, res) {
  // 设置 CORS 头 - 允许Shopify域名
  res.setHeader('Access-Control-Allow-Origin', 'https://sain-pdc-test.myshopify.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { orderId, fileId } = req.body;
    
    if (!orderId && !fileId) {
      return res.status(400).json({ error: 'Missing orderId or fileId' });
    }

    // 查找要删除的文件
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
    let filesToDelete = [];
    
    if (fileId) {
      // 按文件ID查找
      const fileRecord = result.data.metaobjects.nodes.find(node => {
        const fileIdField = node.fields.find(f => f.key === 'file_id');
        return fileIdField && fileIdField.value === fileId;
      });
      if (fileRecord) {
        filesToDelete.push(fileRecord);
      }
    } else if (orderId) {
      // 按订单ID查找
      filesToDelete = result.data.metaobjects.nodes.filter(node => {
        const orderIdField = node.fields.find(f => f.key === 'order_id');
        return orderIdField && orderIdField.value === orderId;
      });
    }

    if (filesToDelete.length === 0) {
      return res.status(200).json({
        success: true,
        message: '没有找到要删除的文件',
        deletedCount: 0
      });
    }

    // 删除文件
    const deleteResults = [];
    for (const fileRecord of filesToDelete) {
      try {
        const deleteMutation = `
          mutation($id: ID!) {
            metaobjectDelete(id: $id) {
              deletedId
              userErrors {
                field
                message
              }
            }
          }
        `;

        const deleteResult = await shopGql(deleteMutation, { id: fileRecord.id });
        
        if (deleteResult.data.metaobjectDelete.userErrors.length > 0) {
          console.error('删除文件失败:', deleteResult.data.metaobjectDelete.userErrors);
          deleteResults.push({
            fileId: fileRecord.fields.find(f => f.key === 'file_id')?.value || 'unknown',
            success: false,
            error: deleteResult.data.metaobjectDelete.userErrors
          });
        } else {
          console.log('文件删除成功:', fileRecord.id);
          deleteResults.push({
            fileId: fileRecord.fields.find(f => f.key === 'file_id')?.value || 'unknown',
            success: true
          });
        }
      } catch (error) {
        console.error('删除文件异常:', error);
        deleteResults.push({
          fileId: fileRecord.fields.find(f => f.key === 'file_id')?.value || 'unknown',
          success: false,
          error: error.message
        });
      }
    }

    const successCount = deleteResults.filter(r => r.success).length;
    const failCount = deleteResults.filter(r => !r.success).length;

    return res.status(200).json({
      success: true,
      message: `文件清理完成: 成功 ${successCount} 个, 失败 ${failCount} 个`,
      deletedCount: successCount,
      failedCount: failCount,
      details: deleteResults
    });

  } catch (error) {
    console.error('文件清理错误:', error);
    return res.status(500).json({ 
      error: '文件清理失败', 
      details: error.message 
    });
  }
}
