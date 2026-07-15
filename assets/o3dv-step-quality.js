/**
 * Finer STEP tessellation for Online3DViewer / occt-import-js.
 * Must load before o3dv.min.js so Worker postMessage can be patched.
 */
(function () {
  const STEP_MESH_PARAMS = {
    linearUnit: 'millimeter',
    linearDeflectionType: 'bounding_box_ratio',
    linearDeflection: 0.00025,
    angularDeflection: 0.12,
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

  function patchWorkerInstance(worker) {
    if (!worker || worker.__o3dvStepQualityPatched) return worker;
    const originalPostMessage = worker.postMessage.bind(worker);
    worker.postMessage = function patchedPostMessage(message, transfer) {
      if (message && (message.format === 'step' || message.format === 'iges')) {
        message.params = enhanceStepParams(message.params);
      }
      return originalPostMessage(message, transfer);
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
