import { setCorsHeaders } from '../utils/cors-config.js';
import {
  createStagedUploadTarget,
  finalizeShopifyFileUpload,
  uploadBufferToStagedTarget,
} from '../utils/shopify-file-storage.js';

/**
 * 文件存储 API
 *
 * action=init     — 获取 Shopify Staged Upload 凭证（仅元数据，无文件体）
 * action=complete — 浏览器直传完成后，创建 Shopify Files 记录
 * （默认）        — 兼容旧版 Base64 上传（小文件）
 */

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed', allowed: ['POST', 'OPTIONS'] });
    return;
  }

  try {
    const { action, fileName, fileType, fileSize, resourceUrl, contentCategory } = req.body || {};

    if (action === 'init') {
      if (!fileName) {
        return res.status(400).json({ success: false, message: '缺少必要参数：fileName' });
      }

      const staged = await createStagedUploadTarget({ fileName, fileType, fileSize });
      console.log(`📁 Staged Upload 初始化: ${fileName}, 大小: ${fileSize || 'unknown'}, staged: ${staged.stagedFilename}`);

      return res.status(200).json({
        success: true,
        message: 'Staged Upload 初始化成功',
        stagedTarget: {
          url: staged.stagedTarget.url,
          resourceUrl: staged.stagedTarget.resourceUrl,
          parameters: staged.stagedTarget.parameters,
        },
        contentCategory: staged.contentCategory,
        mimeType: staged.mimeType,
        stagedMimeType: staged.stagedMimeType,
        stagedFilename: staged.stagedFilename,
      });
    }

    if (action === 'complete') {
      if (!fileName || !resourceUrl) {
        return res.status(400).json({ success: false, message: '缺少必要参数：fileName, resourceUrl' });
      }

      const result = await finalizeShopifyFileUpload({
        stagedTarget: { resourceUrl },
        fileName,
        fileType,
        fileSize,
        contentCategory,
      });

      console.log(`✅ 直传完成并创建文件记录: ${fileName}`);
      return res.status(200).json({
        success: true,
        message: '文件上传成功（浏览器直传 Shopify）',
        ...result,
      });
    }

    // 兼容旧版 Base64 上传
    const { fileData } = req.body;
    if (!fileData || !fileName) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数：fileData 和 fileName',
      });
    }

    const base64Data = fileData.includes(',') ? fileData.split(',')[1] : fileData;
    const fileBuffer = Buffer.from(base64Data, 'base64');
    const bufferSize = fileBuffer.length;

    console.log(`📁 Base64 上传: ${fileName}, 大小: ${bufferSize} 字节`);

    const staged = await createStagedUploadTarget({ fileName, fileType, fileSize: bufferSize });
    await uploadBufferToStagedTarget(
      staged.stagedTarget,
      fileBuffer,
      staged.stagedFilename || fileName,
      staged.mimeType,
    );

    const result = await finalizeShopifyFileUpload({
      stagedTarget: staged.stagedTarget,
      fileName,
      fileType,
      fileSize: bufferSize,
      contentCategory: staged.contentCategory,
      mimeType: staged.mimeType,
    });

    return res.status(200).json({
      success: true,
      message: '文件上传成功（Shopify Files完整存储）',
      ...result,
    });
  } catch (error) {
    console.error('❌ 文件存储失败:', error);
    return res.status(500).json({
      success: false,
      message: '文件存储失败',
      error: error.message,
    });
  }
}
