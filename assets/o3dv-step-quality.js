/**
 * STEP tessellation override for Online3DViewer / occt-import-js.
 * Must load before o3dv.min.js so Worker postMessage can be patched.
 *
 * Current preset: extra-fine (smooth curves + CAD feature-edge overlay).
 */
(function () {
  const STEP_MESH_PARAMS = {
    linearUnit: 'millimeter',
    linearDeflectionType: 'bounding_box_ratio',
    linearDeflection: 0.00012,
    angularDeflection: 0.08,
  };

  function enhanceStepParams(params) {
    if (!params || typeof params !== 'object') {
      return { ...STEP_MESH_PARAMS };
    }
    return {
      ...params,
      ...STEP_MESH_PARAMS,
    };
  }

  /** Imperceptible per-face tint so O3DV assigns one material per B-rep face (for boundary edges). */
  function assignUniqueBrepFaceColors(meshes) {
    if (!Array.isArray(meshes)) return;
    const base = 197;
    meshes.forEach((mesh, meshIdx) => {
      if (!Array.isArray(mesh.brep_faces)) return;
      mesh.brep_faces.forEach((face, faceIdx) => {
        const slot = meshIdx * 4096 + faceIdx;
        face.color = [
          (base + (slot % 5)) / 255,
          (base + ((slot >> 4) % 5)) / 255,
          (base + ((slot >> 8) % 5)) / 255,
        ];
      });
    });
  }

  function wrapOcctResultListener(listener) {
    return function onOcctWorkerMessage(ev) {
      const data = ev && ev.data;
      if (data && data.success && Array.isArray(data.meshes)) {
        assignUniqueBrepFaceColors(data.meshes);
      }
      return listener.call(this, ev);
    };
  }

  function patchWorkerInstance(worker) {
    if (!worker || worker.__o3dvStepQualityPatched) return worker;
    const originalPostMessage = worker.postMessage.bind(worker);
    worker.postMessage = function patchedPostMessage(message, transfer) {
      if (message && (message.format === 'step' || message.format === 'iges')) {
        message.params = enhanceStepParams(message.params);
      }
      return originalPostMessage(message, transfer);
    };

    const originalAddEventListener = worker.addEventListener.bind(worker);
    worker.addEventListener = function patchedAddEventListener(type, listener, options) {
      if (type === 'message' && typeof listener === 'function') {
        return originalAddEventListener(type, wrapOcctResultListener(listener), options);
      }
      return originalAddEventListener(type, listener, options);
    };

    worker.__o3dvStepQualityPatched = true;
    return worker;
  }

  if (typeof Worker === 'undefined') return;

  const NativeWorker = Worker;
  window.Worker = function PatchedWorker(scriptURL, options) {
    const worker = patchWorkerInstance(new NativeWorker(scriptURL, options));
    return worker;
  };
  window.Worker.prototype = NativeWorker.prototype;

  window.O3DVStepQuality = {
    params: STEP_MESH_PARAMS,
    enhanceStepParams,
  };
})();
