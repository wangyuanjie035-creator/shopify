/**
 * Online3DViewer Wrapper for STP Files
 * 专门为model-uploader项目定制的3D查看器包装器
 */

/** CAD-style neutral gray #C5C5C5 with soft specular */
const O3DV_SURFACE_COLOR = { r: 197, g: 197, b: 197 };
const O3DV_SURFACE_HEX = 0xc5c5c5;
const O3DV_BACKGROUND = { r: 245, g: 247, b: 250, a: 255 };

/** CAD feature edges: smooth surface + black outline on sharp/boundary edges only */
const O3DV_CAD_FEATURE_EDGES = true;

class O3DVWrapper {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.options = {
      width: 800,
      height: 600,
      backgroundColor: O3DV_BACKGROUND,
      defaultColor: O3DV_SURFACE_COLOR,
      showEdges: O3DV_CAD_FEATURE_EDGES,
      edgeColor: { r: 0, g: 0, b: 0 },
      edgeThreshold: 26,
      ...options
    };
    
    this.viewer = null;
    this.isInitialized = false;
    this.currentModel = null;
    
    this.init();
  }

  init() {
    if (!this.container) {
      console.error('O3DVWrapper: Container element not found');
      return;
    }

    // 创建查看器容器
    this.createViewerContainer();
    
    // 等待Online3DViewer库加载
    this.waitForO3DV();
  }

  createViewerContainer() {
    // 先隐藏原有的占位符
    const existingPlaceholder = this.container.querySelector('.viewer-placeholder');
    if (existingPlaceholder) {
      existingPlaceholder.style.display = 'none';
    }

    const width = this.container.clientWidth || this.options.width;
    const height = this.container.clientHeight || this.options.height;

    this.container.innerHTML = `
      <div class="o3dv-container" style="width: 100%; height: 100%; min-height: ${height}px; border: 1px solid #ddd; position: relative;">
        <div class="o3dv-loading" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; display: none;">
          <div class="spinner" style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #1976d2; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 10px;"></div>
          <p>正在加载3D查看器...</p>
        </div>
        <div class="o3dv-viewer" style="width: 100%; height: 100%; display: none; position: relative;">
          <div class="o3dv-center-loading" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:none;color:#666;font-size:14px;">
            <div class="spinner" style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #1976d2; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 10px;"></div>
            <p>分析你的设计</p>
          </div>
        </div>
        <div class="o3dv-error" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: #f44336; display: none;">
          <p>3D查看器加载失败</p>
        </div>
      </div>
    `;

    // 添加CSS动画
    if (!document.getElementById('o3dv-styles')) {
      const style = document.createElement('style');
      style.id = 'o3dv-styles';
      style.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .o3dv-container {
          background: linear-gradient(180deg, #f8f9fb 0%, #eef1f5 100%);
          border-radius: 8px;
          overflow: hidden;
        }
        .o3dv-viewer canvas {
          border-radius: 8px;
          display: block;
        }
      `;
      document.head.appendChild(style);
    }
  }

  waitForO3DV() {
    const start = Date.now();
    const checkInterval = setInterval(() => {
      if (typeof OV !== 'undefined') {
        clearInterval(checkInterval);
        this.initializeViewer();
      }
    }, 100);

    // 超时处理
    setTimeout(() => {
      clearInterval(checkInterval);
      if (!this.isInitialized) {
        this.showError('Online3DViewer库加载超时');
        // 触发回退：对外暴露标记供上层回退
        this.failed = true;
      }
    }, 8000);
  }

  initializeViewer() {
    try {
      const viewerContainer = this.container.querySelector('.o3dv-viewer');
      
      // 创建EmbeddedViewer实例
      this.viewer = new OV.EmbeddedViewer(viewerContainer, {
        backgroundColor: new OV.RGBAColor(
          this.options.backgroundColor.r,
          this.options.backgroundColor.g,
          this.options.backgroundColor.b,
          this.options.backgroundColor.a
        ),
        defaultColor: new OV.RGBColor(
          this.options.defaultColor.r,
          this.options.defaultColor.g,
          this.options.defaultColor.b
        ),
        edgeSettings: new OV.EdgeSettings(
          this.options.showEdges,
          new OV.RGBColor(
            this.options.edgeColor.r,
            this.options.edgeColor.g,
            this.options.edgeColor.b
          ),
          this.options.edgeThreshold
        ),
        onModelLoaded: () => {
          this.polishModelAppearance();
        },
      });

      // 隐藏所有加载指示器，显示查看器
      this.ensureLoadingHidden();
      viewerContainer.style.display = 'block';
      // 初始化时不显示loading，只在加载模型时显示
      
      // 确保初始化后立即隐藏所有可能的加载指示器
      setTimeout(() => {
        this.ensureLoadingHidden();
      }, 100);
      
      // 监听DOM变化，出现canvas后再次保证隐藏loading（双保险），并强制适配窗口
      const mo = new MutationObserver(() => {
        this.ensureLoadingHidden();
        try {
          if (this.viewer && typeof this.viewer.Resize === 'function') {
            this.viewer.Resize();
          }
        } catch (e) {}
      });
      mo.observe(viewerContainer, { childList: true, subtree: true });

      // 窗口尺寸变化时强制刷新渲染尺寸
      window.addEventListener('resize', () => {
        try {
          if (this.viewer && typeof this.viewer.Resize === 'function') {
            this.viewer.Resize();
          }
        } catch (e) {}
      });

      this.isInitialized = true;
      console.log('O3DVWrapper: Viewer initialized successfully');
      
    } catch (error) {
      console.error('O3DVWrapper: Failed to initialize viewer:', error);
      this.showError('3D查看器初始化失败');
    }
  }

  loadSTPFile(file) {
    if (!this.isInitialized || !this.viewer) {
      console.error('O3DVWrapper: Viewer not initialized');
      return Promise.reject(new Error('查看器未初始化'));
    }

    return new Promise((resolve, reject) => {
      try {
        // 检查文件大小，如果超过50MB给出警告
        const fileSizeMB = file.size / (1024 * 1024);
        if (fileSizeMB > 50) {
          console.warn(`Large file detected: ${fileSizeMB.toFixed(1)}MB. This may take longer to load or fail due to memory constraints.`);
        }
        
        // 显示加载状态
        this.showLoading();
        
        // 加载STP文件
        this.viewer.LoadModelFromFileList([file], () => {
          // 立即隐藏加载指示器
          this.hideLoadingSafely();
          this.currentModel = file;
          this._brepFaceData = window.__O3DV_BREP_FACE_DATA__ || null;
          window.__O3DV_BREP_FACE_DATA__ = null;
          console.log('O3DVWrapper: STP file loaded successfully');

          this.polishModelAppearance();

          // 渲染完成后适配窗口并触发一次重绘
          try {
            if (this.viewer && typeof this.viewer.Resize === 'function') {
              this.viewer.Resize();
            }
            const innerViewer = this.getInnerViewer();
            if (innerViewer && typeof innerViewer.FitSphereToWindow === 'function') {
              const sphere = innerViewer.GetBoundingSphere(() => true);
              innerViewer.FitSphereToWindow(sphere, false);
            } else if (this.viewer && typeof this.viewer.FitToWindow === 'function') {
              this.viewer.FitToWindow();
            }
          } catch (e) {}

          // 延迟一帧再次适配，确保加载指示器完全隐藏
          requestAnimationFrame(() => {
            try {
              this.polishModelAppearance();
              if (this.viewer && typeof this.viewer.Resize === 'function') {
                this.viewer.Resize();
              }
              const innerViewer = this.getInnerViewer();
              if (innerViewer && typeof innerViewer.FitSphereToWindow === 'function') {
                const sphere = innerViewer.GetBoundingSphere(() => true);
                innerViewer.FitSphereToWindow(sphere, false);
              }
            } catch (e) {}
            this.hideLoadingSafely();
          });

          resolve(file);
        });
        // 超时兜底：根据文件大小调整超时时间，大文件给更多时间
        this._loadingFallbackTimer && clearTimeout(this._loadingFallbackTimer);
        const timeoutMs = fileSizeMB > 50 ? 30000 : 15000; // 大文件30秒，小文件15秒
        this._loadingFallbackTimer = setTimeout(() => this.hideLoadingSafely(), timeoutMs);
        
      } catch (error) {
        this.hideLoadingSafely();
        console.error('O3DVWrapper: Failed to load STP file:', error);
        reject(error);
      }
    });
  }

  loadSTPFromUrl(url) {
    if (!this.isInitialized || !this.viewer) {
      console.error('O3DVWrapper: Viewer not initialized');
      return Promise.reject(new Error('查看器未初始化'));
    }

    return new Promise((resolve, reject) => {
      try {
        this.showLoading();
        
        this.viewer.LoadModelFromUrlList([url], () => {
          this.hideLoading();
          console.log('O3DVWrapper: STP file loaded from URL successfully');
          resolve(url);
        });
        
      } catch (error) {
        this.hideLoading();
        console.error('O3DVWrapper: Failed to load STP file from URL:', error);
        reject(error);
      }
    });
  }

  // 测量功能
  enableMeasurement() {
    if (!this.isInitialized || !this.viewer) {
      console.error('O3DVWrapper: Viewer not initialized');
      return;
    }

    // 这里可以添加测量功能的实现
    console.log('O3DVWrapper: Measurement enabled');
  }

  // 标注功能
  enableAnnotation() {
    if (!this.isInitialized || !this.viewer) {
      console.error('O3DVWrapper: Viewer not initialized');
      return;
    }

    // 这里可以添加标注功能的实现
    console.log('O3DVWrapper: Annotation enabled');
  }

  // 导出功能
  exportModel(format = 'stl') {
    if (!this.isInitialized || !this.viewer || !this.currentModel) {
      console.error('O3DVWrapper: No model to export');
      return Promise.reject(new Error('没有可导出的模型'));
    }

    return new Promise((resolve, reject) => {
      try {
        // 这里可以添加导出功能的实现
        console.log(`O3DVWrapper: Exporting model to ${format}`);
        resolve();
      } catch (error) {
        console.error('O3DVWrapper: Export failed:', error);
        reject(error);
      }
    });
  }

  // 重置视图
  resetView() {
    if (!this.isInitialized || !this.viewer) {
      console.error('O3DVWrapper: Viewer not initialized');
      return;
    }

    const innerViewer = this.getInnerViewer();
    if (innerViewer && typeof innerViewer.GetBoundingSphere === 'function') {
      const sphere = innerViewer.GetBoundingSphere(() => true);
      innerViewer.FitSphereToWindow(sphere, false);
      return;
    }

    if (typeof this.viewer.FitToWindow === 'function') {
      this.viewer.FitToWindow();
    }
  }

  // 设置背景色
  setBackgroundColor(color) {
    if (!this.isInitialized || !this.viewer) {
      console.error('O3DVWrapper: Viewer not initialized');
      return;
    }

    this.viewer.SetBackgroundColor(new OV.RGBAColor(color.r, color.g, color.b, color.a));
  }

  // 设置模型颜色
  setModelColor(color) {
    if (!this.isInitialized || !this.viewer) {
      console.error('O3DVWrapper: Viewer not initialized');
      return;
    }

    this.viewer.SetDefaultColor(new OV.RGBColor(color.r, color.g, color.b));
  }

  getInnerViewer() {
    if (!this.viewer) return null;
    if (typeof this.viewer.GetViewer === 'function') {
      return this.viewer.GetViewer();
    }
    return null;
  }

  polishModelAppearance() {
    const innerViewer = this.getInnerViewer();
    if (!innerViewer) return;

    const showFeatureEdges = this.options.showEdges === true;
    const edgeThreshold = this.options.edgeThreshold ?? 26;

    const viewerMainModel = innerViewer.mainModel;
    if (!viewerMainModel || viewerMainModel.mainModel?.IsEmpty?.()) {
      this.applyFeatureEdges(innerViewer, showFeatureEdges, edgeThreshold);
      return;
    }

    const specularHex = 0x181818;

    viewerMainModel.EnumerateMeshes((obj) => {
      if (obj.geometry.attributes?.color) {
        obj.geometry.deleteAttribute('color');
      }
      if (obj.geometry.attributes?.position && obj.geometry.computeVertexNormals) {
        obj.geometry.computeVertexNormals();
      }

      const applyMaterial = (material) => {
        if (!material) return;
        if (material.vertexColors !== undefined) {
          material.vertexColors = false;
        }
        if (material.color && material.color.setHex) {
          material.color.setHex(O3DV_SURFACE_HEX);
        }
        if (material.specular && material.specular.setHex) {
          material.specular.setHex(specularHex);
        }
        if (material.emissive && material.emissive.setHex) {
          material.emissive.setHex(0x000000);
        }
        if (typeof material.shininess === 'number') {
          material.shininess = 10;
        }
        if (typeof material.flatShading !== 'undefined') {
          material.flatShading = false;
        }
        material.needsUpdate = true;
      };

      const materials = new Set();
      const collect = (material) => {
        if (material) materials.add(material);
      };
      if (Array.isArray(obj.material)) {
        obj.material.forEach(collect);
      } else {
        collect(obj.material);
      }
      if (Array.isArray(obj.userData?.originalMaterials)) {
        obj.userData.originalMaterials.forEach(collect);
      }
      if (Array.isArray(obj.userData?.threeMaterials)) {
        obj.userData.threeMaterials.forEach(collect);
      }
      materials.forEach(applyMaterial);
    });

    this.applyFeatureEdges(innerViewer, showFeatureEdges, edgeThreshold);

    if (typeof innerViewer.Render === 'function') {
      innerViewer.Render();
    }
  }

  getThreeClasses(innerViewer) {
    if (this._threeClasses) return this._threeClasses;

    let bufferGeometry = null;
    let float32Attr = null;
    let lineSegments = null;
    let lineBasicMaterial = null;

    innerViewer.mainModel.EnumerateMeshes((mesh) => {
      if (bufferGeometry) return;
      bufferGeometry = mesh.geometry.constructor;
      float32Attr = mesh.geometry.attributes.position.constructor;
    });

    innerViewer.mainModel.EnumerateEdges((edge) => {
      if (lineSegments) return;
      lineSegments = edge.constructor;
      lineBasicMaterial = edge.material?.constructor || lineBasicMaterial;
    });

    if (!bufferGeometry || !lineSegments) return null;

    this._threeClasses = {
      BufferGeometry: bufferGeometry,
      Float32BufferAttribute: float32Attr,
      LineSegments: lineSegments,
      LineBasicMaterial: lineBasicMaterial,
    };
    return this._threeClasses;
  }

  getFaceIdForTriangle(triangleIndex, brepFaces) {
    if (!Array.isArray(brepFaces) || brepFaces.length === 0) return -1;
    for (let i = 0; i < brepFaces.length; i++) {
      const face = brepFaces[i];
      if (triangleIndex >= face.first && triangleIndex <= face.last) return i;
    }
    return -1;
  }

  extractBrepFaceBoundarySegments(threeMesh, brepFaces) {
    const original = threeMesh.userData?.originalMeshInstance;
    const ovMesh = original?.mesh;
    if (!ovMesh || typeof ovMesh.TriangleCount !== 'function') return [];
    if (!Array.isArray(brepFaces) || brepFaces.length === 0) return [];

    const triangleCount = ovMesh.TriangleCount();
    if (triangleCount === 0) return [];

    const edgeMap = new Map();

    const recordEdge = (i0, i1, faceId) => {
      const a = Math.min(i0, i1);
      const b = Math.max(i0, i1);
      const key = `${a},${b}`;
      if (!edgeMap.has(key)) edgeMap.set(key, []);
      edgeMap.get(key).push({ i0: a, i1: b, faceId });
    };

    for (let t = 0; t < triangleCount; t++) {
      const tri = ovMesh.GetTriangle(t);
      const faceId = this.getFaceIdForTriangle(t, brepFaces);
      if (faceId < 0) continue;
      recordEdge(tri.v0, tri.v1, faceId);
      recordEdge(tri.v1, tri.v2, faceId);
      recordEdge(tri.v2, tri.v0, faceId);
    }

    const segments = [];
    const seen = new Set();

    edgeMap.forEach((entries) => {
      if (entries.length < 2) return;
      for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          const a = entries[i];
          const b = entries[j];
          if (a.faceId === b.faceId) continue;

          const dedupeKey = `${a.i0},${a.i1}|${a.faceId}|${b.faceId}`;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);

          const v0 = ovMesh.GetVertex(a.i0);
          const v1 = ovMesh.GetVertex(a.i1);
          segments.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z);
        }
      }
    });

    return segments;
  }

  removeCustomBrepBoundaryEdges(viewerMainModel) {
    const edgeModel = viewerMainModel?.edgeModel;
    if (!edgeModel || edgeModel.IsEmpty()) return;

    const toRemove = [];
    edgeModel.Traverse((obj) => {
      if (obj.isLineSegments && obj.userData?.o3dvBrepBoundary) {
        toRemove.push(obj);
      }
    });

    toRemove.forEach((obj) => {
      if (obj.parent) obj.parent.remove(obj);
      obj.geometry?.dispose?.();
      obj.material?.dispose?.();
    });
  }

  appendBrepFaceBoundaryEdges(innerViewer, viewerMainModel) {
    const THREE = this.getThreeClasses(innerViewer);
    if (!THREE) return;

    const { r, g, b } = this.options.edgeColor;
    const edgeColor = (r << 16) | (g << 8) | b;

    viewerMainModel.UpdateWorldMatrix();

    let meshIdx = 0;
    viewerMainModel.EnumerateMeshes((mesh) => {
      const brepFaces = this._brepFaceData?.[meshIdx] || null;
      meshIdx += 1;
      const segments = this.extractBrepFaceBoundarySegments(mesh, brepFaces);
      if (segments.length === 0) return;

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(segments, 3));

      const material = new THREE.LineBasicMaterial({ color: edgeColor });
      const line = new THREE.LineSegments(geometry, material);
      line.applyMatrix4(mesh.matrixWorld);
      line.userData = { o3dvBrepBoundary: true };
      viewerMainModel.edgeModel.AddObject(line);
    });
  }

  applyFeatureEdges(innerViewer, showFeatureEdges, edgeThreshold) {
    try {
      const viewerMainModel = innerViewer.mainModel;
      this.removeCustomBrepBoundaryEdges(viewerMainModel);

      innerViewer.SetEdgeSettings(new OV.EdgeSettings(
        showFeatureEdges,
        new OV.RGBColor(
          this.options.edgeColor.r,
          this.options.edgeColor.g,
          this.options.edgeColor.b
        ),
        edgeThreshold
      ));

      if (showFeatureEdges) {
        this.appendBrepFaceBoundaryEdges(innerViewer, viewerMainModel);
        if (typeof viewerMainModel.UpdatePolygonOffset === 'function') {
          viewerMainModel.UpdatePolygonOffset();
        }
      }
    } catch (e) {
      console.warn('O3DVWrapper: failed to apply edge settings', e);
    }
  }

  // 显示/隐藏边缘
  setShowEdges(show) {
    if (!this.isInitialized || !this.viewer) {
      console.error('O3DVWrapper: Viewer not initialized');
      return;
    }

    const innerViewer = this.getInnerViewer();
    if (innerViewer) {
      innerViewer.SetEdgeSettings(new OV.EdgeSettings(
        show,
        new OV.RGBColor(60, 60, 60),
        this.options.edgeThreshold
      ));
      return;
    }

    this.viewer.SetEdgeSettings(new OV.EdgeSettings(show, new OV.RGBColor(0, 0, 0), 1));
  }

  // 获取模型信息
  getModelInfo() {
    if (!this.isInitialized || !this.viewer) {
      return null;
    }

    return {
      hasModel: this.currentModel !== null,
      fileName: this.currentModel ? this.currentModel.name : null,
      // 可以添加更多模型信息
    };
  }

  // 销毁查看器
  destroy() {
    if (this.viewer) {
      // 清理资源
      this.viewer = null;
    }
    this.isInitialized = false;
    this.currentModel = null;
  }

  // 辅助方法
  showLoading() {
    const loading = this.container.querySelector('.o3dv-loading');
    if (loading) {
      loading.style.display = 'block';
    }
    const center = this.container.querySelector('.o3dv-center-loading');
    if (center) center.style.display = 'block';
  }

  hideLoading() {
    const loading = this.container.querySelector('.o3dv-loading');
    if (loading) {
      loading.style.display = 'none';
    }
    const center = this.container.querySelector('.o3dv-center-loading');
    if (center) center.style.display = 'none';
  }

  ensureLoadingHidden() {
    const loading = this.container.querySelector('.o3dv-loading');
    if (loading) loading.style.display = 'none';
    const centerLoading = this.container.querySelector('.o3dv-center-loading');
    if (centerLoading) {
      centerLoading.style.display = 'none';
      console.log('O3DVWrapper: Hidden center loading indicator');
    }
  }

  hideLoadingSafely() {
    this.ensureLoadingHidden();
    // 同时隐藏占位符文本（如果被外部注入）
    const placeholder = this.container.querySelector('.viewer-placeholder');
    if (placeholder) placeholder.style.display = 'none';
  }

  showError(message) {
    const error = this.container.querySelector('.o3dv-error');
    if (error) {
      error.querySelector('p').textContent = message;
      error.style.display = 'block';
    }
  }

  hideError() {
    const error = this.container.querySelector('.o3dv-error');
    if (error) {
      error.style.display = 'none';
    }
  }
}

// 导出到全局
window.O3DVWrapper = O3DVWrapper;
