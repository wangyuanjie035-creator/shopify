import { setCorsHeaders } from '../utils/cors-config.js';
import { analyzeStepInput, checkPalmettoHealth, DEFAULT_MODULES } from '../utils/palmetto-client.js';
import {
  normalizeMachiningFeatures,
  serializeMachiningFeaturesForShopify,
  buildShopifyDetailAttributes,
} from '../utils/machining-features.js';

/**
 * STEP 加工特征分析 API
 *
 * 依赖独立部署的 Palmetto 服务（Analysis Situs HTTP 封装）
 * 环境变量：PALMETTO_SERVICE_URL=http://your-palmetto-host:8000
 *
 * POST /api/analyze-step-features
 * {
 *   "fileUrl": "https://cdn.shopify.com/.../model.step",
 *   "fileName": "model.step"
 * }
 *
 * 或
 * {
 *   "fileData": "data:application/step;base64,...",
 *   "fileName": "model.step"
 * }
 */

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    try {
      const health = await checkPalmettoHealth();
      return res.status(200).json({
        success: true,
        message: 'analyze-step-features API is ready',
        palmetto: health,
        defaultModules: DEFAULT_MODULES,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return res.status(503).json({
        success: false,
        message: 'Palmetto service is not reachable',
        error: error.message,
        hint: 'Deploy Palmetto separately and set PALMETTO_SERVICE_URL',
      });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'method_not_allowed',
      allowed: ['GET', 'POST', 'OPTIONS'],
    });
  }

  try {
    const {
      fileUrl,
      fileName,
      fileData,
      modules,
      recognizers,
      includeShopifySummary = true,
    } = req.body || {};

    if (!fileName) {
      return res.status(400).json({
        success: false,
        error: 'missing_file_name',
        message: 'fileName is required',
      });
    }

    if (!fileUrl && !fileData) {
      return res.status(400).json({
        success: false,
        error: 'missing_file_source',
        message: 'Either fileUrl or fileData is required',
      });
    }

    console.log('Starting STEP feature analysis:', {
      fileName,
      source: fileUrl ? 'url' : 'base64',
      modules: modules || recognizers || DEFAULT_MODULES,
    });

    const selectedModules = Array.isArray(modules) && modules.length > 0
      ? modules
      : (Array.isArray(recognizers) && recognizers.length > 0 ? recognizers : DEFAULT_MODULES);

    const raw = await analyzeStepInput({
      fileUrl,
      fileName,
      fileData,
      modules: selectedModules,
      cleanupModel: true,
    });

    const features = normalizeMachiningFeatures({
      fileName,
      upload: raw.upload,
      analysis: raw.analysis,
      fileSizeBytes: raw.fileSizeBytes,
    });

    return res.status(200).json({
      success: true,
      message: 'STEP feature analysis completed',
      features,
      shopifySummary: includeShopifySummary
        ? serializeMachiningFeaturesForShopify(features)
        : undefined,
      shopifyDetailAttributes: buildShopifyDetailAttributes(features),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('STEP feature analysis failed:', error);
    return res.status(500).json({
      success: false,
      error: 'feature_analysis_failed',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}
