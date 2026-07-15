/** Palmetto C++ engine module names (see GET /api/analyze/modules) */
const DEFAULT_MODULES = [
  'recognize_holes',
  'recognize_shafts',
  'recognize_fillets',
  'recognize_cavities',
];

/** Legacy recognizer aliases from older API docs */
const MODULE_ALIASES = {
  hole_detector: 'recognize_holes',
  shaft_detector: 'recognize_shafts',
  fillet_detector: 'recognize_fillets',
  cavity_detector: 'recognize_cavities',
  thin_wall_detector: 'recognize_thin_walls',
  aag_dump: 'aag_dump',
};

function getBaseUrl() {
  const base = process.env.PALMETTO_SERVICE_URL || 'http://localhost:8000';
  return base.replace(/\/$/, '');
}

function ensureConfigured() {
  if (!process.env.PALMETTO_SERVICE_URL && process.env.NODE_ENV === 'production') {
    console.warn('PALMETTO_SERVICE_URL is not set; falling back to http://localhost:8000');
  }
}

function resolveModules(modules) {
  if (!modules || modules.length === 0) {
    return DEFAULT_MODULES.join(',');
  }

  return modules
    .map((name) => MODULE_ALIASES[name] || name)
    .join(',');
}

/** Skip ngrok browser interstitial; required for server-to-server calls via ngrok free tier */
const PALMETTO_FETCH_HEADERS = {
  'ngrok-skip-browser-warning': 'true',
};

function formatNonJsonError(context, status, text) {
  if (/<!DOCTYPE html/i.test(text) && (status === 503 || status === 502)) {
    return `${context} failed (${status}): Palmetto/ngrok 隧道离线。请确认 Docker Palmetto 在 8888 端口运行，且 ngrok http 8888 保持开启`;
  }
  return `${context} returned non-JSON (${status}): ${text.slice(0, 300)}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientPalmettoError(error) {
  const msg = error?.message || '';
  return /\(502\)|\(503\)|隧道离线|unreachable|ECONNRESET|fetch failed|socket hang up/i.test(msg);
}

async function withPalmettoRetry(label, fn, attempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isTransientPalmettoError(error) || attempt === attempts - 1) {
        throw error;
      }
      console.warn(`${label} retry ${attempt + 1}/${attempts - 1}:`, error.message);
      await sleep(2000 * (attempt + 1));
    }
  }
  throw lastError;
}

async function parseJsonResponse(response, context) {
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(formatNonJsonError(context, response.status, text));
  }

  if (!response.ok) {
    const detail = data.detail || data.message || text.slice(0, 300);
    throw new Error(`${context} failed (${response.status}): ${detail}`);
  }

  return data;
}

function mapPalmettoFeature(raw) {
  const params = raw.params || {};
  const type = raw.type || 'unknown';
  const subtype = raw.subtype || '';

  let featureType = type;
  if (type === 'hole') {
    if (subtype === 'counterbored') featureType = 'hole_counterbored';
    else featureType = 'hole_simple';
  } else if (type === 'cavity') {
    featureType = subtype === 'pocket' ? 'pocket' : 'cavity_blind';
  } else if (type === 'shaft' || type === 'fillet' || type === 'chamfer') {
    featureType = type;
  } else if (subtype) {
    featureType = `${type}_${subtype}`;
  }

  const properties = {};
  if (params.diameter_mm != null) properties.diameter = params.diameter_mm;
  if (params.max_diameter_mm != null && properties.diameter == null) {
    properties.diameter = params.max_diameter_mm;
  }
  if (params.min_diameter_mm != null) properties.min_diameter = params.min_diameter_mm;
  if (params.max_diameter_mm != null) properties.max_diameter = params.max_diameter_mm;
  if (params.radius_mm != null) properties.radius = params.radius_mm;
  if (params.major_radius_mm != null) properties.major_radius = params.major_radius_mm;
  if (params.depth_mm != null) properties.depth = params.depth_mm;
  if (params.estimated_volume_mm3 != null) properties.volume = params.estimated_volume_mm3;
  if (params.total_area_mm2 != null) properties.floor_area = params.total_area_mm2;
  if (params.face_count != null) properties.face_count = params.face_count;
  if (params.width_mm != null) properties.width = params.width_mm;
  if (params.length != null) properties.length = params.length;
  if (params.bore_count != null) properties.bore_count = params.bore_count;
  if (params.is_through != null) properties.is_through = params.is_through;
  if (params.opening_diameter_mm != null) properties.opening_diameter = params.opening_diameter_mm;
  if (params.aspect_ratio != null) properties.aspect_ratio = params.aspect_ratio;
  if (params.is_deep != null) properties.is_deep = params.is_deep;
  if (params.is_narrow != null) properties.is_narrow = params.is_narrow;
  if (params.accessibility_score != null) properties.accessibility_score = params.accessibility_score;

  if (params.axis_x != null) {
    properties.axis = [params.axis_x, params.axis_y, params.axis_z];
  }
  if (params.axis_origin_x != null) {
    properties.axisOrigin = [params.axis_origin_x, params.axis_origin_y, params.axis_origin_z];
  }

  return {
    feature_id: raw.id,
    feature_type: featureType,
    confidence: raw.confidence,
    face_ids: raw.faces || [],
    properties,
    source: raw.source || null,
    subtype,
  };
}

export async function checkPalmettoHealth() {
  ensureConfigured();
  const baseUrl = getBaseUrl();

  const healthResponse = await fetch(`${baseUrl}/health`, {
    method: 'GET',
    headers: PALMETTO_FETCH_HEADERS,
  });
  if (!healthResponse.ok) {
    throw new Error(`Palmetto is unreachable at ${baseUrl} (${healthResponse.status})`);
  }

  let engineAvailable = null;
  try {
    const engineResponse = await fetch(`${baseUrl}/api/analyze/health`, {
      method: 'GET',
      headers: PALMETTO_FETCH_HEADERS,
    });
    if (engineResponse.ok) {
      const engineHealth = await engineResponse.json();
      engineAvailable = engineHealth.available ?? null;
    }
  } catch {
    // Optional endpoint
  }

  return { ok: true, baseUrl, engineAvailable };
}

export async function listModules() {
  ensureConfigured();
  const response = await fetch(`${getBaseUrl()}/api/analyze/modules`, {
    method: 'GET',
    headers: PALMETTO_FETCH_HEADERS,
  });
  const data = await parseJsonResponse(response, 'List modules');
  return data.modules || [];
}

/** @deprecated Use listModules() — old API path no longer exists */
export async function listRecognizers() {
  const modules = await listModules();
  return modules.map((module) => module.name);
}

export async function uploadStepFile(fileBuffer, fileName) {
  return withPalmettoRetry('Upload STEP file', async () => {
    ensureConfigured();
    const form = new FormData();
    const blob = new Blob([fileBuffer], { type: 'application/step' });
    form.append('file', blob, fileName);

    const response = await fetch(`${getBaseUrl()}/api/analyze/upload`, {
      method: 'POST',
      headers: PALMETTO_FETCH_HEADERS,
      body: form,
    });

    return parseJsonResponse(response, 'Upload STEP file');
  });
}

export async function processModel(modelId, options = {}) {
  return withPalmettoRetry('Process model', async () => {
    ensureConfigured();
    const modules = resolveModules(options.modules || options.recognizers);

    const response = await fetch(`${getBaseUrl()}/api/analyze/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...PALMETTO_FETCH_HEADERS },
      body: JSON.stringify({
        model_id: modelId,
        modules,
        analyze_thickness: false,
        enable_dfm_geometry: false,
        enable_pocket_depth: true,
        enable_sdf: false,
        enable_thickness_heatmap: false,
      }),
    });

    return parseJsonResponse(response, 'Process model');
  });
}

