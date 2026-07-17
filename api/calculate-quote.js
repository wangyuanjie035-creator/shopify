import { setCorsHeaders } from '../utils/cors-config.js';
import {
  estimateQuote,
  buildQuoteShopifyAttributes,
  serializeQuoteBreakdown,
} from '../utils/quote-engine.js';

/**
 * POST /api/calculate-quote
 * {
 *   "features": { ... normalizeMachiningFeatures output ... },
 *   "material": "铝合金-6061",
 *   "finishing": "喷砂+阳极",
 *   "quantity": 1
 * }
 */
export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      message: 'calculate-quote API is ready',
      formulaVersion: '1.6.1',
      timestamp: new Date().toISOString(),
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'method_not_allowed',
    });
  }

  try {
    const {
      features,
      material,
      materialCategory,
      finishing,
      surfaceTreatment,
      quantity = 1,
      rates,
    } = req.body || {};

    if (!features) {
      return res.status(400).json({
        success: false,
        error: 'missing_features',
        message: 'features object is required (from analyze-step-features)',
      });
    }

    const quote = estimateQuote({
      features,
      material,
      materialCategory,
      finishing: finishing || surfaceTreatment,
      quantity,
      rates,
    });

    return res.status(200).json({
      success: true,
      quote,
      shopifyAttributes: buildQuoteShopifyAttributes(quote),
      shopifySummary: serializeQuoteBreakdown(quote),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('calculate-quote failed:', error);
    return res.status(500).json({
      success: false,
      error: 'quote_calculation_failed',
      message: error.message,
    });
  }
}
