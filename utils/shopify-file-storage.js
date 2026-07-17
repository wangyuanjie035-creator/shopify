const MODEL_EXTENSIONS = ['stl', 'obj', '3mf', 'glb', 'gltf', '3ds', 'ply'];

export function determineContentCategory(fileType, fileName) {
  const mime = (fileType || '').toLowerCase();
  const ext = (fileName || '').toLowerCase().split('.').pop();

  if (mime.startsWith('image/')) return 'IMAGE';
  if (mime.startsWith('video/')) return 'VIDEO';
  if (mime.includes('model') && !['model/step', 'model/x.stp', 'application/step', 'application/octet-stream'].includes(mime)) {
    return 'MODEL_3D';
  }
  if (MODEL_EXTENSIONS.includes(ext)) return 'MODEL_3D';
  return 'FILE';
}

export function determineMimeType(fileType, fileName) {
  const mime = (fileType || '').toLowerCase();
  const ext = (fileName || '').toLowerCase().split('.').pop();

  const mapByExt = {
    step: 'model/step',
    stp: 'model/step',
    stl: 'model/stl',
    obj: 'model/obj',
    '3mf': 'model/3mf',
    glb: 'model/gltf-binary',
    gltf: 'model/gltf+json',
    '3ds': 'model/3ds',
    ply: 'model/ply',
  };

  if (mapByExt[ext]) return mapByExt[ext];
  if (mime) return mime;
  return 'application/octet-stream';
}

export function getShopifyCredentials() {
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOP;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.ADMIN_TOKEN;
  if (!storeDomain || !accessToken) {
    throw new Error('环境变量未配置：SHOP/SHOPIFY_STORE_DOMAIN 和 ADMIN_TOKEN/SHOPIFY_ACCESS_TOKEN');
  }
  return { storeDomain, accessToken };
}

async function shopifyGraphql(storeDomain, accessToken, query, variables) {
  const response = await fetch(`https://${storeDomain}/admin/api/2024-10/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  return response.json();
}

/** Shopify Staged Upload 对中文/空格文件名易报 INTERNAL_SERVER_ERROR，上传时用 ASCII 安全名 */
export function sanitizeStagedUploadFilename(fileName) {
  const raw = String(fileName || 'upload.bin').trim() || 'upload.bin';
  const dot = raw.lastIndexOf('.');
  const ext = dot > 0 ? raw.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  const stem = dot > 0 ? raw.slice(0, dot) : raw;
  const asciiStem = stem
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  const digits = (raw.match(/\d{6,}/g) || [])[0] || '';
  let safeStem = asciiStem || (digits ? `part_${digits}` : 'upload');
  safeStem = safeStem.replace(/^[-_.]+|[-_.]+$/g, '') || (digits ? `part_${digits}` : 'upload');
  return ext ? `${safeStem}.${ext}` : `${safeStem}.bin`;
}

function isRetryableShopifyError(payload) {
  const errors = payload?.errors || [];
  return errors.some((err) => err?.extensions?.code === 'INTERNAL_SERVER_ERROR');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isStagedUploadUrl(url) {
  return typeof url === 'string' && url.includes('shopify-staged-uploads.storage.googleapis.com');
}

async function waitForPermanentFileUrl(fileGid, storeDomain, accessToken, maxAttempts = 12) {
  const query = `
    query getFile($id: ID!) {
      node(id: $id) {
        ... on GenericFile {
          url
          fileStatus
        }
      }
    }
  `;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const data = await shopifyGraphql(storeDomain, accessToken, query, { id: fileGid });
    const node = data?.data?.node;
    const url = node?.url;
    const status = node?.fileStatus;

    if (url && status === 'READY' && !isStagedUploadUrl(url)) {
      return url;
    }

    await sleep(1000);
  }

  return null;
}

export function resolveStagedUploadTypes(fileType, fileName) {
  const contentCategory = determineContentCategory(fileType, fileName);
  const mimeType = determineMimeType(fileType, fileName);
  const resourceType = contentCategory === 'MODEL_3D' ? 'MODEL_3D' : 'FILE';
  const stagedMimeType = resourceType === 'MODEL_3D' ? mimeType : 'application/octet-stream';
  return { contentCategory, mimeType, resourceType, stagedMimeType };
}

export async function createStagedUploadTarget({ fileName, fileType, fileSize }) {
  const { storeDomain, accessToken } = getShopifyCredentials();
  const { contentCategory, mimeType, resourceType, stagedMimeType } = resolveStagedUploadTypes(fileType, fileName);
  const stagedFilename = sanitizeStagedUploadFilename(fileName);

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

  const stagedInput = {
    filename: stagedFilename,
    mimeType: stagedMimeType,
    resource: resourceType,
    httpMethod: 'POST',
  };
  if (fileSize != null && Number(fileSize) > 0) {
    stagedInput.fileSize = String(Math.ceil(Number(fileSize)));
  }

  let stagedUploadData = await shopifyGraphql(storeDomain, accessToken, stagedUploadMutation, {
    input: [stagedInput],
  });

  if (isRetryableShopifyError(stagedUploadData)) {
    await sleep(800);
    stagedUploadData = await shopifyGraphql(storeDomain, accessToken, stagedUploadMutation, {
      input: [stagedInput],
    });
  }

  const stagedUserErrors = stagedUploadData?.data?.stagedUploadsCreate?.userErrors || [];
  if (stagedUploadData.errors || stagedUserErrors.length > 0) {
    throw new Error(`Staged Upload创建失败: ${JSON.stringify(stagedUploadData.errors || stagedUserErrors)}`);
  }

  const stagedTarget = stagedUploadData.data.stagedUploadsCreate.stagedTargets[0];
  return {
    stagedTarget,
    contentCategory,
    mimeType,
    resourceType,
    stagedMimeType,
    stagedFilename,
    originalFileName: fileName,
  };
}

export async function uploadBufferToStagedTarget(stagedTarget, fileBuffer, fileName, mimeType) {
  const parameters = Array.isArray(stagedTarget.parameters) ? stagedTarget.parameters : [];
  const hasPolicy = parameters.some((param) => param.name === 'policy');

  if (hasPolicy) {
    const boundary = `----formdata-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const parts = [];

    parameters.forEach((param) => {
      parts.push(`--${boundary}\r\n`);
      parts.push(`Content-Disposition: form-data; name="${param.name}"\r\n\r\n`);
      parts.push(`${param.value}\r\n`);
    });

    parts.push(`--${boundary}\r\n`);
    parts.push(`Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`);
    parts.push(`Content-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`);

    const textParts = parts.join('');
    const textBuffer = Buffer.from(textParts, 'utf8');
    const fileEnding = Buffer.from('\r\n', 'utf8');
    const endBoundary = Buffer.from(`--${boundary}--\r\n`, 'utf8');
    const uploadBuffer = Buffer.concat([textBuffer, fileBuffer, fileEnding, endBoundary]);

    const uploadResponse = await fetch(stagedTarget.url, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': uploadBuffer.length.toString(),
        'x-goog-content-sha256': 'UNSIGNED-PAYLOAD',
      },
      body: uploadBuffer,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`文件上传到临时地址失败: ${uploadResponse.status} ${errorText}`);
    }
    return;
  }

  const contentTypeParam = parameters.find((param) => param.name === 'content_type');
  const uploadResponse = await fetch(stagedTarget.url, {
    method: 'PUT',
    headers: {
      'Content-Type': contentTypeParam ? contentTypeParam.value : (mimeType || 'application/octet-stream'),
    },
    body: fileBuffer,
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    throw new Error(`文件上传到临时地址失败: ${uploadResponse.status} ${errorText}`);
  }
}

