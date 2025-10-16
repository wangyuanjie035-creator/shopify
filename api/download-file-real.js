import { setCorsHeaders } from './cors-config.js';

/**
 * ═══════════════════════════════════════════════════════════════
 * 真实文件下载API - 从Shopify Files下载
 * ═══════════════════════════════════════════════════════════════
 * 
 * 功能：从Shopify Files下载文件，确保文件大小一致
 * 
 * 用途：
 * - 管理员下载客户上传的文件
 * - 验证文件大小与原始上传一致
 * - 提供原始文件格式下载
 * 
 * 请求示例：
 * GET /api/download-file-real?id=file_1234567890_abcdef
 */

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'GET') {
    try {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: '缺少文件ID参数'
        });
      }

      console.log(`📥 请求下载文件: ${id}`);

      // 获取环境变量
      const storeDomain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOP;
      const accessToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.ADMIN_TOKEN;

      if (!storeDomain || !accessToken) {
        return res.status(500).json({
          success: false,
          message: '环境变量未配置'
        });
      }

      // 查询文件信息
      const fileQuery = `
        query getFile($id: ID!) {
          file(id: $id) {
            id
            url
            originalFileSize
            fileStatus
            alt
          }
        }
      `;

      const response = await fetch(`https://${storeDomain}/admin/api/2024-01/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken
        },
        body: JSON.stringify({
          query: fileQuery,
          variables: { id: `gid://shopify/GenericFile/${id}` }
        })
      });

      const data = await response.json();

      if (data.errors || !data.data.file) {
        console.error('❌ 文件查询失败:', data);
        return res.status(404).json({
          success: false,
          message: '文件不存在或查询失败',
          error: data.errors || 'File not found'
        });
      }

      const file = data.data.file;
      
      if (file.fileStatus !== 'READY') {
        return res.status(202).json({
          success: false,
          message: '文件正在处理中，请稍后再试',
          fileStatus: file.fileStatus
        });
      }

      console.log(`✅ 找到文件: ${file.alt}, 大小: ${file.originalFileSize} 字节`);

      // 从Shopify CDN下载文件
      const fileResponse = await fetch(file.url);
      
      if (!fileResponse.ok) {
        console.error('❌ 文件下载失败:', fileResponse.status);
        return res.status(500).json({
          success: false,
          message: '文件下载失败',
          error: `${fileResponse.status} - ${fileResponse.statusText}`
        });
      }

      const fileBuffer = await fileResponse.arrayBuffer();
      const downloadedSize = fileBuffer.byteLength;

      console.log(`📊 文件大小对比: 原始=${file.originalFileSize}, 下载=${downloadedSize}, 一致=${file.originalFileSize === downloadedSize}`);

      // 设置响应头
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Length', downloadedSize);
      res.setHeader('Content-Disposition', `attachment; filename="${file.alt || 'download'}"`);
      res.setHeader('X-Original-File-Size', file.originalFileSize);
      res.setHeader('X-Downloaded-File-Size', downloadedSize);
      res.setHeader('X-Size-Match', file.originalFileSize === downloadedSize ? 'true' : 'false');

      // 发送文件内容
      res.status(200).send(Buffer.from(fileBuffer));

    } catch (error) {
      console.error('❌ 文件下载失败:', error);
      return res.status(500).json({
        success: false,
        message: '文件下载失败',
        error: error.message
      });
    }
  }

  res.status(405).json({
    error: 'Method not allowed',
    allowed: ['GET', 'OPTIONS']
  });
}
