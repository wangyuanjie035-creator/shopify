import { setCorsHeaders } from './cors-config.js';

/**
 * ═══════════════════════════════════════════════════════════════
 * 真实文件存储API - 使用Shopify Staged Upload
 * ═══════════════════════════════════════════════════════════════
 * 
 * 功能：将Base64文件数据上传到Shopify Files
 * 
 * 用途：
 * - 确保文件大小与原始上传一致
 * - 使用Shopify CDN存储，提供更好的性能
 * - 支持大文件上传（最大100MB）
 * 
 * 请求示例：
 * POST /api/store-file-real
 * {
 *   "fileData": "data:application/step;base64,U1RFUCBGSUxF...",
 *   "fileName": "model.STEP",
 *   "fileType": "application/step"
 * }
 */

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'POST') {
    try {
      const { fileData, fileName, fileType } = req.body;

      if (!fileData || !fileName) {
        return res.status(400).json({
          success: false,
          message: '缺少必要参数：fileData 和 fileName'
        });
      }

      // 解析Base64数据
      const base64Data = fileData.includes(',') ? fileData.split(',')[1] : fileData;
      const fileBuffer = Buffer.from(base64Data, 'base64');
      const fileSize = fileBuffer.length;

      console.log(`📁 开始上传文件: ${fileName}, 大小: ${fileSize} 字节`);

      // 获取环境变量
      const storeDomain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOP;
      const accessToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.ADMIN_TOKEN;

      if (!storeDomain || !accessToken) {
        return res.status(500).json({
          success: false,
          message: '环境变量未配置：SHOP/SHOPIFY_STORE_DOMAIN 和 ADMIN_TOKEN/SHOPIFY_ACCESS_TOKEN'
        });
      }

      // 步骤1: 创建Staged Upload
      const stagedUploadMutation = `
        mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
          stagedUploadsCreate(input: $input) {
            stagedTargets {
              url
              resourceUrl
              parameters {
                name
                value
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const stagedUploadResponse = await fetch(`https://${storeDomain}/admin/api/2024-01/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken
        },
        body: JSON.stringify({
          query: stagedUploadMutation,
          variables: {
            input: [{
              filename: fileName,
              mimeType: fileType || 'application/octet-stream',
              resource: 'FILE'
            }]
          }
        })
      });

      const stagedUploadData = await stagedUploadResponse.json();
      
      if (stagedUploadData.errors || stagedUploadData.data.stagedUploadsCreate.userErrors.length > 0) {
        console.error('❌ Staged Upload创建失败:', stagedUploadData);
        return res.status(500).json({
          success: false,
          message: 'Staged Upload创建失败',
          error: stagedUploadData.errors || stagedUploadData.data.stagedUploadsCreate.userErrors
        });
      }

      const stagedTarget = stagedUploadData.data.stagedUploadsCreate.stagedTargets[0];
      console.log('✅ Staged Upload创建成功');

      // 步骤2: 上传文件到临时地址
      const formData = new FormData();
      
      // 添加参数
      stagedTarget.parameters.forEach(param => {
        formData.append(param.name, param.value);
      });
      
      // 添加文件
      const blob = new Blob([fileBuffer], { type: fileType || 'application/octet-stream' });
      formData.append('file', blob, fileName);

      const uploadResponse = await fetch(stagedTarget.url, {
        method: 'POST',
        body: formData
      });

      if (!uploadResponse.ok) {
        console.error('❌ 文件上传失败:', uploadResponse.status, uploadResponse.statusText);
        return res.status(500).json({
          success: false,
          message: '文件上传到临时地址失败',
          error: `${uploadResponse.status} - ${uploadResponse.statusText}`
        });
      }

      console.log('✅ 文件上传到临时地址成功');

      // 步骤3: 创建永久文件记录
      const fileCreateMutation = `
        mutation fileCreate($files: [FileCreateInput!]!) {
          fileCreate(files: $files) {
            files {
              id
              fileStatus
              originalFileSize
              url
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const fileCreateResponse = await fetch(`https://${storeDomain}/admin/api/2024-01/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken
        },
        body: JSON.stringify({
          query: fileCreateMutation,
          variables: {
            files: [{
              originalSource: stagedTarget.resourceUrl,
              contentType: fileType || 'application/octet-stream',
              alt: fileName
            }]
          }
        })
      });

      const fileCreateData = await fileCreateResponse.json();

      if (fileCreateData.errors || fileCreateData.data.fileCreate.userErrors.length > 0) {
        console.error('❌ 文件记录创建失败:', fileCreateData);
        return res.status(500).json({
          success: false,
          message: '文件记录创建失败',
          error: fileCreateData.errors || fileCreateData.data.fileCreate.userErrors
        });
      }

      const fileRecord = fileCreateData.data.fileCreate.files[0];
      console.log('✅ 文件记录创建成功:', fileRecord.id);

      // 生成文件ID
      const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      return res.status(200).json({
        success: true,
        message: '文件上传成功（Shopify Files完整存储）',
        fileId: fileId,
        fileName: fileName,
        fileUrl: fileRecord.url,
        shopifyFileId: fileRecord.id,
        originalFileSize: fileRecord.originalFileSize,
        uploadedFileSize: fileSize,
        sizeMatch: fileRecord.originalFileSize === fileSize,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ 文件存储失败:', error);
      return res.status(500).json({
        success: false,
        message: '文件存储失败',
        error: error.message
      });
    }
  }

  res.status(405).json({
    error: 'Method not allowed',
    allowed: ['POST', 'OPTIONS']
  });
}