export async function finalizeShopifyFileUpload({
  stagedTarget,
  fileName,
  fileType,
  fileSize,
  contentCategory,
  mimeType,
}) {
  const { storeDomain, accessToken } = getShopifyCredentials();

  const fileCreateMutation = `
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          id
          fileStatus
          ... on GenericFile {
            url
            originalFileSize
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const fileCreateData = await shopifyGraphql(storeDomain, accessToken, fileCreateMutation, {
    files: [{
      originalSource: stagedTarget.resourceUrl,
      contentType: contentCategory === 'MODEL_3D' ? 'MODEL_3D' : 'FILE',
      alt: fileName || '',
    }],
  });

  const userErrors = fileCreateData?.data?.fileCreate?.userErrors || [];
  const createdFiles = fileCreateData?.data?.fileCreate?.files || [];

  if (fileCreateData.errors || userErrors.length > 0 || createdFiles.length === 0) {
    throw new Error(`文件记录创建失败: ${JSON.stringify(fileCreateData.errors || userErrors || fileCreateData)}`);
  }

  const fileRecord = createdFiles[0];
  let shopifyFileUrl = fileRecord.url || stagedTarget.resourceUrl;

  if (!fileRecord.url || isStagedUploadUrl(shopifyFileUrl)) {
    const permanentUrl = await waitForPermanentFileUrl(fileRecord.id, storeDomain, accessToken);
    if (permanentUrl) {
      shopifyFileUrl = permanentUrl;
    }
  }
  const shopifyFileSize = fileRecord.originalFileSize || fileSize;
  const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const metaobjectCreateMutation = `
    mutation createUploadedFile($metaobject: MetaobjectCreateInput!) {
      metaobjectCreate(metaobject: $metaobject) {
        metaobject { id }
        userErrors { field message }
      }
    }
  `;

  const metaInput = {
    type: 'uploaded_file',
    handle: fileId,
    fields: [
      { key: 'file_id', value: fileId },
      { key: 'file_name', value: fileName || '' },
      { key: 'file_type', value: mimeType || determineMimeType(fileType, fileName) },
      { key: 'file_url', value: shopifyFileUrl || '' },
      { key: 'shopify_file_id', value: fileRecord.id },
      { key: 'file_size', value: String(shopifyFileSize || fileSize || 0) },
      { key: 'upload_time', value: new Date().toISOString() },
    ],
  };

  try {
    const metaJson = await shopifyGraphql(storeDomain, accessToken, metaobjectCreateMutation, {
      metaobject: metaInput,
    });
    const metaErrors = metaJson?.data?.metaobjectCreate?.userErrors || [];
    if (metaJson.errors || metaErrors.length > 0) {
      console.warn('⚠️ Metaobject 写入失败（非致命）：', JSON.stringify(metaErrors || metaJson, null, 2));
    }
  } catch (metaErr) {
    console.warn('⚠️ Metaobject 写入异常（非致命）：', metaErr.message);
  }

  return {
    fileId,
    fileName,
    shopifyFileId: fileRecord.id,
    shopifyFileUrl,
    originalFileSize: shopifyFileSize,
    uploadedFileSize: fileSize,
    timestamp: new Date().toISOString(),
  };
}