/** @deprecated Use processModel() — recognition runs in one C++ pass now */
export async function recognizeFeatures(modelId, recognizer, parameters = {}) {
  return processModel(modelId, { modules: [recognizer], ...parameters });
}

export async function deleteModel(modelId) {
  ensureConfigured();
  try {
    await fetch(`${getBaseUrl()}/api/models/${modelId}`, { method: 'DELETE' });
  } catch (error) {
    console.warn('Failed to delete Palmetto model:', modelId, error.message);
  }
}

export async function analyzeAllFeatures(modelId, modules = DEFAULT_MODULES) {
  const startedAt = Date.now();
  const errors = [];

  try {
    const processResult = await processModel(modelId, { modules });
    const mappedFeatures = (processResult.features || []).map(mapPalmettoFeature);

    if (!processResult.success) {
      errors.push({
        recognizer: 'process',
        message: processResult.error || 'C++ engine reported failure',
      });
    }

    return {
      modelId,
      modules: resolveModules(modules).split(','),
      results: [{ features: mappedFeatures }],
      errors,
      executionMs: Date.now() - startedAt,
      metadata: processResult.metadata || {},
      artifacts: processResult.artifacts || {},
    };
  } catch (error) {
    errors.push({
      recognizer: 'process',
      message: error.message,
    });

    return {
      modelId,
      modules: resolveModules(modules).split(','),
      results: [],
      errors,
      executionMs: Date.now() - startedAt,
      metadata: {},
      artifacts: {},
    };
  }
}

export async function downloadFileFromUrl(fileUrl) {
  const response = await fetch(fileUrl, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`Failed to download STEP file (${response.status}): ${fileUrl}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function decodeBase64FileData(fileData) {
  const base64 = fileData.includes(',') ? fileData.split(',')[1] : fileData;
  return Buffer.from(base64, 'base64');
}

export async function analyzeStepInput({
  fileUrl,
  fileName,
  fileData,
  modules,
  recognizers,
  cleanupModel = true,
}) {
  if (!fileName) {
    throw new Error('fileName is required');
  }

  let fileBuffer;
  if (fileUrl) {
    fileBuffer = await downloadFileFromUrl(fileUrl);
  } else if (fileData) {
    fileBuffer = decodeBase64FileData(fileData);
  } else {
    throw new Error('Either fileUrl or fileData is required');
  }

  await checkPalmettoHealth();

  const upload = await uploadStepFile(fileBuffer, fileName);
  const modelId = upload.model_id;
  const selectedModules = modules || recognizers || DEFAULT_MODULES;

  try {
    const analysis = await analyzeAllFeatures(modelId, selectedModules);
    const metaCounts = analysis.metadata?.counts;
    const topologyStats = metaCounts
      ? {
          faces: metaCounts.faces ?? null,
          edges: metaCounts.edges ?? null,
          triangles: metaCounts.triangles ?? null,
          features: metaCounts.features ?? null,
          solids: upload?.topology_stats?.solids ?? 1,
        }
      : (upload?.topology_stats || analysis.metadata?.topology || null);

    return {
      upload: {
        ...upload,
        topology_stats: topologyStats,
      },
      analysis,
      fileSizeBytes: fileBuffer.length,
    };
  } finally {
    if (cleanupModel) {
      await deleteModel(modelId);
    }
  }
}

export { DEFAULT_MODULES, DEFAULT_MODULES as DEFAULT_RECOGNIZERS, mapPalmettoFeature };
