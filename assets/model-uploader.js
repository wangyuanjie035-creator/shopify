/**
 * 3D Model Uploader - Complete Multi-File Version
 * 支持多文件独立管理、ZIP解压、完整错误反馈
 */

(function() {
  'use strict';

  // 全局变量
  let fileManager = {
    files: new Map(), // 存储所有文件及其配置
    currentFileId: null, // 当前选中的文件ID
    nextFileId: 1, // 下一个文件ID
    // 文件关联关系：3D文件ID -> 对应的2D文件ID数组
    fileAssociations: new Map()
  };

  let viewer = null;
  let scene = null;
  let camera = null;
  let renderer = null;
  
  // Online3DViewer集成
  let o3dvWrapper = null;
  let useAdvancedViewer = false;

  // DOM 元素
  let fileInput, dropzone, modelViewer, viewerContainer;
  let loadingIndicator, errorMessage, fileList, fileItems;
  let materialCategorySelect, materialSelect, surfaceListContainer, surfaceToggleYes, surfaceToggleNo;
  let qtyInput, qtyMinus, qtyPlus;
  let dimensionsDisplay, dimensionsValue;
  let addToCartBtn, form;
  let hasThreadRadios, hasAssemblyRadios, tightestSelect, roughnessSelect, noteTextarea;
  let charCount;

  // 材料类型映射
  const MATERIAL_TYPE_MAP = {
    '铝合金': ['铝合金-6061', '铝合金-7075'],
    '塑料': [
      '工程塑料-ABS（白色）',
      '工程塑料-ABS（黑色）',
      '赛钢-POM（白色）',
      '赛钢-POM（黑色）',
      '电木（黑色）',
      '电木（橘黄色）',
      '亚克力',
      '环氧板-FR4（绿色）',
      '尼龙-PA6（白色）',
      '聚碳酸酯-PC'
    ],
    '铜合金': ['黄铜-H59', '紫铜-T2'],
    '合金钢': ['45#钢'],
    '不锈钢': ['SUS304']
  };
  const DEFAULT_MATERIAL_CATEGORY = '铝合金';

  // 表面处理配置（按材料类别）
  const ALUMINUM_PRIMARY = [
    '喷砂+普通阳极氧化',
    '喷砂+导电氧化',
    '喷砂+硬质阳极氧化',
    '拉丝',
    '仅喷砂',
    '普通阳极氧化(不喷砂)',
    '导电氧化(不喷砂)',
    '硬质阳极氧化(不喷砂)',
    '拉丝+普通阳极氧化'
  ];
  const ALUMINUM_SECONDARY = ['不做', '激光打标', 'UV打印'];
  const ALUMINUM_COLORS = ['本色', '黑色', '深空灰', '红色', '粉红色', '天蓝色', '深绿色', '沙金', '宝蓝色'];

  const PLASTIC_OIL_TYPES = ['工程塑料-ABS（白色）', '工程塑料-ABS（黑色）', '电木（黑色）', '电木（橘黄色）'];
  const PLASTIC_UV_TYPES = ['赛钢-POM（白色）', '赛钢-POM（黑色）', '尼龙-PA6（白色）', '环氧板-FR4（绿色）'];
  const PLASTIC_CLEAR_TYPES = ['亚克力', '聚碳酸酯-PC'];

  const OIL_COLORS = ['黑色', '白色'];
  const UV_COLORS = ['黑色', '白色', '红色', '橙色', '黄色', '绿色', '青色', '紫色'];
  const SHEEN_OIL = ['哑光']; // 喷油仅哑光

  function getDefaultMaterialType(category) {
    const types = MATERIAL_TYPE_MAP[category] || [];
    return types[0] || '';
  }

  function getCategoryForMaterial(materialType) {
    if (!materialType) return null;
    for (const [category, list] of Object.entries(MATERIAL_TYPE_MAP)) {
      if (list.includes(materialType)) {
        return category;
      }
    }
    return null;
  }

  function refreshMaterialTypeOptions(category, selectedType) {
    if (!materialSelect) return '';
    const types = MATERIAL_TYPE_MAP[category] || [];
    materialSelect.innerHTML = '';
    types.forEach((type) => {
      const option = document.createElement('option');
      option.value = type;
      option.textContent = type;
      materialSelect.appendChild(option);
    });
    const nextType = types.includes(selectedType) ? selectedType : (types[0] || '');
    if (nextType) {
      materialSelect.value = nextType;
    }
    return nextType;
  }

  function initializeMaterialSelectors() {
    const category = materialCategorySelect?.value || DEFAULT_MATERIAL_CATEGORY;
    const currentTypeValue = materialSelect?.value || '';
    const normalizedType = refreshMaterialTypeOptions(category, currentTypeValue || getDefaultMaterialType(category));
    if (materialCategorySelect && !materialCategorySelect.value) {
      materialCategorySelect.value = category;
    }
    if (materialSelect && normalizedType) {
      materialSelect.value = normalizedType;
    }
  }

  function getSurfaceRule(materialType, materialCategory) {
    // 默认铝合金
    const isPlastic = materialCategory === '塑料';
    if (materialCategory === '铝合金') {
      return {
        primary: ALUMINUM_PRIMARY,
        secondary: ALUMINUM_SECONDARY,
        colorMap: {
          default: ALUMINUM_COLORS,
          'UV打印': UV_COLORS
        },
        sheenMap: {
          // 无额外光泽选项
        }
      };
    }

    if (isPlastic) {
      if (PLASTIC_OIL_TYPES.includes(materialType)) {
        return {
          primary: ['喷油', 'UV打印'],
          secondary: ['不做', '喷油', 'UV打印'],
          colorMap: {
            '喷油': OIL_COLORS,
            'UV打印': UV_COLORS
          },
          sheenMap: {
            '喷油': SHEEN_OIL
          }
        };
      }
      if (PLASTIC_UV_TYPES.includes(materialType)) {
        return {
          primary: ['UV打印'],
          secondary: ['不做', 'UV打印'],
          colorMap: { 'UV打印': UV_COLORS },
          sheenMap: {}
        };
      }
      if (PLASTIC_CLEAR_TYPES.includes(materialType)) {
        return {
          primary: ['UV打印', '仅喷砂', '透明抛光'],
          secondary: ['不做', 'UV打印'],
          colorMap: {
            'UV打印': UV_COLORS,
            '仅喷砂': [],
            '透明抛光': []
          },
          sheenMap: {}
        };
      }
    }

    // 铜合金：表面处理1只有"仅喷砂"和"镜面抛光"，没有表面处理2
    if (materialCategory === '铜合金') {
      return {
        primary: ['仅喷砂', '镜面抛光'],
        secondary: ['不做'], // 没有表面处理2
        colorMap: {
          default: [],
          '仅喷砂': [],
          '镜面抛光': []
        },
        sheenMap: {}
      };
    }

    // 合金钢：表面处理1有"发黑"、"激光打标"、"拉丝"、"仅喷砂"，表面处理2和1一样
    if (materialCategory === '合金钢') {
      const alloySteelOptions = ['发黑', '激光打标', '拉丝', '仅喷砂'];
      return {
        primary: alloySteelOptions,
        secondary: ['不做', ...alloySteelOptions],
        colorMap: {
          default: [],
          '发黑': [],
          '激光打标': [],
          '拉丝': [],
          '仅喷砂': []
        },
        sheenMap: {}
      };
    }

    // 不锈钢：表面处理1有"激光打标"、"拉丝"、"仅喷砂"，表面处理2和1一样
    if (materialCategory === '不锈钢') {
      const stainlessSteelOptions = ['激光打标', '拉丝', '仅喷砂'];
      return {
        primary: stainlessSteelOptions,
        secondary: ['不做', ...stainlessSteelOptions],
        colorMap: {
          default: [],
          '激光打标': [],
          '拉丝': [],
          '仅喷砂': []
        },
        sheenMap: {}
      };
    }

    // 其他材质 fallback：仅“不做”
    return {
      primary: ['不做'],
      secondary: ['不做'],
      colorMap: { default: [] },
      sheenMap: {}
    };
  }

  function normalizeSurfaceTreatments(treatments, surfaceEnabled = true, rule = getSurfaceRule(getDefaultMaterialType(DEFAULT_MATERIAL_CATEGORY), DEFAULT_MATERIAL_CATEGORY)) {
    if (!surfaceEnabled) return [];
    const primaryList = rule.primary || ['不做'];
    const secondaryList = rule.secondary || ['不做'];
    const primaryColors = rule.colorMap?.default || [];
    const secondaryColors = rule.colorMap?.default || [];

    const primary = treatments && treatments[0] ? treatments[0] : {};
    const secondary = treatments && treatments[1] ? treatments[1] : {};

    const normPrimaryProcess = primaryList.includes(primary.process) ? primary.process : primaryList[0];
    const normSecondaryProcess = secondaryList.includes(secondary.process) ? secondary.process : secondaryList[0];

    const primaryColorOptions = rule.colorMap?.[normPrimaryProcess] ?? primaryColors;
    const secondaryColorOptions = rule.colorMap?.[normSecondaryProcess] ?? secondaryColors;

    const primarySheenOptions = rule.sheenMap?.[normPrimaryProcess] || [];
    const secondarySheenOptions = rule.sheenMap?.[normSecondaryProcess] || [];

    const normalizeColor = (val, opts) => (opts && opts.length ? (opts.includes(val) ? val : opts[0]) : '');
    const normalizeSheen = (val, opts) => (opts && opts.length ? (opts.includes(val) ? val : opts[0]) : '');

    const normalizedPrimary = {
      process: normPrimaryProcess,
      color: normalizeColor(primary.color, primaryColorOptions),
      sheen: normalizeSheen(primary.sheen, primarySheenOptions),
      allowedProcesses: primaryList,
      allowedColors: primaryColorOptions,
      allowedSheen: primarySheenOptions
    };

    const normalizedSecondary = {
      process: normSecondaryProcess,
      color: normalizeColor(secondary.color, secondaryColorOptions),
      sheen: normalizeSheen(secondary.sheen, secondarySheenOptions),
      allowedProcesses: secondaryList,
      allowedColors: secondaryColorOptions,
      allowedSheen: secondarySheenOptions
    };

    return [normalizedPrimary, normalizedSecondary];
  }

  function stringifySurfaceTreatments(treatments, surfaceEnabled = true) {
    if (!surfaceEnabled) return '无需表面处理';
    if (!treatments || treatments.length === 0) return '无需表面处理';
    return treatments.map(t => {
      if (!t.process || t.process === '不做') return '';
      const parts = [];
      if (t.process) parts.push(t.process);
      const detail = [t.color, t.sheen].filter(Boolean).join(' / ');
      if (detail) parts.push(`（${detail}）`);
      return parts.join('');
    }).filter(Boolean).join(' | ');
  }

  function renderSurfaceTreatments(config) {
    if (!surfaceListContainer) return;
    const category = config.materialCategory || DEFAULT_MATERIAL_CATEGORY;
    const type = config.material || getDefaultMaterialType(category);
    const rule = getSurfaceRule(type, category);
    const treatments = normalizeSurfaceTreatments(config.surfaceTreatments, config.surfaceEnabled !== false, rule);
    config.surfaceTreatments = treatments;

    surfaceListContainer.innerHTML = '';

    treatments.forEach((treatment, idx) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'surface-item';
      wrapper.style.display = 'flex';
      wrapper.style.gap = '8px';
      wrapper.style.alignItems = 'center';
      wrapper.style.marginBottom = '8px';

      const label = document.createElement('div');
      label.textContent = `表面处理${idx + 1}:`;
      label.style.minWidth = '88px';
      wrapper.appendChild(label);

      const processSelect = document.createElement('select');
      processSelect.className = 'config-select surface-process-select';
      const processOptions = idx === 0 ? rule.primary : rule.secondary;
      processOptions.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        processSelect.appendChild(option);
      });
      processSelect.value = treatment.process;
      processSelect.addEventListener('change', updateCurrentFileParameters);
      wrapper.appendChild(processSelect);

      const colorOptions = rule.colorMap?.[treatment.process] ?? rule.colorMap?.default ?? [];
      let colorSelect = null;
      if (colorOptions.length > 0) {
        colorSelect = document.createElement('select');
        colorSelect.className = 'config-select surface-color-select';
        colorOptions.forEach(opt => {
          const option = document.createElement('option');
          option.value = opt;
          option.textContent = opt;
          colorSelect.appendChild(option);
        });
        colorSelect.value = treatment.color;
        colorSelect.addEventListener('change', updateCurrentFileParameters);
        wrapper.appendChild(colorSelect);
      }

      const sheenOptions = rule.sheenMap?.[treatment.process] || [];
      if (sheenOptions.length > 0) {
        const sheenSelect = document.createElement('select');
        sheenSelect.className = 'config-select surface-sheen-select';
        sheenOptions.forEach(opt => {
          const option = document.createElement('option');
          option.value = opt;
          option.textContent = opt;
          sheenSelect.appendChild(option);
        });
        sheenSelect.value = sheenOptions.includes(treatment.sheen) ? treatment.sheen : sheenOptions[0];
        sheenSelect.addEventListener('change', updateCurrentFileParameters);
        wrapper.appendChild(sheenSelect);
      }

      surfaceListContainer.appendChild(wrapper);
    });
  }

  function collectSurfaceTreatmentsFromUI() {
    if (!surfaceListContainer) return [];
    const items = Array.from(surfaceListContainer.querySelectorAll('.surface-item'));
    return items.map((item, idx) => {
      const process = item.querySelector('.surface-process-select')?.value || '';
      const color = item.querySelector('.surface-color-select')?.value || '';
      const sheen = item.querySelector('.surface-sheen-select')?.value || '';
      const allowed = Array.from(item.querySelectorAll('.surface-process-select option')).map(o => o.value);
      return { process, color, sheen, allowedProcesses: allowed, idx };
    });
  }
  // 批量（选择集）——使用同一个"立即询价"按钮
  const selectedFileIds = new Set();
  let bulkAddBtn = null; // 不再渲染独立按钮，仅保留占位以兼容旧代码

  // 初始化
  function init() {
    console.log('Initializing 3D Model Uploader (Multi-File)...');
    
    // 获取DOM元素
    fileInput = document.getElementById('uploader-input');
    dropzone = document.getElementById('dropzone');
    modelViewer = document.getElementById('model-viewer');
    viewerContainer = document.getElementById('viewer-container');
    loadingIndicator = document.getElementById('loading-indicator');
    
    // 拦截原生的产品表单提交
    interceptNativeProductForms();
    errorMessage = document.getElementById('error-message');
    
    // 初始化Online3DViewer
    initAdvancedViewer();
    fileList = document.getElementById('file-list');
    fileItems = document.getElementById('file-items');
    materialCategorySelect = document.getElementById('material-category');
    materialSelect = document.getElementById('material-type');
    surfaceListContainer = document.getElementById('surface-list');
    surfaceToggleYes = document.querySelector('input[name="surface-enabled"][value="yes"]');
    surfaceToggleNo = document.querySelector('input[name="surface-enabled"][value="no"]');
    tightestSelect = document.getElementById('tightest-tolerance');
    roughnessSelect = document.getElementById('surface-roughness');
    hasThreadRadios = document.querySelectorAll('input[name="has-thread"]');
    hasAssemblyRadios = document.querySelectorAll('input[name="has-assembly-mark"]');
    noteTextarea = document.getElementById('note');
    charCount = document.getElementById('char-count');
    initializeMaterialSelectors();
    const initCategory = materialCategorySelect?.value || DEFAULT_MATERIAL_CATEGORY;
    const initType = materialSelect?.value || getDefaultMaterialType(initCategory);
    renderSurfaceTreatments({
      surfaceTreatments: [],
      surfaceEnabled: false,
      materialCategory: initCategory,
      material: initType
    });
    qtyInput = document.getElementById('qty');
    qtyMinus = document.getElementById('qty-minus');
    qtyPlus = document.getElementById('qty-plus');
    
    // 数量按钮事件
    if (qtyMinus) {
      qtyMinus.addEventListener('click', () => {
        const current = parseInt(qtyInput?.value || 1);
        if (current > 1) {
          qtyInput.value = current - 1;
          updateCurrentFileParameters();
        }
      });
    }
    if (qtyPlus) {
      qtyPlus.addEventListener('click', () => {
        const current = parseInt(qtyInput?.value || 1);
        qtyInput.value = current + 1;
        updateCurrentFileParameters();
      });
    }
    dimensionsDisplay = document.getElementById('dimensions-display');
    dimensionsValue = document.getElementById('dimensions-value');
    addToCartBtn = document.getElementById('add-to-cart');
    form = document.getElementById('add-form');

    // 不再创建"批量立即询价"按钮，统一用 addToCartBtn 处理所勾选文件
    bulkAddBtn = null;

    // 初始化3D查看器（若已启用高级查看器，则不再初始化基础Three.js查看器，避免冲突）
    if (!useAdvancedViewer) {
      initViewer();
    }

    // 绑定事件
    bindEvents();

    console.log('3D Model Uploader initialized successfully');
  }

  // 初始化Three.js查看器
  function initViewer() {
    if (!viewerContainer) {
      console.log('Viewer container not found, skipping 3D viewer initialization');
      return;
    }

    // 检查Three.js是否已加载
    if (typeof THREE === 'undefined') {
      console.log('Three.js not loaded, skipping 3D viewer initialization');
      return;
    }

    try {
      // 创建场景
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf8f9fa);

      // 创建相机
      camera = new THREE.PerspectiveCamera(75, viewerContainer.clientWidth / viewerContainer.clientHeight, 0.1, 1000);
      camera.position.set(5, 5, 5);

      // 创建渲染器
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(viewerContainer.clientWidth, viewerContainer.clientHeight);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      viewerContainer.appendChild(renderer.domElement);

      // 添加光源
      const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
      scene.add(ambientLight);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(10, 10, 5);
      directionalLight.castShadow = true;
      scene.add(directionalLight);

      // 添加控制器
      const controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;

      // 渲染循环
      function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      }
      animate();

      // 响应式处理
      window.addEventListener('resize', () => {
        const width = viewerContainer.clientWidth;
        const height = viewerContainer.clientHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
      });

      console.log('3D viewer initialized successfully');
    } catch (error) {
      console.error('Error initializing 3D viewer:', error);
    }
  }

  // 绑定事件
  function bindEvents() {
    console.log('Binding events...');
    
    // 文件上传
    if (fileInput) {
      console.log('File input found, binding change event');
      fileInput.addEventListener('change', handleFileSelect);
    } else {
      console.error('File input not found!');
    }

    if (dropzone) {
      console.log('Dropzone found, binding events');
      dropzone.addEventListener('click', () => {
        console.log('Dropzone clicked, triggering file input');
        if (fileInput) {
          fileInput.click();
        } else {
          console.error('File input not available');
        }
      });
      dropzone.addEventListener('dragover', handleDragOver);
      dropzone.addEventListener('dragleave', handleDragLeave);
      dropzone.addEventListener('drop', handleDrop);
    } else {
      console.error('Dropzone not found!');
    }

    // 参数变化事件
    bindParameterEvents();

    // 添加到购物车
    if (addToCartBtn) {
      addToCartBtn.addEventListener('click', handleAddToCart);
    }

    // 使删除文件函数全局可用
    window.removeFile = removeFile;
    window.selectFile = selectFile;
  }

  // 绑定参数变化事件
  function bindParameterEvents() {
    const parameterElements = [
      materialSelect, tightestSelect, roughnessSelect,
      qtyInput, noteTextarea
    ];

    parameterElements.forEach(element => {
      if (element) {
        if (element.type === 'range' || element.type === 'number') {
          element.addEventListener('input', updateCurrentFileParameters);
        } else {
          element.addEventListener('change', updateCurrentFileParameters);
        }
      }
    });

    if (materialCategorySelect) {
      materialCategorySelect.addEventListener('change', () => {
        const category = materialCategorySelect.value || DEFAULT_MATERIAL_CATEGORY;
        const nextType = refreshMaterialTypeOptions(category, null);
        if (materialSelect && nextType) {
          materialSelect.value = nextType;
        }
        const fileData = fileManager.files.get(fileManager.currentFileId);
        if (fileData) {
          fileData.config.materialCategory = category;
          fileData.config.material = nextType;
          fileData.config.surfaceTreatments = normalizeSurfaceTreatments(fileData.config.surfaceTreatments, fileData.config.surfaceEnabled !== false, getSurfaceRule(nextType, category));
          renderSurfaceTreatments(fileData.config);
        } else {
          renderSurfaceTreatments({ surfaceTreatments: [], surfaceEnabled: surfaceToggleYes?.checked, material: nextType, materialCategory: category });
        }
        updateCurrentFileParameters();
      });
    }

    // 单选按钮
    hasThreadRadios.forEach(radio => {
      radio.addEventListener('change', updateCurrentFileParameters);
    });

    hasAssemblyRadios.forEach(radio => {
      radio.addEventListener('change', updateCurrentFileParameters);
    });

    if (surfaceToggleYes) {
      surfaceToggleYes.addEventListener('change', () => {
        handleSurfaceToggle(true);
      });
    }
    if (surfaceToggleNo) {
      surfaceToggleNo.addEventListener('change', () => {
        handleSurfaceToggle(false);
      });
    }

    // 备注字符计数
    if (noteTextarea) {
      noteTextarea.addEventListener('input', updateCharCount);
    }
  }

  // 处理文件选择
  function handleFileSelect(event) {
    console.log('File select event triggered');
    const files = Array.from(event.target.files);
    console.log('Selected files:', files);
    processFiles(files);
  }

  // 处理拖拽
  function handleDragOver(event) {
    event.preventDefault();
    dropzone.classList.add('dragover');
  }

  function handleDragLeave(event) {
    event.preventDefault();
    dropzone.classList.remove('dragover');
  }

  function handleDrop(event) {
    event.preventDefault();
    dropzone.classList.remove('dragover');
    const files = Array.from(event.dataTransfer.files);
    console.log('Dropped files:', files);
    processFiles(files);
  }

  // 处理文件
  async function processFiles(files) {
    if (files.length === 0) return;

    showLoading(true);
    // 不在这里隐藏错误，让验证函数决定是否显示错误

    try {
      let processedCount = 0;
      let errorCount = 0;
      const errors = [];

      for (const file of files) {
        try {
          await processSingleFile(file);
          processedCount++;
        } catch (error) {
          errorCount++;
          errors.push(`${file.name}: ${error.message}`);
        }
      }

      // 显示处理结果
      console.log('processFiles completed, processedCount:', processedCount, 'errorCount:', errorCount);
      if (processedCount > 0) {
        console.log('Calling showSuccess and setTimeout for displayFileList');
        showSuccess(`成功处理 ${processedCount} 个文件！`);
        console.log('showSuccess called, now setting timeout');
        // 延迟显示文件列表，确保DOM元素准备好
        setTimeout(() => {
          console.log('setTimeout callback executed, calling displayFileList');
          displayFileList();
          // 文件列表显示后再验证配置
          if (fileManager.currentFileId) {
            const currentFileData = fileManager.files.get(fileManager.currentFileId);
            if (currentFileData) {
              validateFileConfiguration(currentFileData);
              // 注意：不要在此处无条件启用按钮，保持由验证结果控制
            }
          }
        }, 100);
        // 移除：不要无条件启用立即询价按钮
        // enableAddToCart();
      }

      if (errorCount > 0) {
        showWarning(`有 ${errorCount} 个文件处理失败：\n${errors.join('\n')}`);
      }

      showLoading(false);
    } catch (error) {
      console.error('Error processing files:', error);
      showError(error.message);
      showLoading(false);
    }
  }

  // 处理单个文件
  async function processSingleFile(file) {
    console.log('Processing file:', file.name);

    // 检查STL文件并直接拒绝
    if (file.name.toLowerCase().endsWith('.stl')) {
      throw new Error(`文件"${file.name}"是STL格式，系统仅支持STP/STEP格式文件。STL文件无法转换为STEP文件，请重新导出为STP/STEP格式`);
    }

    // 检查文件类型
    if (file.name.toLowerCase().endsWith('.zip')) {
      return await processZipFile(file);
    } else if (isValidFile(file)) {
      return await processRegularFile(file);
    } else {
      throw new Error('不支持的文件格式，仅支持STP/STEP格式文件以及对应的2D图纸（DWG/DXF/PDF）');
    }
  }

  // 处理ZIP文件
  async function processZipFile(zipFile) {
    return new Promise((resolve, reject) => {
      console.log('Processing ZIP file:', zipFile.name);
      
      const reader = new FileReader();
      
      reader.onload = async function(e) {
        try {
          // 使用JSZip库解压
      if (typeof JSZip === 'undefined') {
            throw new Error('ZIP解压功能需要加载JSZip库，请刷新页面重试');
      }
      
          console.log('Loading ZIP with JSZip...');
      const zip = new JSZip();
          const zipData = await zip.loadAsync(e.target.result);
      
          console.log('ZIP loaded, extracting files...');
          let extractedCount = 0;
      const extractedFiles = [];
          const skippedFiles = [];
      
          // 解压所有文件
          for (const [relativePath, zipEntry] of Object.entries(zipData.files)) {
        if (!zipEntry.dir) {
              if (isValidFileName(relativePath)) {
                try {
                  const fileData = await zipEntry.async('blob');
                  const extractedFile = new File([fileData], relativePath, { type: getMimeType(relativePath) });
                  extractedFiles.push(extractedFile);
                  extractedCount++;
                  console.log('Extracted file:', relativePath);
                } catch (extractError) {
                  console.warn('Failed to extract file:', relativePath, extractError);
                  skippedFiles.push(relativePath);
                }
              } else {
                skippedFiles.push(relativePath);
              }
            }
          }

          console.log(`Extracted ${extractedCount} files, skipped ${skippedFiles.length} files`);

          if (extractedCount === 0) {
            throw new Error(`ZIP文件中没有找到有效的3D模型文件。支持格式：STP, STEP, STL, OBJ, 3MF, IGES, DWG, DXF, PDF`);
          }

          // 处理解压出的文件
          for (const extractedFile of extractedFiles) {
            await processRegularFile(extractedFile);
          }

          // 显示处理结果
          if (skippedFiles.length > 0) {
            showWarning(`ZIP文件处理完成！成功提取 ${extractedCount} 个文件，跳过 ${skippedFiles.length} 个不支持的文件。`);
          } else {
            showSuccess(`ZIP文件处理完成！成功提取 ${extractedCount} 个文件。`);
          }

        resolve();
        } catch (error) {
          console.error('Error processing ZIP:', error);
          reject(error);
        }
      };

      reader.onerror = () => {
        console.error('Failed to read ZIP file');
        reject(new Error('读取ZIP文件失败，请检查文件是否损坏'));
      };
      
      reader.readAsArrayBuffer(zipFile);
    });
  }

  // 处理常规文件
  async function processRegularFile(file) {
    const fileId = fileManager.nextFileId++;
    const fileConfig = createDefaultFileConfig();
    
    // 存储文件
    fileManager.files.set(fileId, {
      id: fileId,
      file: file,
      config: fileConfig,
      dimensions: null,
      model: null
    });

    // 如果是第一个文件，设为当前文件
    if (!fileManager.currentFileId) {
      fileManager.currentFileId = fileId;
      // 立即显示文件列表，不等待3D可视化完成
      setTimeout(() => {
        try { displayFileList(); } catch (_) {}
      }, 50);
      // 异步加载3D模型，不阻塞文件列表显示
      try {
        loadModelForFile(fileId).catch((err) => console.error('Async loadModelForFile error:', err));
      } catch (e) {
        console.error('Failed to start async loadModelForFile:', e);
      }
    }

    return fileId;
  }

  // 创建默认文件配置
  function createDefaultFileConfig() {
    return {
      unit: 'mm',
      materialCategory: DEFAULT_MATERIAL_CATEGORY,
      material: getDefaultMaterialType(DEFAULT_MATERIAL_CATEGORY),
      surfaceEnabled: false,
      surfaceTreatments: [],
      tightest: 'GB/T 1804-2000 m级',
      roughness: 'Ra3.2',
      hasThread: 'no',
      hasAssembly: 'no',
      quantity: 1,
      note: ''
    };
  }

  // 为文件加载3D模型
  async function loadModelForFile(fileId) {
    const fileData = fileManager.files.get(fileId);
    if (!fileData) return;

    try {
      // 如果是2D文件，不需要加载3D模型，直接显示占位符
      if (is2DFile(fileData.file.name)) {
        console.log('2D file selected, showing placeholder');
        updateDimensionsDisplay();
        showViewerPlaceholder(fileData);
        return;
      }

      // 优先使用高级查看器加载STP/STEP文件
      if (useAdvancedViewer && o3dvWrapper && is3DFile(fileData.file.name)) {
        console.log('Using advanced viewer for STP/STEP file');
        // 如果当前模型相同，直接返回，避免重新加载
        if (o3dvWrapper.currentModel && o3dvWrapper.currentModel.name === fileData.file.name) {
          console.log('Same model already loaded, skipping reload');
          updateDimensionsDisplay();
          return;
        }
        console.log('Calling loadSTPWithAdvancedViewer and waiting for result');
        await loadSTPWithAdvancedViewer(fileData.file);
        console.log('loadSTPWithAdvancedViewer completed');
        return;
      }

      // 如果没有Three.js，使用模拟数据
      if (typeof THREE === 'undefined' || !scene) {
        console.log('Three.js not available, using simulated model data');
        
        // 模拟尺寸数据
        fileData.dimensions = {
          width: 39.0 + Math.random() * 20,
          height: 22.0 + Math.random() * 10,
          depth: 12.75 + Math.random() * 5
        };

        updateDimensionsDisplay();
        showViewerPlaceholder(fileData);
        return;
      }

      // 尝试加载3D模型（基础查看器，仅作占位显示）
      const loader = new THREE.STLLoader();
      
      loader.load(
        URL.createObjectURL(fileData.file),
        (geometry) => {
          // 清除之前的模型
          if (fileData.model) {
            scene.remove(fileData.model);
          }

          // 计算尺寸
          geometry.computeBoundingBox();
          const box = geometry.boundingBox;
          fileData.dimensions = {
            width: box.max.x - box.min.x,
            height: box.max.y - box.min.y,
            depth: box.max.z - box.min.z
          };

          // 创建材质
          const material = new THREE.MeshLambertMaterial({ 
            color: 0x888888,
            transparent: true,
            opacity: 0.8
          });

          // 创建网格
          fileData.model = new THREE.Mesh(geometry, material);
          fileData.model.castShadow = true;
          fileData.model.receiveShadow = true;

          // 居中模型
          const center = box.getCenter(new THREE.Vector3());
          fileData.model.position.sub(center);

          // 添加到场景
          scene.add(fileData.model);

          // 调整相机位置
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          camera.position.set(maxDim * 2, maxDim * 2, maxDim * 2);
          camera.lookAt(0, 0, 0);

          // 更新尺寸显示
          updateDimensionsDisplay();

          // 显示查看器
          showViewer();
        },
        undefined,
        (error) => {
          console.error('Error loading model:', error);
          // 使用模拟数据
          fileData.dimensions = {
            width: 39.0 + Math.random() * 20,
            height: 22.0 + Math.random() * 10,
            depth: 12.75 + Math.random() * 5
          };
          updateDimensionsDisplay();
          showViewerPlaceholder(fileData);
        }
      );
    } catch (error) {
      console.error('Error in loadModelForFile:', error);
      // 使用模拟数据
      fileData.dimensions = {
        width: 39.0 + Math.random() * 20,
        height: 22.0 + Math.random() * 10,
        depth: 12.75 + Math.random() * 5
      };
      updateDimensionsDisplay();
      showViewerPlaceholder(fileData);
    }
  }

  // 显示文件列表
  function displayFileList() {
    console.log('displayFileList called, fileManager.files.size:', fileManager.files.size);
    console.log('fileList:', fileList, 'fileItems:', fileItems);
    
    if (!fileList || !fileItems) {
      console.error('fileList or fileItems not found! Retrying in 100ms...');
      // 如果DOM元素不存在，延迟重试
      setTimeout(() => {
        displayFileList();
      }, 100);
      return;
    }
    
    if (fileManager.files.size === 0) {
      console.log('No files, hiding file list');
      fileList.style.display = 'none';
      selectedFileIds.clear();
      updateBulkButtonState();
      return;
    }
    
    console.log('Showing file list with', fileManager.files.size, 'files');
    fileList.style.display = 'block';
    fileItems.innerHTML = '';
    
    // 显示所有文件：3D文件独立显示，2D文件显示在对应3D文件下方，孤儿2D文件也显示
    fileManager.files.forEach((fileData, fileId) => {
      if (is3DFile(fileData.file.name)) {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        
        // 查找对应的2D文件
        const corresponding2DFiles = getCorresponding2DFiles(fileId);
        console.log(`3D文件 ${fileData.file.name} 对应的2D文件:`, corresponding2DFiles.map(f => f.name));
        const has2DIndicator = corresponding2DFiles.length > 0 ? 
          `<div class="file-2d-indicator">📄 已上传2D图纸: ${corresponding2DFiles.map(f => f.name).join(', ')}</div>` : '';
        
        const checkedAttr = selectedFileIds.has(fileId) ? 'checked' : '';
        fileItem.innerHTML = `
            <div class="file-info">
          <label style="display:flex;align-items:center;gap:8px;">
            <input type="checkbox" ${checkedAttr} onchange="toggleFileSelection(${fileId}, this.checked)">
            <span class="file-name">${fileData.file.name}</span>
          </label>
          <span class="file-size">${formatFileSize(fileData.file.size)}</span>
          ${fileData.dimensions ? `<span class="file-dimensions">${fileData.dimensions.width.toFixed(1)} x ${fileData.dimensions.height.toFixed(1)} x ${fileData.dimensions.depth.toFixed(1)} mm</span>` : ''}
      </div>
            <div class="file-actions">
          <button type="button" class="file-select" data-file-id="${fileId}" ${fileId === fileManager.currentFileId ? 'style="background: #1976d2; color: white;"' : ''}>选择</button>
          <button type="button" class="file-delete" data-file-id="${fileId}">删除</button>
          </div>
          ${has2DIndicator}
        `;
        
        // 绑定事件处理器
        const selectBtn = fileItem.querySelector('.file-select');
        const deleteBtn = fileItem.querySelector('.file-delete');
        if (selectBtn) {
          selectBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const id = parseInt(selectBtn.dataset.fileId, 10);
            console.log('点击选择按钮，fileId:', id, '类型:', typeof id);
            selectFile(id);
          });
        }
        if (deleteBtn) {
          deleteBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const id = parseInt(deleteBtn.dataset.fileId, 10);
            console.log('点击删除按钮，fileId:', id, '类型:', typeof id);
            removeFile(id);
          });
        }
        console.log('Created file item for:', fileData.file.name);
        fileItems.appendChild(fileItem);
        console.log('Appended file item to fileItems, fileItems.children.length:', fileItems.children.length);
      }
    });
    
    // 显示孤儿2D文件（没有对应3D文件的2D文件）
    fileManager.files.forEach((fileData, fileId) => {
      if (is2DFile(fileData.file.name)) {
        // 检查是否有对应的3D文件
        let hasCorresponding3D = false;
        for (const [otherFileId, otherFileData] of fileManager.files) {
          if (otherFileId !== fileId && is3DFile(otherFileData.file.name)) {
            const corresponding2DFiles = getCorresponding2DFiles(otherFileId);
            if (corresponding2DFiles.some(f => f.id === fileId)) {
              hasCorresponding3D = true;
              break;
            }
          }
        }
        
        // 如果没有对应的3D文件，显示这个孤儿2D文件
        if (!hasCorresponding3D) {
          console.log(`孤儿2D文件: ${fileData.file.name}`);
          const fileItem = document.createElement('div');
          fileItem.className = 'file-item orphan-2d';
          fileItem.innerHTML = `
            <div class="file-info">
              <span class="file-name">${fileData.file.name}</span>
              <span class="file-size">${formatFileSize(fileData.file.size)}</span>
              <span class="file-type">2D图纸</span>
            </div>
            <div class="file-actions">
              <button type="button" class="file-select" data-file-id="${fileId}" ${fileId === fileManager.currentFileId ? 'style="background: #1976d2; color: white;"' : ''}>选择</button>
              <button type="button" class="file-delete" data-file-id="${fileId}">删除</button>
            </div>
            <div class="file-warning">⚠️ 此2D文件缺少对应的3D文件</div>
          `;
          
          // 绑定事件处理器
          const selectBtn = fileItem.querySelector('.file-select');
          const deleteBtn = fileItem.querySelector('.file-delete');
          if (selectBtn) {
            selectBtn.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              const id = parseInt(selectBtn.dataset.fileId, 10);
              console.log('点击选择按钮（2D），fileId:', id, '类型:', typeof id);
              selectFile(id);
            });
          }
          if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              const id = parseInt(deleteBtn.dataset.fileId, 10);
              console.log('点击删除按钮（2D），fileId:', id, '类型:', typeof id);
              removeFile(id);
            });
          }
          fileItems.appendChild(fileItem);
        }
      }
    });
    
    console.log('displayFileList completed, final fileItems.children.length:', fileItems.children.length);
    console.log('fileList.style.display:', fileList.style.display);
    console.log('fileList.offsetHeight:', fileList.offsetHeight);

    // 更新提交按钮状态（基于勾选及校验）
    updateBulkButtonState();
  }

  // 获取对应3D文件的2D文件列表
  function getCorresponding2DFiles(threeDFileId) {
    const threeDFileData = fileManager.files.get(threeDFileId);
    if (!threeDFileData || !is3DFile(threeDFileData.file.name)) {
      return [];
    }

    const corresponding2DFiles = [];
    const baseName = threeDFileData.file.name.replace(/\.[^/.]+$/, '').toLowerCase()
      .replace(/[_\-\s]+/g, '')
      .replace(/[^\u4e00-\u9fa5a-z0-9]/g, '');
    
    for (const [fileId, fileData] of fileManager.files) {
      if (is2DFile(fileData.file.name)) {
        const twoDBaseName = fileData.file.name.replace(/\.[^/.]+$/, '').toLowerCase()
          .replace(/[_\-\s]+/g, '')
          .replace(/[^\u4e00-\u9fa5a-z0-9]/g, '');
        
        // 更精确的文件关联匹配
        if (twoDBaseName === baseName || 
            (baseName.length > 3 && twoDBaseName.includes(baseName)) || 
            (twoDBaseName.length > 3 && baseName.includes(twoDBaseName)) ||
            (baseName.length > 5 && twoDBaseName.length > 5 && hasCommonKeywords(baseName, twoDBaseName))) {
          corresponding2DFiles.push({
            id: fileId,
            name: fileData.file.name,
            size: fileData.file.size
          });
        }
      }
    }
    
    return corresponding2DFiles;
  }

  // 选择文件
  function selectFile(fileId) {
    // 确保 fileId 是数字类型
    const numericFileId = typeof fileId === 'string' ? parseInt(fileId, 10) : fileId;
    
    if (!fileManager.files.has(numericFileId)) {
      console.warn('selectFile: 文件不存在', numericFileId, '所有文件ID:', Array.from(fileManager.files.keys()));
      return;
    }

    console.log('选择文件:', numericFileId, '类型:', typeof numericFileId, '当前文件:', fileManager.currentFileId);

    // 先保存当前文件的配置（如果正在编辑其他文件）
    if (fileManager.currentFileId && fileManager.currentFileId !== numericFileId) {
      console.log('保存当前文件配置:', fileManager.currentFileId);
      updateCurrentFileParameters();
    }

    fileManager.currentFileId = numericFileId;
    const fileData = fileManager.files.get(numericFileId);
    
    if (!fileData) {
      console.error('selectFile: 文件数据不存在', numericFileId);
      return;
    }
    
    console.log('加载文件配置:', numericFileId, fileData.config);
    
    // 更新参数显示（加载该文件的配置）
    // 使用标志位防止在加载配置时触发保存
    window._isLoadingFileConfig = true;
    try {
      updateParameterDisplay(fileData.config);
    } finally {
      window._isLoadingFileConfig = false;
    }
    
    // 加载模型
    loadModelForFile(numericFileId);
    
    // 验证当前文件配置
    validateFileConfiguration(fileData);
    
    // 更新文件列表显示
    displayFileList();
  }

  // 切换复选框选择
  function toggleFileSelection(fileId, checked) {
    if (!fileManager.files.has(fileId)) return;
    const fileData = fileManager.files.get(fileId);
    if (!is3DFile(fileData.file.name)) return; // 仅3D参与询价
    if (checked) {
      selectedFileIds.add(fileId);
    } else {
      selectedFileIds.delete(fileId);
    }
    updateBulkButtonState();
  }
  window.toggleFileSelection = toggleFileSelection;

  function updateBulkButtonState() {
    // 统一控制 addToCartBtn
    if (!addToCartBtn) return;
    const noneSelected = selectedFileIds.size === 0;
    addToCartBtn.disabled = true;
    if (noneSelected) return;
    // 验证所有选择的文件都满足条件
    const invalid = Array.from(selectedFileIds).some((id) => {
      const fd = fileManager.files.get(id);
      if (!fd) return true;
      if (!is3DFile(fd.file.name)) return true; // 只允许3D
      const need2D = fd.config && (fd.config.hasThread === 'yes' || fd.config.hasAssembly === 'yes');
      if (need2D && !hasCorresponding2DFile(id)) return true;
      
      // 检查UV打印和激光打标是否需要2D图纸
      if (fd.config && fd.config.surfaceEnabled !== false && fd.config.surfaceTreatments) {
        const rule = getSurfaceRule(fd.config.material, fd.config.materialCategory);
        const surfaceTexts = normalizeSurfaceTreatments(fd.config.surfaceTreatments, true, rule);
        const hasUV = surfaceTexts.some(t => t.process === 'UV打印');
        const hasLaserMarking = surfaceTexts.some(t => t.process === '激光打标');
        if ((hasUV || hasLaserMarking) && !hasCorresponding2DFile(id)) return true;
      }
      return false;
    });
    addToCartBtn.disabled = invalid;
  }

  async function handleBulkAddToCart() {
    // 已废弃独立按钮逻辑，改为走 handleAddToCart
    handleAddToCart();
  }

  // 删除文件
  function removeFile(fileId) {
    // 确保 fileId 是数字类型
    const numericFileId = typeof fileId === 'string' ? parseInt(fileId, 10) : fileId;
    
    if (!fileManager.files.has(numericFileId)) {
      console.warn('removeFile: 文件不存在', numericFileId, '所有文件ID:', Array.from(fileManager.files.keys()));
      return;
    }
    
    console.log('删除文件:', numericFileId, '类型:', typeof numericFileId);

    const fileData = fileManager.files.get(numericFileId);
    
    // 从场景中移除模型
    if (fileData.model && scene) {
      scene.remove(fileData.model);
    }

    // 从文件管理器中移除
    fileManager.files.delete(numericFileId);

    // 从批量选择中移除
    selectedFileIds.delete(numericFileId);

    // 如果删除的是当前文件，选择另一个文件
    if (numericFileId === fileManager.currentFileId) {
      if (fileManager.files.size > 0) {
        const firstFileId = fileManager.files.keys().next().value;
        selectFile(firstFileId);
      } else {
        fileManager.currentFileId = null;
        clearViewer();
        disableAddToCart();
      }
    }

    displayFileList();
    updateBulkButtonState();
    
    // 重新验证所有文件配置
    if (fileManager.files.size > 0) {
      const currentFileData = fileManager.files.get(fileManager.currentFileId);
      if (currentFileData) {
        validateFileConfiguration(currentFileData);
      }
    } else {
      // 如果没有文件了，隐藏错误消息
      hideError();
    }
  }

  // 更新当前文件的参数
  function handleSurfaceToggle(enabled) {
    const fileData = fileManager.files.get(fileManager.currentFileId);
    if (fileData) {
      fileData.config.surfaceEnabled = enabled;
      if (!enabled) {
        fileData.config.surfaceTreatments = [];
      } else {
        const rule = getSurfaceRule(fileData.config.material, fileData.config.materialCategory);
        fileData.config.surfaceTreatments = normalizeSurfaceTreatments(fileData.config.surfaceTreatments, true, rule);
      }
      renderSurfaceTreatments(fileData.config);
      updateCurrentFileParameters();
    } else {
      renderSurfaceTreatments({ surfaceTreatments: [], surfaceEnabled: enabled });
      updateCurrentFileParameters();
    }
    if (surfaceListContainer) {
      surfaceListContainer.style.display = enabled ? 'block' : 'none';
    }
  }

  function updateCurrentFileParameters() {
    // 如果正在加载文件配置，不执行保存操作
    if (window._isLoadingFileConfig) {
      console.log('跳过保存：正在加载文件配置');
      return;
    }

    if (!fileManager.currentFileId) {
      console.log('跳过保存：没有当前文件');
      return;
    }

    const fileData = fileManager.files.get(fileManager.currentFileId);
    if (!fileData) {
      console.log('跳过保存：文件数据不存在');
      return;
    }

    console.log('保存文件配置:', fileManager.currentFileId, fileData.file.name);

    // 更新配置
    fileData.config.unit = document.querySelector('input[name="unit"]:checked')?.value || 'mm';
    const selectedCategory = materialCategorySelect?.value || DEFAULT_MATERIAL_CATEGORY;
    // 根据类别刷新材料选项，确保类型有效
    const ensuredType = refreshMaterialTypeOptions(selectedCategory, materialSelect?.value);
    fileData.config.materialCategory = selectedCategory;
    fileData.config.material = ensuredType || getDefaultMaterialType(selectedCategory);
    const rule = getSurfaceRule(fileData.config.material, fileData.config.materialCategory);
    // 表面处理（可选，固定两项）
    fileData.config.surfaceEnabled = surfaceToggleYes?.checked ? true : surfaceToggleNo?.checked ? false : fileData.config.surfaceEnabled !== false;
    fileData.config.surfaceTreatments = normalizeSurfaceTreatments(
      collectSurfaceTreatmentsFromUI(),
      fileData.config.surfaceEnabled,
      rule
    );
      renderSurfaceTreatments(fileData.config);
    fileData.config.tightest = tightestSelect?.value || 'GB/T 1804-2000 m级';
    fileData.config.roughness = roughnessSelect?.value || 'Ra3.2';
    fileData.config.hasThread = document.querySelector('input[name="has-thread"]:checked')?.value || 'no';
    fileData.config.hasAssembly = document.querySelector('input[name="has-assembly-mark"]:checked')?.value || 'no';
    fileData.config.quantity = parseInt(qtyInput?.value || 1);
    fileData.config.note = noteTextarea?.value || '';

    console.log('已保存配置:', fileData.config);

    // 执行智能验证（仅用于显示提示）
    validateFileConfiguration(fileData);

    // 更新尺寸显示
    updateDimensionsDisplay();

    // 变更参数后，基于勾选集合重新判断按钮可用
    updateBulkButtonState();
  }

  // 智能验证文件配置
  function validateFileConfiguration(fileData) {
    const warnings = [];
    const errors = [];

    // 检查文件格式 - 只允许STP文件
    if (fileData.file && fileData.file.name.toLowerCase().endsWith('.stl')) {
      const fileName = fileData.file.name;
      errors.push(`❌ 文件"${fileName}"是STL格式，系统仅支持STP/STEP格式文件。STL文件无法转换为STEP文件，请重新导出为STP/STEP格式`);
    }

    // 当选择有螺纹/装配关系时，必须有对应2D
    if (fileData && fileData.config) {
      const need2D = fileData.config.hasThread === 'yes' || fileData.config.hasAssembly === 'yes';
      const rule = getSurfaceRule(fileData.config.material, fileData.config.materialCategory);
      const surfaceTexts = normalizeSurfaceTreatments(fileData.config.surfaceTreatments, fileData.config.surfaceEnabled !== false, rule);
      const hasUV = (fileData.config.surfaceEnabled !== false) && surfaceTexts.some(t => t.process === 'UV打印');
      if (need2D) {
        const has2D = hasCorresponding2DFile(fileManager.currentFileId);
        if (!has2D) {
          const reason = fileData.config.hasThread === 'yes' ? '螺纹' : (fileData.config.hasAssembly === 'yes' ? '装配关系' : '特殊要求');
          errors.push(`❌ 文件"${fileData.file.name}"已选择有${reason}，但缺少对应的2D图纸（DWG/DXF/PDF）`);
        }
      }
      const hasLaserMarking = (fileData.config.surfaceEnabled !== false) && surfaceTexts.some(t => t.process === '激光打标');
      if (hasUV) {
        const has2D = hasCorresponding2DFile(fileManager.currentFileId);
        if (!has2D) {
          errors.push(`❌ 文件"${fileData.file.name}"选择了UV打印，但缺少对应的2D图纸（DWG/DXF/PDF）。`);
        }
      }
      if (hasLaserMarking) {
        const has2D = hasCorresponding2DFile(fileManager.currentFileId);
        if (!has2D) {
          errors.push(`❌ 文件"${fileData.file.name}"选择了激光打标，但缺少对应的2D图纸（DWG/DXF/PDF）。`);
        }
      }
    }

    // 尺寸、数量等原有检查保留（若存在）
    
    // 只检查当前选中的3D文件格式
    if (fileManager.currentFileId && fileData.file) {
      if (!isValidFile(fileData.file)) {
        errors.push(`❌ 文件"${fileData.file.name}"格式不支持`);
      }
    }

    // 展示并控制按钮状态
    if (errors.length > 0) {
      showError(errors.join('\n'));
      disableAddToCart();
    } else if (warnings.length > 0) {
      showWarning(warnings.join('\n'));
      // 有警告仍可询价
      enableAddToCart();
    } else {
      hideError();
      enableAddToCart();
    }
  }

  // 检查是否是2D文件
  function is2DFile(fileName) {
    const twoDExtensions = ['.dwg', '.dxf', '.pdf'];
    return twoDExtensions.some(ext => fileName.toLowerCase().endsWith(ext));
  }

  // 检查是否是3D文件（仅支持STP/STEP格式）
  function is3DFile(fileName) {
    const threeDExtensions = ['.stp', '.step'];
    return threeDExtensions.some(ext => fileName.toLowerCase().endsWith(ext));
  }

  function isStepFile(fileName) {
    const lower = (fileName || '').toLowerCase();
    return lower.endsWith('.stp') || lower.endsWith('.step');
  }

  async function analyzeStepMachiningFeatures(apiBase, fileUrl, fileName, attempt = 1) {
    if (!fileUrl || !isStepFile(fileName)) {
      return null;
    }

    try {
      console.log('🔍 STEP 加工特征分析:', fileName, attempt > 1 ? `(重试 ${attempt})` : '');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000);

      const resp = await fetch(`${apiBase}/analyze-step-features`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileUrl, fileName }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const json = await resp.json();
      if (!resp.ok || !json.success) {
        const msg = json.message || `HTTP ${resp.status}`;
        const retryable = attempt < 2 && (resp.status === 503 || /503|隧道离线|non-JSON/i.test(msg));
        if (retryable) {
          console.warn('⚠️ 特征分析临时失败，3 秒后重试:', msg);
          await new Promise((resolve) => setTimeout(resolve, 3000));
          return analyzeStepMachiningFeatures(apiBase, fileUrl, fileName, attempt + 1);
        }
        console.warn('⚠️ 特征分析未成功:', msg);
        return {
          status: 'failed',
          error: msg,
          hint: resp.status === 504 || /timeout|timed out/i.test(msg)
            ? '分析超时：请确认 Palmetto 与 ngrok 在运行，或模型面数过多'
            : (resp.status === 503 ? 'Palmetto 服务不可达，请检查 ngrok 与 PALMETTO_SERVICE_URL' : ''),
        };
      }

      console.log('✅ 特征分析完成:', json.features?.summary, json.features?.insights);
      return json;
    } catch (error) {
      const isAbort = error.name === 'AbortError';
      if (!isAbort && attempt < 2) {
        console.warn('⚠️ 特征分析请求失败，3 秒后重试:', error.message);
        await new Promise((resolve) => setTimeout(resolve, 3000));
        return analyzeStepMachiningFeatures(apiBase, fileUrl, fileName, attempt + 1);
      }
      console.warn('⚠️ 特征分析请求失败:', error.message);
      return {
        status: 'failed',
        error: isAbort ? '分析请求超时（90秒）' : error.message,
        hint: isAbort
          ? '大模型可能超过 Vercel 60 秒限制，请保持 Palmetto 本地运行或升级部署'
          : '',
      };
    }
  }

  function buildMachiningFeatureAttributes(analysisResult) {
    const features = analysisResult?.features;
    if (!features) {
      const attrs = [
        { key: '加工特征状态', value: '解析失败' },
      ];
      if (analysisResult?.error) {
        attrs.push({ key: '加工特征错误', value: String(analysisResult.error).slice(0, 250) });
      }
      if (analysisResult?.hint) {
        attrs.push({ key: '解析提示', value: String(analysisResult.hint).slice(0, 250) });
      }
      return attrs;
    }

    const statusText = features.statusLabel || features.status || 'unknown';
    const attrs = [
      { key: '加工特征状态', value: statusText },
      { key: '孔数量', value: String(features.summary?.holeCount ?? 0) },
      { key: '型腔数量', value: String(features.summary?.cavityCount ?? 0) },
      { key: '圆角数量', value: String(features.summary?.filletCount ?? 0) },
      { key: '轴凸台数量', value: String(features.summary?.shaftCount ?? 0) },
      { key: '需人工复核', value: features.requiresManualReview ? '是' : '否' },
    ];

    if (Array.isArray(features.reviewReasons) && features.reviewReasons.length > 0) {
      attrs.push({ key: '复核原因', value: features.reviewReasons.join(', ') });
    }
    if (analysisResult.shopifySummary) {
      attrs.push({ key: '加工特征摘要', value: analysisResult.shopifySummary });
    }

    const detailAttrs = analysisResult.shopifyDetailAttributes || [];
    for (const item of detailAttrs) {
      if (item?.key && item?.value != null) {
        attrs.push({ key: item.key, value: String(item.value) });
      }
    }

    return attrs;
  }

  // 检查3D文件是否有对应的2D文件
  function hasCorresponding2DFile(threeDFileId) {
    const threeDFileData = fileManager.files.get(threeDFileId);
    if (!threeDFileData || !is3DFile(threeDFileData.file.name)) {
      return false;
    }

    // 获取3D文件的基础名称（去掉扩展名和特殊字符）
    const baseName = threeDFileData.file.name.replace(/\.[^/.]+$/, '').toLowerCase()
      .replace(/[_\-\s]+/g, '') // 移除下划线、连字符、空格
      .replace(/[^\u4e00-\u9fa5a-z0-9]/g, ''); // 只保留中文、字母、数字
    
    // 检查是否有对应的2D文件
    for (const [fileId, fileData] of fileManager.files) {
      if (is2DFile(fileData.file.name)) {
        const twoDBaseName = fileData.file.name.replace(/\.[^/.]+$/, '').toLowerCase()
          .replace(/[_\-\s]+/g, '') // 移除下划线、连字符、空格
          .replace(/[^\u4e00-\u9fa5a-z0-9]/g, ''); // 只保留中文、字母、数字
        
        // 检查文件名是否匹配（支持多种匹配方式）
        if (twoDBaseName === baseName || 
            twoDBaseName.includes(baseName) || 
            baseName.includes(twoDBaseName) ||
            // 检查是否包含相同的关键词
            hasCommonKeywords(baseName, twoDBaseName)) {
          return true;
        }
      }
    }
    
    return false;
  }

  // 检查两个文件名是否有共同的关键词
  function hasCommonKeywords(name1, name2) {
    // 提取中文关键词
    const chineseWords1 = name1.match(/[\u4e00-\u9fa5]+/g) || [];
    const chineseWords2 = name2.match(/[\u4e00-\u9fa5]+/g) || [];
    
    // 检查是否有共同的中文词
    for (const word1 of chineseWords1) {
      for (const word2 of chineseWords2) {
        if (word1 === word2 && word1.length >= 2) {
          return true;
        }
      }
    }
    
    // 提取英文关键词
    const englishWords1 = name1.match(/[a-z]+/g) || [];
    const englishWords2 = name2.match(/[a-z]+/g) || [];
    
    // 检查是否有共同的英文词
    for (const word1 of englishWords1) {
      for (const word2 of englishWords2) {
        if (word1 === word2 && word1.length >= 3) {
          return true;
        }
      }
    }
    
    return false;
  }

  // 更新参数显示
  function updateParameterDisplay(config) {
    // 更新单位
    const unitRadios = document.querySelectorAll('input[name="unit"]');
    unitRadios.forEach(radio => {
      radio.checked = radio.value === config.unit;
    });

    // 更新材料选择（先类别再类型）
    const resolvedCategory = config.materialCategory || getCategoryForMaterial(config.material) || materialCategorySelect?.value || DEFAULT_MATERIAL_CATEGORY;
    if (materialCategorySelect) {
      materialCategorySelect.value = resolvedCategory;
    }
    const ensuredType = refreshMaterialTypeOptions(resolvedCategory, config.material || getDefaultMaterialType(resolvedCategory));
    if (materialSelect && ensuredType) materialSelect.value = ensuredType;
    renderSurfaceTreatments(config);
    if (surfaceToggleYes && surfaceToggleNo) {
      const enabled = config.surfaceEnabled !== false;
      surfaceToggleYes.checked = enabled;
      surfaceToggleNo.checked = !enabled;
      if (surfaceListContainer) surfaceListContainer.style.display = enabled ? 'block' : 'none';
      // addSurfaceBtn 可能不存在，使用可选链或检查
      const addSurfaceBtn = document.getElementById('add-surface-btn') || document.querySelector('.add-surface-btn');
      if (addSurfaceBtn) addSurfaceBtn.style.display = enabled ? 'inline-block' : 'none';
    }
    if (tightestSelect) tightestSelect.value = config.tightest || 'GB/T 1804-2000 m级';
    if (roughnessSelect) roughnessSelect.value = config.roughness;
    if (qtyInput) qtyInput.value = config.quantity;
    if (noteTextarea) noteTextarea.value = config.note;

    // 更新单选按钮
    hasThreadRadios.forEach(radio => {
      radio.checked = radio.value === config.hasThread;
    });

    hasAssemblyRadios.forEach(radio => {
      radio.checked = radio.value === config.hasAssembly;
    });

    // 更新字符计数
    updateCharCount();
  }

  // 更新尺寸显示
  function updateDimensionsDisplay() {
    if (!dimensionsDisplay || !dimensionsValue || !fileManager.currentFileId) return;

    const fileData = fileManager.files.get(fileManager.currentFileId);
    if (!fileData || !fileData.dimensions) return;

    const width = (fileData.dimensions.width).toFixed(2);
    const height = (fileData.dimensions.height).toFixed(2);
    const depth = (fileData.dimensions.depth).toFixed(2);

    dimensionsValue.textContent = `${width} x ${height} x ${depth} 毫米`;
    dimensionsDisplay.style.display = 'block';
  }

  // 更新字符计数
  function updateCharCount() {
    if (charCount && noteTextarea) {
      charCount.textContent = noteTextarea.value.length;
    }
  }

  // 启用添加到购物车按钮
  function enableAddToCart() {
    if (addToCartBtn) {
      addToCartBtn.disabled = false;
    }
    updateBulkButtonState();
  }

  // 禁用添加到购物车按钮
  function disableAddToCart() {
    if (addToCartBtn) {
      addToCartBtn.disabled = true;
    }
    updateBulkButtonState();
  }

  // 处理询价提交（统一：勾选为前提，提交所勾选文件到草稿订单）
  function handleAddToCart() {
    if (selectedFileIds.size === 0) {
      showError('请先勾选要询价的3D文件');
      updateBulkButtonState();
      return;
    }

    const check = validateFilesSet(selectedFileIds);
    if (!check.ok) {
      showError(check.errors.join('\n'));
      updateBulkButtonState();
      return;
    }

    (async () => {
      // 先进行登录与地址校验
      const ok = await ensureCustomerAuthAndAddress();
      if (!ok) { return; }
      const confirmed = await confirmCustomerInfo();
      if (!confirmed) { return; }
      
      try {
        // 第一步：创建草稿订单
        console.log('📝 创建草稿订单...');
        console.log('选中的文件ID:', Array.from(selectedFileIds));
        
        const draftOrderId = await submitToDraftOrder();
        console.log('submitToDraftOrder 返回结果:', draftOrderId);
        
        if (draftOrderId && draftOrderId.trim() !== '') {
          // 成功创建草稿订单，跳转到草稿订单详情页
          console.log('✅ 草稿订单创建成功，ID:', draftOrderId);
          showSuccessMessage('询价已提交！正在跳转到订单详情...', 2000);
          setTimeout(() => {
            console.log('准备跳转到:', `/pages/my-quotes?id=${encodeURIComponent(draftOrderId)}`);
            window.location.href = `/pages/my-quotes?id=${encodeURIComponent(draftOrderId)}`;
          }, 2000);
        } else {
          console.error('❌ 草稿订单创建失败：未返回有效的订单ID');
          throw new Error('草稿订单创建失败：未返回有效的订单ID');
        }
        
      } catch (e) {
        console.error('❌ Draft order submission failed:', e);
        console.error('❌ 错误堆栈:', e.stack);
        showError('提交询价失败：' + (e && e.message ? e.message : '未知错误'));
      }
    })();
  }

  // 辅助函数：将文件转换为Base64
  async function getFileBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // 返回完整的Data URL，包括data:前缀
        resolve(reader.result);
      };
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsDataURL(file);
    });
  }

  // 获取第一个文件的数据URL
  async function getFirstFileDataUrl() {
    const firstFileId = Array.from(selectedFileIds)[0];
    if (!firstFileId) return null;
    
    const fileData = fileManager.files.get(firstFileId);
    if (!fileData || !fileData.file) return null;
    
    try {
      return await getFileBase64(fileData.file);
    } catch (error) {
      console.error('获取文件数据失败:', error);
      return null;
    }
  }

  // Vercel 请求体硬上限 4.5MB；Base64 膨胀约 33%，超过 ~2MB 原文件走直传
  const DIRECT_UPLOAD_THRESHOLD_BYTES = 2 * 1024 * 1024;

  async function uploadFileDirectToShopify(apiBase, file) {
    console.log('📤 浏览器直传 Shopify（绕开 Vercel 体积限制）:', file.name, file.size);

    const initResp = await fetch(`${apiBase}/store-file-real`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'init',
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
      }),
    });

    if (!initResp.ok) {
      const text = await initResp.text();
      throw new Error(`获取上传凭证失败 (${initResp.status}): ${text}`);
    }

    const initJson = await initResp.json();
    if (!initJson.success || !initJson.stagedTarget) {
      throw new Error(initJson.message || 'Staged Upload 初始化失败');
    }

    const { stagedTarget, contentCategory } = initJson;
    const parameters = Array.isArray(stagedTarget.parameters) ? stagedTarget.parameters : [];
    const hasPolicy = parameters.some((param) => param.name === 'policy');

    let uploadResp;
    if (hasPolicy) {
      const formData = new FormData();
      parameters.forEach((param) => formData.append(param.name, param.value));
      formData.append('file', file, file.name);
      uploadResp = await fetch(stagedTarget.url, { method: 'POST', body: formData });
    } else {
      const contentTypeParam = parameters.find((param) => param.name === 'content_type');
      uploadResp = await fetch(stagedTarget.url, {
        method: 'PUT',
        headers: {
          'Content-Type': contentTypeParam
            ? contentTypeParam.value
            : (file.type || 'application/octet-stream'),
        },
        body: file,
      });
    }

    if (!uploadResp.ok) {
      const text = await uploadResp.text();
      throw new Error(`直传到 Shopify 失败 (${uploadResp.status}): ${text}`);
    }

    const completeResp = await fetch(`${apiBase}/store-file-real`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'complete',
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
        resourceUrl: stagedTarget.resourceUrl,
        contentCategory,
      }),
    });

    if (!completeResp.ok) {
      const text = await completeResp.text();
      throw new Error(`完成文件登记失败 (${completeResp.status}): ${text}`);
    }

    const json = await completeResp.json();
    console.log('✅ 直传完成:', json);
    return {
      fileId: json.fileId,
      shopifyFileId: json.shopifyFileId,
      shopifyFileUrl: json.shopifyFileUrl,
      originalFileSize: json.originalFileSize,
    };
  }

  async function uploadFileViaBase64(apiBase, file) {
    console.log('📤 Base64 上传（小文件）:', file.name, file.size);
    const readerResult = await getFileBase64(file);

    const resp = await fetch(`${apiBase}/store-file-real`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileData: readerResult,
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`上传文件失败 (${resp.status}): ${text}`);
    }

    const json = await resp.json();
    console.log('✅ store-file-real 返回:', json);
    return {
      fileId: json.fileId,
      shopifyFileId: json.shopifyFileId,
      shopifyFileUrl: json.shopifyFileUrl,
      originalFileSize: json.originalFileSize,
    };
  }

  async function uploadToShopifyFiles(apiBase, file) {
    if (file.size > DIRECT_UPLOAD_THRESHOLD_BYTES) {
      return uploadFileDirectToShopify(apiBase, file);
    }
    return uploadFileViaBase64(apiBase, file);
  }

  // 提交到草稿订单（支持 3D + 2D 多文件，每个3D文件创建独立订单）
  async function submitToDraftOrder() {
    console.log('📝 开始创建草稿订单（每个3D文件独立订单）...');

    const API_BASE = (window.QUOTES_API_BASE || 'https://shopify-13s4.vercel.app/api').replace(/\/$/, '');

    // 1. 获取客户信息
    const customerInfo = await getCustomerInfo();
    console.log('客户信息:', customerInfo);

    if (!customerInfo || !customerInfo.email || !customerInfo.name) {
      throw new Error('客户信息不完整，请确保已正确登录或输入客户信息');
    }

    // 2. 先保存当前文件的配置（如果正在编辑）
    if (fileManager.currentFileId) {
      updateCurrentFileParameters();
    }

    // 4. 为每个 3D 文件创建独立的订单
    const draftOrderIds = [];
    const selected3DFileIds = Array.from(selectedFileIds).filter(id => {
      const fileData = fileManager.files.get(id);
      return fileData && is3DFile(fileData.file.name);
    });

    for (const fileId of selected3DFileIds) {
      const fileData = fileManager.files.get(fileId);
      if (!fileData || !is3DFile(fileData.file.name)) continue;

      console.log('📦 为 3D 文件创建独立订单:', fileData.file.name);

      const config = fileData.config || {};
      const rule = getSurfaceRule(config.material, config.materialCategory);
      const surfaceText = stringifySurfaceTreatments(
        normalizeSurfaceTreatments(config.surfaceTreatments, config.surfaceEnabled !== false, rule),
        config.surfaceEnabled !== false
      );

      // 4.1 上传 3D 文件到 Shopify Files
      let threeDMeta;
      try {
        threeDMeta = await uploadToShopifyFiles(API_BASE, fileData.file);
      } catch (e) {
        console.error('❌ 3D 文件上传失败，文件名:', fileData.file.name, e);
        throw e;
      }

      // 4.1b STEP 加工特征分析（经 Vercel -> ngrok/云 Palmetto，使用 CDN URL 避免 413）
      let featureAnalysis = null;
      if (isStepFile(fileData.file.name) && threeDMeta.shopifyFileUrl) {
        featureAnalysis = await analyzeStepMachiningFeatures(
          API_BASE,
          threeDMeta.shopifyFileUrl,
          fileData.file.name
        );
      }

      const machiningAttrs = buildMachiningFeatureAttributes(featureAnalysis);
      let quoteStatus = 'Pending';
      if (featureAnalysis?.features?.requiresManualReview) {
        quoteStatus = 'Pending Review';
      } else if (featureAnalysis?.features?.status === 'ok' || featureAnalysis?.features?.status === 'partial') {
        quoteStatus = 'Features Analyzed';
      } else if (featureAnalysis?.status === 'failed') {
        quoteStatus = 'Feature Analysis Failed';
      }

      // 4.2 为该 3D 文件及其对应 2D 文件生成 lineItems
      const lineItems = [];

      // 4.2.1 为 3D 文件创建 lineItem
      lineItems.push({
        title: fileData.file.name,
        quantity: parseInt(config.quantity || 1, 10) || 1,
        price: 0,
        requires_shipping: false,
        customAttributes: [
          { key: 'Order Type', value: '3D Model Quote' },
          { key: '文件类型', value: '3D' },
          { key: '客户姓名', value: customerInfo.name },
          { key: '客户邮箱', value: customerInfo.email },
          { key: '文件大小', value: (fileData.file.size / 1024 / 1024).toFixed(2) + ' MB' },
          { key: '材料', value: config.material || '未指定' },
          { key: '材料大类', value: config.materialCategory || getCategoryForMaterial(config.material) || '未指定' },
          { key: '表面处理', value: surfaceText || '未指定' },
          { key: '最严公差', value: config.tightest || 'GB/T 1804-2000 m级' },
          { key: '表面粗糙度', value: config.roughness || 'Ra3.2' },
          { key: '是否有螺纹', value: config.hasThread || 'no' },
          { key: '是否有装配关系', value: config.hasAssembly || 'no' },
          { key: '备注', value: config.note || '' },
          { key: 'Quote Status', value: quoteStatus },
          { key: '文件ID', value: threeDMeta.fileId },
          { key: 'Shopify文件ID', value: threeDMeta.shopifyFileId },
          { key: 'Shopify文件URL', value: threeDMeta.shopifyFileUrl },
          { key: '原始文件大小', value: String(threeDMeta.originalFileSize || fileData.file.size) },
          ...machiningAttrs,
          { key: '_uuid', value: Date.now() + '-' + Math.random().toString(36).substr(2, 9) }
        ],
      });

      // 4.2.2 查找对应的 2D 图纸，分别上传并创建 2D lineItem
      const twoDFiles = getCorresponding2DFiles(fileId) || [];
      console.log(`3D 文件 ${fileData.file.name} 对应的 2D 文件:`, twoDFiles.map(f => f.name));

      for (const twoD of twoDFiles) {
        const twoDData = fileManager.files.get(twoD.id);
        if (!twoDData || !twoDData.file) continue;

        let twoDMeta;
        try {
          twoDMeta = await uploadToShopifyFiles(API_BASE, twoDData.file);
        } catch (e) {
          console.error('❌ 2D 文件上传失败，文件名:', twoDData.file.name, e);
          continue; // 不阻断整个订单
        }

        lineItems.push({
          title: twoDData.file.name,
          quantity: 1,
          price: 0,
          requires_shipping: false,
          customAttributes: [
            { key: 'Order Type', value: '2D Drawing' },
            { key: '文件类型', value: '2D' },
            { key: '关联3D文件', value: fileData.file.name },
            { key: '客户姓名', value: customerInfo.name },
            { key: '客户邮箱', value: customerInfo.email },
            { key: '文件大小', value: (twoDData.file.size / 1024 / 1024).toFixed(2) + ' MB' },
            { key: '备注', value: config.note || '' },
            { key: '文件ID', value: twoDMeta.fileId },
            { key: 'Shopify文件ID', value: twoDMeta.shopifyFileId },
            { key: 'Shopify文件URL', value: twoDMeta.shopifyFileUrl },
            { key: '原始文件大小', value: String(twoDMeta.originalFileSize || twoDData.file.size) },
            { key: '_uuid', value: Date.now() + '-' + Math.random().toString(36).substr(2, 9) }
          ],
        });
      }

      console.log(`为 ${fileData.file.name} 创建订单，lineItems 数量:`, lineItems.length);

      // 4.3 为该 3D 文件创建独立的草稿订单
      const requestBody = {
        customerName: customerInfo.name,
        customerEmail: customerInfo.email,
        fileName: fileData.file.name,
        lineItems,
        fileUrl: null, // 文件都走 store-file-real，不再用单个 fileUrl
      };

      try {
        const response = await fetch(`${API_BASE}/submit-quote-real`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        console.log(`submit-quote-real 响应状态 (${fileData.file.name}):`, response.status);
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ 创建草稿订单失败 (${fileData.file.name}):`, response.status, errorText);
          throw new Error(`创建草稿订单失败 (${fileData.file.name}): ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        console.log(`✅ 草稿订单创建成功 (${fileData.file.name}):`, result);

        if (result.draftOrderId) {
          draftOrderIds.push(result.draftOrderId);
        } else {
          console.warn(`⚠️ API 返回结果中没有 draftOrderId (${fileData.file.name}):`, result);
        }
      } catch (error) {
        console.error(`❌ 创建订单失败 (${fileData.file.name}):`, error);
        // 继续处理下一个文件，不中断整个流程
        continue;
      }
    }

    if (draftOrderIds.length === 0) {
      throw new Error('没有成功创建任何草稿订单');
    }

    console.log(`✅ 成功创建 ${draftOrderIds.length} 个独立订单:`, draftOrderIds);
    
    // 返回第一个订单ID（用于跳转）
    return draftOrderIds[0];
  }

  // 提交到购物车（第二步：从草稿订单到购物车）
  async function submitToCart() {
    console.log('🛒 开始添加到购物车...');
    
    // 获取客户信息
    const customerInfo = await getCustomerInfo();
    console.log('客户信息:', customerInfo);
    
    // 准备购物车项目
    const cartItems = [];
    
    // 处理每个选中的文件
    for (const fileId of selectedFileIds) {
      const fileData = fileManager.files.get(fileId);
      if (!fileData) continue;
      
      console.log('处理文件:', fileData.file.name);
      
      // 获取文件配置
      const config = fileData.config || {};
      console.log('文件配置:', config);
      const rule = getSurfaceRule(config.material, config.materialCategory);
      const surfaceText = stringifySurfaceTreatments(
        normalizeSurfaceTreatments(config.surfaceTreatments, config.surfaceEnabled !== false, rule),
        config.surfaceEnabled !== false
      );
      
      // 创建购物车项目
      const cartItem = {
        id: 0, // 虚拟产品ID
        quantity: parseInt(config.quantity || 1),
        properties: {
          'Order Type': '3D Model Quote',
          '客户姓名': customerInfo.name,
          '客户邮箱': customerInfo.email,
          '零件名称': fileData.file.name,
          '文件大小': (fileData.file.size / 1024 / 1024).toFixed(2) + ' MB',
          '材料': config.material || '未指定',
          '材料大类': config.materialCategory || getCategoryForMaterial(config.material) || '未指定',
          '表面处理': surfaceText || '未指定',
          '最严公差': config.tightest || 'GB/T 1804-2000 m级',
          '粗糙度': config.roughness || 'Ra3.2',
          '螺纹': config.hasThread || 'no',
          '装配': config.hasAssembly || 'no',
          '备注': config.note || '',
          'Quote Status': 'Pending',
          '_uuid': Date.now() + '-' + Math.random().toString(36).substr(2, 9)
        }
      };
      
      cartItems.push(cartItem);
    }
    
    console.log('准备添加到购物车的项目:', cartItems);
    
    try {
      // 调用Shopify购物车API
      const response = await fetch('/cart/add.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: cartItems
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('购物车API响应错误:', errorText);
        throw new Error(`购物车API调用失败 (${response.status}): ${errorText}`);
      }
      
      const result = await response.json();
      console.log('添加到购物车成功:', result);
      
      // 显示成功消息
      showSuccessMessage('询价提交成功！已添加到购物车。', [
        '1. 您的询价已提交，请在购物车中查看',
        '2. 客服将评估您的需求并报价',
        '3. 报价完成后，您将收到通知',
        '4. 您可以在购物车中查看最新状态'
      ]);
      
      // 延迟跳转到购物车
      setTimeout(() => {
        window.location.href = '/cart';
      }, 3000);
      
    } catch (error) {
      console.error('添加到购物车失败:', error);
      throw error;
    }
  }

  // 提交询价到草稿订单（保留用于管理端功能）
  async function submitQuoteToDraftOrder() {
    const API_BASE = 'https://shopify-13s4.vercel.app/api';  // 请修改为你的实际 Vercel 域名
    
    console.log('开始提交询价到草稿订单...');
    console.log('API_BASE:', API_BASE);
    
    // 获取客户信息
    const customerInfo = await getCustomerInfo();
    console.log('客户信息:', customerInfo);
    
    // 处理每个选中的文件
    for (const fileId of selectedFileIds) {
      const fileData = fileManager.files.get(fileId);
      if (!fileData) continue;
      
      console.log('处理文件:', fileData.file.name);
      
      // 上传文件并获取文件数据
      const fileUrl = await uploadFileToStorage(fileData.file);
      console.log('文件上传成功:', fileUrl ? '已获取URL' : 'Base64数据');
      
      // 获取文件配置
      const config = fileData.config || {};
      console.log('文件配置:', config);
      const surfaceText = stringifySurfaceTreatments(
        normalizeSurfaceTreatments(config.surfaceTreatments, config.surfaceEnabled !== false),
        config.surfaceEnabled !== false
      );
      
      // 准备API请求数据
      const requestData = {
        fileName: fileData.file.name,
        fileData: fileUrl, // 使用文件URL而不是Base64
        customerEmail: customerInfo.email,
        customerName: customerInfo.name,
        quantity: parseInt(config.quantity || 1),
        material: config.material || '未指定',
        surfaceTreatment: surfaceText || '待确认',
        tightest: config.tightest || 'GB/T 1804-2000 m级',
        roughness: config.roughness || 'Ra3.2',
        hasThread: config.hasThread || 'no',
        hasAssembly: config.hasAssembly || 'no',
        note: config.note || ''
      };
      
      console.log('API请求数据:', requestData);
      
      try {
        // 调用草稿订单API
        const response = await fetch(`${API_BASE}/submit-quote-real`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestData)
        });
        
        console.log('API响应状态:', response.status);
        console.log('API响应头:', response.headers);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('API响应错误:', errorText);
          throw new Error(`API调用失败 (${response.status}): ${errorText}`);
        }
        
      const result = await response.json();
      console.log('API响应结果:', result);

      if (!result.success) {
        throw new Error(result.message || result.error || '提交失败');
      }

      console.log('询价提交成功:', result);
      
      // 显示成功消息和后续步骤
      if (result.nextSteps) {
        showSuccessMessage(result.message, result.nextSteps);
      } else {
        showSuccessMessage(result.message || '询价提交成功！');
      }
      
      // 保存询价单号用于跳转
      if (result.quoteId) {
        window.quoteId = result.quoteId;
      }

    } catch (error) {
        console.error('API调用失败:', error);
        
        // 提供更详细的错误信息
        if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
          throw new Error(`网络连接失败，请检查：
1. 网络连接是否正常
2. API服务是否已部署: ${API_BASE}
3. 域名配置是否正确
4. 是否有防火墙阻止`);
        } else {
          throw error;
        }
      }
    }
    
    // 发送询价通知
    await sendQuoteNotification();
    
    // 延迟跳转，让用户看到成功消息
    setTimeout(() => {
      const quoteId = window.quoteId || 'Q' + Date.now();
      window.location.href = `/pages/my-quotes?id=${quoteId}`;
    }, 3000);
  }

  // 显示成功消息和后续步骤
  function showSuccessMessage(message, nextSteps = []) {
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.5);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    
    modal.innerHTML = `
      <div style="
        background: white;
        border-radius: 12px;
        padding: 30px;
        max-width: 500px;
        width: 90%;
        text-align: center;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
      ">
        <div style="font-size: 48px; margin-bottom: 20px;">🎉</div>
        <h2 style="color: #28a745; margin-bottom: 20px;">${message}</h2>
        ${nextSteps.length > 0 ? `
          <div style="text-align: left; margin: 20px 0;">
            <h4 style="margin-bottom: 10px;">接下来：</h4>
            <ul style="padding-left: 20px;">
              ${nextSteps.map(step => `<li style="margin-bottom: 8px; color: #666;">${step}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
        <div style="margin-top: 20px; color: #666; font-size: 14px;">
          3秒后自动跳转到询价详情页面...
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // 3秒后自动关闭
    setTimeout(() => {
      modal.remove();
    }, 3000);
  }

  // 上传文件到存储并返回URL
  async function uploadFileToStorage(file) {
    try {
      // 如果有文件存储管理器，使用它
      if (window.fileStorageManager) {
        const fileId = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        return await window.fileStorageManager.uploadFile(file, fileId);
      }
      
      // 否则转换为Base64
      return await readFileAsBase64(file);
    } catch (error) {
      console.error('文件上传失败:', error);
      throw new Error('文件上传失败: ' + error.message);
    }
  }

  // 读取文件为Base64
  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // 获取客户信息
  async function getCustomerInfo() {
    console.log('🔍 获取客户信息...');
    console.log('window.customerState:', window.customerState);
    console.log('window.Shopify:', window.Shopify);
    
    // 优先使用 window.customerState 中的信息
    if (window.customerState && window.customerState.loggedIn && window.customerState.email) {
      const email = window.customerState.email.trim().toLowerCase();
      const name = window.customerState.customerName || '客户';
      
      // 验证邮箱格式
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (emailRegex.test(email)) {
        console.log('✅ 使用 window.customerState 中的客户信息:', { name, email });
        return { name, email };
      }
    }
    
    // 尝试从Shopify获取客户信息
    if (window.Shopify && window.Shopify.customer) {
      const customer = window.Shopify.customer;
      const email = customer.email || '';
      
      // 验证邮箱格式
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (email && emailRegex.test(email)) {
        console.log('✅ 使用 Shopify.customer 中的客户信息:', { 
          name: customer.firstName || 'Shopify客户', 
          email 
        });
        return {
          name: customer.firstName && customer.lastName ? 
                `${customer.firstName} ${customer.lastName}` : 
                customer.firstName || 'Shopify客户',
          email: email
        };
      }
    }
    
    // 如果无法获取或邮箱无效，提示用户输入
    console.log('⚠️ 无法自动获取客户信息，需要手动输入');
    let name, email;
    
    do {
      name = prompt('请输入您的姓名:');
      if (!name) {
        throw new Error('客户姓名不能为空');
      }
    } while (!name.trim());
    
    do {
      email = prompt('请输入您的邮箱地址:');
      if (!email) {
        throw new Error('客户邮箱不能为空');
      }
      
      // 验证邮箱格式
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        alert('邮箱格式不正确，请重新输入');
        email = null;
      }
    } while (!email);
    
    console.log('✅ 使用手动输入的客户信息:', { name: name.trim(), email: email.trim().toLowerCase() });
    return { 
      name: name.trim(), 
      email: email.trim().toLowerCase() 
    };
  }

  // 更新表单数据
  function updateFormData() {
    if (fileManager.files.size === 0) return;

    // 获取当前选中的文件
    const currentFileData = fileManager.files.get(fileManager.currentFileId);
    if (!currentFileData) return;

    // 更新变体ID
    const variantId = getDefaultVariantId();
    if (variantId) {
      const idInput = document.getElementById('product-variant-id') || 
                     document.getElementById('section-variant-id') || 
                     document.getElementById('fallback-variant-id');
      if (idInput) {
        idInput.value = variantId;
      }
    }

    // 更新自定义属性
    const propMaterial = document.getElementById('prop-material');
    const propMaterialCategory = document.getElementById('prop-material-category');
    const propSurface = document.getElementById('prop-surface');
    const propTightest = document.getElementById('prop-tightest');
    const propRoughness = document.getElementById('prop-roughness');
    const propHasThread = document.getElementById('prop-hasThread');
    const propHasAssembly = document.getElementById('prop-hasAssembly');
    const propNote = document.getElementById('prop-note');
    const propFileName = document.getElementById('prop-fileName');
    const propFileSize = document.getElementById('prop-fileSize');

    const resolvedCategory = currentFileData.config.materialCategory || getCategoryForMaterial(currentFileData.config.material) || '';
    if (propMaterialCategory) propMaterialCategory.value = resolvedCategory;
    if (propMaterial) propMaterial.value = currentFileData.config.material || '';
    const rule = getSurfaceRule(currentFileData.config.material, currentFileData.config.materialCategory);
    if (propSurface) propSurface.value = stringifySurfaceTreatments(
      normalizeSurfaceTreatments(currentFileData.config.surfaceTreatments, currentFileData.config.surfaceEnabled !== false, rule),
      currentFileData.config.surfaceEnabled !== false
    );
    if (propTightest) propTightest.value = currentFileData.config.tightest || 'GB/T 1804-2000 m级';
    if (propRoughness) propRoughness.value = currentFileData.config.roughness || '';
    if (propHasThread) propHasThread.value = currentFileData.config.hasThread || '';
    if (propHasAssembly) propHasAssembly.value = currentFileData.config.hasAssembly || '';
    if (propNote) propNote.value = currentFileData.config.note || '';
    if (propFileName) propFileName.value = currentFileData.file.name;
    if (propFileSize) propFileSize.value = formatFileSize(currentFileData.file.size);

    // 额外：将名称写入隐藏字段（若主题使用表单提交路径时，也能显示名称）
    const ensureHidden = (id, value) => {
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement('input');
        el.type = 'hidden';
        el.id = id;
        el.name = `properties[${id}]`;
        form && form.appendChild(el);
      }
      el.value = value;
    };
    ensureHidden('零件名称', currentFileData.file.name);
    ensureHidden('文件名称', currentFileData.file.name);
    ensureHidden('文件名', currentFileData.file.name);
    ensureHidden('名称', currentFileData.file.name);

    console.log('Form data updated for file:', currentFileData.file.name);
  }

  // 上传文件到存储
  async function uploadFileToServer(file, fileId) {
    try {
      // 使用文件存储管理器上传文件
      if (window.fileStorageManager) {
        const fileUrl = await window.fileStorageManager.uploadFile(file, fileId);
        console.log('文件上传成功:', fileUrl);
        return fileUrl;
      } else {
        console.warn('文件存储管理器未加载，使用备用方案');
        return null;
      }
    } catch (error) {
      console.error('文件上传失败:', error);
      // 如果上传失败，返回null，后续会使用备用方案
      return null;
    }
  }

  // 添加单个文件到购物车
  async function addFileToCart(fileId, fileData) {
      const rule = getSurfaceRule(fileData.config.material, fileData.config.materialCategory);
      const surfaceText = stringifySurfaceTreatments(
        normalizeSurfaceTreatments(fileData.config.surfaceTreatments, fileData.config.surfaceEnabled !== false, rule),
        fileData.config.surfaceEnabled !== false
      );

    // 获取或创建变体ID
    let variantId = getDefaultVariantId();
    
    if (!variantId) {
      variantId = await createDefaultVariant();
    }

    if (!variantId) {
      throw new Error('无法获取产品变体ID，请确保已配置关联商品');
    }

    // 尝试上传文件到服务器
    const fileUrl = await uploadFileToServer(fileData.file, fileId);
    
    // 准备表单数据
    const formData = new FormData();
    formData.append('id', variantId);
    formData.append('quantity', fileData.config.quantity);
    
    // 添加文件（如果上传成功，存储URL；否则存储文件对象）
    if (fileUrl) {
      formData.append('properties[上传文件]', fileUrl);
      formData.append('properties[文件URL]', fileUrl);
    } else {
      formData.append('properties[上传文件]', fileData.file);
    }
    
    // 添加名称（多语言兜底，确保主题能显示其一）
    formData.append('properties[零件名称]', fileData.file.name);
    formData.append('properties[文件名称]', fileData.file.name);
    formData.append('properties[文件名]', fileData.file.name);
    formData.append('properties[名称]', fileData.file.name);
    formData.append('properties[Part Name]', fileData.file.name);
    
    // 其他配置参数（可见）
    formData.append('properties[文件ID]', fileId);
    formData.append('properties[单位]', fileData.config.unit);
    formData.append('properties[材料大类]', fileData.config.materialCategory || getCategoryForMaterial(fileData.config.material) || '');
    formData.append('properties[材料]', fileData.config.material);
    formData.append('properties[表面处理]', surfaceText);
    formData.append('properties[最严公差]', fileData.config.tightest || 'GB/T 1804-2000 m级');
    formData.append('properties[表面粗糙度]', fileData.config.roughness);
    formData.append('properties[是否有螺纹]', fileData.config.hasThread);
    formData.append('properties[是否有装配关系]', fileData.config.hasAssembly);
    formData.append('properties[备注]', fileData.config.note);
    
    if (fileData.dimensions) {
      const dimensions = `${(fileData.dimensions.width).toFixed(2)} x ${(fileData.dimensions.height).toFixed(2)} x ${(fileData.dimensions.depth).toFixed(2)} mm`;
      formData.append('properties[尺寸]', dimensions);
    }
    
    // 业务标记
    formData.append('properties[Order Type]', '3D Model Quote');
    formData.append('properties[Quote Status]', 'Pending');
    formData.append('properties[_uuid]', `${Date.now()}-${fileId}-${Math.random().toString(16).slice(2)}`);
    
    // 添加客户信息
    if (window.customerState && window.customerState.loggedIn) {
      formData.append('properties[客户姓名]', window.customerState.customerName || '登录用户');
      formData.append('properties[客户邮箱]', window.customerState.email || '');
      formData.append('properties[Customer Name]', window.customerState.customerName || '登录用户');
      formData.append('properties[Customer Email]', window.customerState.email || '');
    } else {
      formData.append('properties[客户姓名]', '未登录用户');
      formData.append('properties[客户邮箱]', '');
      formData.append('properties[Customer Name]', '未登录用户');
      formData.append('properties[Customer Email]', '');
    }

    // 提交到购物车
    const response = await fetch('/cart/add', {
      method: 'POST',
      body: formData,
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json',
      },
    });

    let data = null;
    try { data = await response.json(); } catch (_) {}

    if (!response.ok || (data && data.status)) {
      const message = data?.message || '加入购物车失败';
      throw new Error(`${fileData.file.name}: ${message}`);
    }

    // 已取消：不再通过 App Proxy 创建，避免重复记录

    // 追加：同步到 Vercel 后端（Metaobject: quote）
    try {
      const base = (window.QUOTES_API_BASE || 'https://shopify-13s4.vercel.app/api').replace(/\/$/, '');
      
      // 确保 API 基础地址正确
      if (!window.QUOTES_API_BASE) {
        console.log('QUOTES_API_BASE not set, using default:', base);
      }
      // 处理文件URL，尝试上传到 Vercel 后端
      let invoiceUrl = formData.get('properties[文件URL]') || '';
      let fileDataBase64 = '';
      
      // 尝试上传文件到 Vercel 后端
      try {
        if (invoiceUrl && invoiceUrl.startsWith('data:')) {
          fileDataBase64 = invoiceUrl;
          console.log('检测到data: URI，尝试上传到后端');
          
          // 上传文件到 Vercel 后端
          const uploadResponse = await fetch(`${base}/upload-file`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Origin': window.location.origin
            },
            body: JSON.stringify({
              fileData: fileDataBase64,
              fileName: fileData.file.name,
              fileType: fileData.file.type,
              orderId: fileData._uuid || `order_${Date.now()}`
            })
          });
          
          if (uploadResponse.ok) {
            const uploadResult = await uploadResponse.json();
            invoiceUrl = uploadResult.fileUrl;
            console.log('文件上传成功:', uploadResult);
          } else {
            console.warn('文件上传失败，标记为上传失败');
            invoiceUrl = 'data:upload_failed';
          }
        } else if (!invoiceUrl) {
          // 如果没有文件URL，尝试从文件对象生成
          console.log('没有文件URL，尝试生成并上传文件数据');
          try {
            const reader = new FileReader();
            reader.onload = async function(e) {
              fileDataBase64 = e.target.result;
              console.log('文件数据生成成功，尝试上传');
              
              // 上传文件到 Vercel 后端
              try {
                const uploadResponse = await fetch(`${base}/upload-file`, {
                  method: 'POST',
                  headers: { 
                    'Content-Type': 'application/json',
                    'Origin': window.location.origin
                  },
                  body: JSON.stringify({
                    fileData: fileDataBase64,
                    fileName: fileData.file.name,
                    fileType: fileData.file.type,
                    orderId: fileData._uuid || `order_${Date.now()}`
                  })
                });
                
                if (uploadResponse.ok) {
                  const uploadResult = await uploadResponse.json();
                  invoiceUrl = uploadResult.fileUrl;
                  console.log('文件上传成功:', uploadResult);
                } else {
                  console.warn('文件上传失败，标记为上传失败');
                  invoiceUrl = 'data:upload_failed';
                }
              } catch (uploadError) {
                console.warn('文件上传异常:', uploadError);
                invoiceUrl = 'data:upload_failed';
              }
            };
            reader.readAsDataURL(fileData.file);
            invoiceUrl = 'data:uploading';
          } catch (error) {
            console.warn('生成文件数据失败:', error);
            invoiceUrl = 'data:processing_error';
          }
        } else if (!invoiceUrl.startsWith('http://') && !invoiceUrl.startsWith('https://')) {
          // 如果不是标准URL，使用占位符
          console.log('非标准URL，标记为无效');
          invoiceUrl = 'data:invalid_url';
        }
      } catch (error) {
        console.warn('文件处理异常:', error);
        invoiceUrl = 'data:processing_error';
      }
      
      // 获取客户信息
      let customerName = '客户';
      let customerEmail = '';
      
      // 尝试从多个来源获取客户信息
      if (window.customerState && window.customerState.loggedIn) {
        customerName = window.customerState.customerName || '登录用户';
        customerEmail = window.customerState.email || '';
      } else if (window.Shopify && window.Shopify.customer) {
        customerName = window.Shopify.customer.first_name || 'Shopify客户';
        customerEmail = window.Shopify.customer.email || '';
      } else if (typeof Shopify !== 'undefined' && Shopify.customer) {
        customerName = Shopify.customer.first_name || 'Shopify客户';
        customerEmail = Shopify.customer.email || '';
      } else {
        // 从 URL 参数或 localStorage 获取
        const urlParams = new URLSearchParams(window.location.search);
        customerEmail = urlParams.get('email') || localStorage.getItem('customerEmail') || '';
        customerName = urlParams.get('name') || localStorage.getItem('customerName') || '客户';
      }
      
      const payload = {
        text: fileData.file.name,
        author: `${customerName} (${customerEmail})`,
        email: customerEmail,
        status: 'Pending',
        price: '',
        invoice_url: invoiceUrl
        // 注意：由于 Shopify Metaobject 字段限制，参数信息将合并到 author 字段中
      };
      
      // 确保所有字段都是字符串，并限制长度
      Object.keys(payload).forEach(key => {
        let value = String(payload[key] || '');
        // 限制字段长度，避免超过 2048 字符限制
        if (value.length > 2048) {
          console.warn(`字段 ${key} 长度超限 (${value.length} > 2048)，将被截断`);
          value = value.substring(0, 2048);
        }
        payload[key] = value;
      });
      
      console.log('正在同步到 Vercel 后端:', payload);
      console.log('请求 URL:', `${base}/quotes`);
      console.log('客户信息:', { customerName, customerEmail });
      console.log('window.customerState:', window.customerState);
      console.log('window.Shopify:', window.Shopify);
      
      // 调试：显示每个字段的长度
      Object.keys(payload).forEach(key => {
        console.log(`字段 ${key} 长度: ${payload[key].length} 字符`);
      });
      
      const res = await fetch(`${base}/quotes`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Accept': 'application/json',
          'Origin': window.location.origin
        },
        body: JSON.stringify(payload)
      });
      
      console.log('Vercel 后端响应状态:', res.status);
      console.log('响应头:', Object.fromEntries(res.headers.entries()));
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('同步到 Vercel 后端失败：', res.status, errorText);
        console.error('请求数据:', JSON.stringify(payload, null, 2));
        // 显示详细错误给用户
        showNotification(`同步到后台失败 (${res.status}): ${errorText}`, 'error');
      } else {
        const result = await res.text();
        console.log('同步到 Vercel 后端成功:', result);
        showNotification('询价已提交，客服将尽快处理', 'success');
      }
    } catch (err) {
      console.error('同步到 Vercel 后端异常：', err);
      showNotification('网络错误，询价可能未同步到后台', 'warning');
    }
  }

  // 显示通知消息
  function showNotification(message, type = 'info') {
    // 创建通知元素
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 6px;
      color: white;
      font-weight: 500;
      z-index: 10000;
      max-width: 300px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      transition: all 0.3s ease;
    `;
    
    // 根据类型设置样式
    switch (type) {
      case 'success':
        notification.style.backgroundColor = '#10b981';
        break;
      case 'error':
        notification.style.backgroundColor = '#ef4444';
        break;
      case 'warning':
        notification.style.backgroundColor = '#f59e0b';
        break;
      default:
        notification.style.backgroundColor = '#3b82f6';
    }
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // 3秒后自动消失
    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }

  // 获取默认变体ID
  function getDefaultVariantId() {
    console.log('Getting default variant ID...');
    
    // 方法1: 优先使用当前产品变体ID（如果是在产品页面）
    if (window.currentProductVariantId) {
      console.log('Using current product variant ID:', window.currentProductVariantId);
      return window.currentProductVariantId;
    }
    
    // 方法2: 从表单获取
    const idInput = form?.querySelector('input[name="id"]');
    if (idInput && idInput.value) {
      console.log('Using form variant ID:', idInput.value);
      return idInput.value;
    }
    
    // 方法3: 从全局变量获取
    if (window.theme && window.theme.defaultVariantId) {
      console.log('Using theme default variant ID:', window.theme.defaultVariantId);
      return window.theme.defaultVariantId;
    }
    
    // 方法4: 从页面数据获取
    const productData = document.querySelector('[data-product-json]');
    if (productData) {
      try {
        const product = JSON.parse(productData.textContent);
        if (product && product.selected_or_first_available_variant) {
          console.log('Using product data variant ID:', product.selected_or_first_available_variant.id);
          return product.selected_or_first_available_variant.id.toString();
        }
      } catch (e) {
        console.log('Failed to parse product data:', e);
      }
    }
    
    console.warn('No variant ID found');
    return null;
  }

  // 创建默认变体
  async function createDefaultVariant() {
    try {
      // 尝试从Shopify全局对象获取
      if (window.Shopify && window.Shopify.theme && window.Shopify.theme.defaultVariantId) {
        return window.Shopify.theme.defaultVariantId;
      }

      // 尝试从URL参数获取
      const urlParams = new URLSearchParams(window.location.search);
      const variantId = urlParams.get('variant');
      if (variantId) {
        return variantId;
      }

      // 尝试从meta标签获取
      const metaVariant = document.querySelector('meta[name="variant-id"]');
      if (metaVariant) {
        return metaVariant.content;
      }

      // 如果都没有，返回一个默认的变体ID（需要根据实际情况调整）
      console.warn('No variant ID found, using fallback');
      return null; // 这里应该返回一个有效的变体ID
    } catch (error) {
      console.error('Error creating default variant:', error);
      return null;
    }
  }

  // 刷新购物车
  async function refreshCart() {
    console.log('Refreshing cart...');
    
    try {
      // 立即获取最新购物车数据
      const response = await fetch('/cart.js');
      const cart = await response.json();
      console.log('Latest cart data:', cart);
      
      // 立即更新UI元素
      updateCartUI(cart);
      
      // 方法1: 触发Shopify标准购物车事件
      document.dispatchEvent(new CustomEvent('cart:add', { 
        detail: { 
          itemCount: cart.item_count,
          sections: {}
        } 
      }));

      // 方法2: 触发Shopify的CartAddEvent
      if (typeof window.CartAddEvent !== 'undefined') {
        document.dispatchEvent(new window.CartAddEvent({
          bubbles: true,
          detail: {
            itemCount: cart.item_count
          }
        }));
      }

      // 方法3: 直接刷新购物车组件
      const cartItemsComponent = document.querySelector('cart-items-component');
      if (cartItemsComponent && typeof cartItemsComponent.renderSection === 'function') {
        console.log('Refreshing cart-items-component...');
        cartItemsComponent.renderSection(cartItemsComponent.sectionId, { cache: false });
      }

      // 方法4: 刷新购物车抽屉
      const cartDrawer = document.querySelector('cart-drawer-component');
      if (cartDrawer) {
        console.log('Refreshing cart-drawer-component...');
        if (typeof cartDrawer.renderSection === 'function') {
          cartDrawer.renderSection(cartDrawer.sectionId, { cache: false });
        }
      }

      // 方法5: 强制刷新购物车抽屉内容
      setTimeout(() => {
        const cartDrawer = document.querySelector('cart-drawer');
        if (cartDrawer) {
          console.log('Force refreshing cart drawer content...');
          
          // 强制重新渲染购物车内容
          const cartItems = cartDrawer.querySelector('cart-items');
          if (cartItems && typeof cartItems.renderSection === 'function') {
            cartItems.renderSection(cartItems.sectionId, { cache: false });
          }
          
          // 更新购物车计数
          const cartCountElements = document.querySelectorAll('.cart-count, [data-cart-count], .cart-count-bubble');
          cartCountElements.forEach(element => {
            if (cart.item_count > 0) {
              element.textContent = cart.item_count;
              element.style.display = 'block';
            }
          });
          
          // 更新购物车总价
          const cartTotalElements = document.querySelectorAll('.cart-total, [data-cart-total]');
          cartTotalElements.forEach(element => {
            element.textContent = formatMoney(cart.total_price);
          });
        }
      }, 50);

      // 打开购物车抽屉
      setTimeout(() => {
        const drawer = document.querySelector('cart-drawer-component');
        if (drawer) {
          console.log('Opening cart drawer...');
          if (typeof drawer.open === 'function') {
            drawer.open();
          } else if (typeof drawer.show === 'function') {
            drawer.show();
          } else {
            // 尝试通过点击购物车图标打开
            const cartIcon = document.querySelector('.cart-icon, [data-cart-icon]');
            if (cartIcon) {
              cartIcon.click();
            }
          }
        }
      }, 100);

      // 额外的购物车刷新机制
      setTimeout(() => {
        console.log('Additional cart refresh...');
        
        // 重新获取购物车数据并更新UI
        fetch('/cart.js')
          .then(response => response.json())
          .then(cart => {
            console.log('Final cart data:', cart);
            
            // 更新所有购物车相关元素
            updateCartUI(cart);
          })
          .catch(error => {
            console.error('Error in final cart refresh:', error);
          });
      }, 500);
      
    } catch (error) {
      console.error('Error refreshing cart:', error);
    }
  }

  // 更新购物车UI
  function updateCartUI(cart) {
    console.log('Updating cart UI with:', cart);
    
    // 更新购物车计数
    const cartCountElements = document.querySelectorAll('.cart-count, [data-cart-count], .cart__count, .cart-count-bubble, .header__icon--cart .cart-count');
    cartCountElements.forEach(element => {
      if (cart.item_count > 0) {
        element.textContent = cart.item_count;
        element.style.display = 'block';
      } else {
        element.style.display = 'none';
      }
    });

    // 更新购物车总价
    const cartTotalElements = document.querySelectorAll('.cart__total, [data-cart-total], .cart-total, .cart-drawer__total');
    cartTotalElements.forEach(element => {
      element.textContent = formatMoney(cart.total_price);
    });

    // 更新购物车状态
    const cartEmptyElements = document.querySelectorAll('.cart-empty, .cart__empty');
    const cartItemsElements = document.querySelectorAll('.cart-items, .cart__items');
    
    if (cart.item_count > 0) {
      cartEmptyElements.forEach(element => {
        element.style.display = 'none';
      });
      cartItemsElements.forEach(element => {
        element.style.display = 'block';
      });
    } else {
      cartEmptyElements.forEach(element => {
        element.style.display = 'block';
      });
      cartItemsElements.forEach(element => {
        element.style.display = 'none';
      });
    }

    // 强制刷新购物车组件
    const cartComponents = document.querySelectorAll('cart-drawer-component, cart-items-component, cart-drawer, cart-items');
    cartComponents.forEach(component => {
      if (component && typeof component.renderSection === 'function') {
        component.renderSection(component.sectionId, { cache: false });
      }
    });

    // 触发购物车更新事件
    document.dispatchEvent(new CustomEvent('cart:updated', {
      detail: { cart: cart }
    }));
    
    // 触发Shopify标准购物车事件
    document.dispatchEvent(new CustomEvent('cart:refresh', {
      detail: { cart: cart }
      }));
    }

  // 格式化货币
  function formatMoney(cents) {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: 'CNY'
    }).format(cents / 100);
  }

  // 验证文件（支持STP/STEP、ZIP和2D文件）
  function isValidFile(file) {
    const validExtensions = ['.stp', '.step', '.zip', '.dwg', '.dxf', '.pdf'];
    const extension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    return validExtensions.includes(extension);
  }

  // 验证文件名（用于ZIP解压，仅支持STP/STEP和2D文件）
  function isValidFileName(fileName) {
    const validExtensions = ['.stp', '.step', '.dwg', '.dxf', '.pdf'];
    return validExtensions.some(ext => fileName.toLowerCase().endsWith(ext));
  }

  // 获取MIME类型
  function getMimeType(fileName) {
    const extension = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
    const mimeTypes = {
      '.stl': 'application/octet-stream',
      '.obj': 'application/octet-stream',
      '.step': 'application/step',
      '.stp': 'application/step',
      '.3mf': 'application/3mf',
      '.iges': 'application/iges',
      '.dwg': 'application/dwg',
      '.dxf': 'application/dxf',
      '.pdf': 'application/pdf'
    };
    return mimeTypes[extension] || 'application/octet-stream';
  }

  // 格式化文件大小
  function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // 显示加载状态
  function showLoading(show) {
    // 使用高级查看器时，将加载提示放到3D窗口中心；底部提示隐藏
    if (useAdvancedViewer && o3dvWrapper) {
      try {
        if (show) {
          o3dvWrapper.showLoading();
        } else {
          o3dvWrapper.hideLoading();
        }
      } catch (e) {}
      if (loadingIndicator) loadingIndicator.style.display = 'none';
      return;
    }
    // 基础模式：仍显示页面底部loading
    if (loadingIndicator) {
      loadingIndicator.style.display = show ? 'block' : 'none';
    }
  }

  // 显示错误（持续显示直到问题解决）
  function showError(message) {
    if (errorMessage) {
      errorMessage.textContent = message;
      errorMessage.style.display = 'block';
      errorMessage.style.color = '#c62828';
      errorMessage.style.backgroundColor = '#ffebee';
      errorMessage.style.borderColor = '#d32f2f';
      errorMessage.style.border = '1px solid #d32f2f';
      errorMessage.style.padding = '12px';
      errorMessage.style.borderRadius = '4px';
      errorMessage.style.margin = '10px 0';
      // 错误消息不自动隐藏，需要手动解决
    }
  }

  // 隐藏错误
  function hideError() {
    if (errorMessage) {
      errorMessage.style.display = 'none';
    }
  }

  // 显示成功消息（自动隐藏）
  function showSuccess(message) {
    if (errorMessage) {
      errorMessage.textContent = message;
      errorMessage.style.display = 'block';
      errorMessage.style.color = '#4caf50';
      errorMessage.style.backgroundColor = '#e8f5e8';
      errorMessage.style.borderColor = '#4caf50';
      errorMessage.style.border = '1px solid #4caf50';
      errorMessage.style.padding = '12px';
      errorMessage.style.borderRadius = '4px';
      errorMessage.style.margin = '10px 0';
      // 成功消息3秒后自动隐藏
      setTimeout(() => hideError(), 3000);
    }
  }

  // 显示警告消息（持续显示直到问题解决）
  function showWarning(message) {
    if (errorMessage) {
      errorMessage.textContent = message;
      errorMessage.style.display = 'block';
      errorMessage.style.color = '#ff9800';
      errorMessage.style.backgroundColor = '#fff3e0';
      errorMessage.style.borderColor = '#ff9800';
      errorMessage.style.border = '1px solid #ff9800';
      errorMessage.style.padding = '12px';
      errorMessage.style.borderRadius = '4px';
      errorMessage.style.margin = '10px 0';
      // 警告消息不自动隐藏，需要手动解决
    }
  }

  // 显示查看器
  function showViewer() {
    if (!viewerContainer) return;
    // 如果使用高级查看器，不要重写容器内容，仅标记状态
    if (useAdvancedViewer && o3dvWrapper) {
      if (modelViewer) modelViewer.classList.add('has-model');
      return;
    }
    if (modelViewer) {
      modelViewer.classList.add('has-model');
    }
  }

  // 显示查看器占位符
  function showViewerPlaceholder(fileData) {
    // 若高级查看器启用，则不覆盖容器
    if (useAdvancedViewer && o3dvWrapper) return;
    if (viewerContainer) {
      const is2D = is2DFile(fileData.file.name);
      const iconPath = is2D ? 
        'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' :
        'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z';
      
      viewerContainer.innerHTML = `
        <div style="text-align: center; color: #666;">
          <div style="width: 100px; height: 100px; background: #e0e0e0; border-radius: 8px; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="${iconPath}"></path>
            </svg>
          </div>
          <p>${is2D ? '2D图纸已加载' : '3D模型已加载'}</p>
          ${fileData.dimensions ? `<p style="font-size: 12px; color: #999;">尺寸: ${fileData.dimensions.width.toFixed(1)} x ${fileData.dimensions.height.toFixed(1)} x ${fileData.dimensions.depth.toFixed(1)} mm</p>` : ''}
        </div>
      `;
    }
  }

  // 清除查看器
  function clearViewer() {
    if (viewerContainer) {
      // 如果使用高级查看器，不要覆盖容器，而是隐藏加载指示器
      if (useAdvancedViewer && o3dvWrapper) {
        o3dvWrapper.hideLoadingSafely();
        // 确保查看器容器显示占位符
        const placeholder = viewerContainer.querySelector('.viewer-placeholder');
        if (placeholder) {
          placeholder.style.display = 'block';
        }
        return;
      }
      
      // 基础查看器：恢复原始占位符
      viewerContainer.innerHTML = `
        <div class="viewer-placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
            <polyline points="3.27,6.96 12,12.01 20.73,6.96"></polyline>
            <line x1="12" y1="22.08" x2="12" y2="12"></line>
          </svg>
          <p>上传3D模型文件以查看预览</p>
        </div>
      `;
    }
  }

  // 页面加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 拦截原生的产品表单提交
  function interceptNativeProductForms() {
    // 拦截所有原生的产品表单提交
    document.addEventListener('submit', function(event) {
      const form = event.target;
      
      // 检查是否是原生的产品表单（不是我们的自定义表单）
      if (form.action && form.action.includes('/cart/add') && form.id !== 'add-form') {
        console.log('Intercepting native product form submission');
        
        // 检查是否有验证错误
        if (fileManager.files.size === 0) {
          event.preventDefault();
          showError('请先上传3D模型文件');
          return false;
        }
        
        // 检查当前文件是否有错误
        const currentFileData = fileManager.files.get(fileManager.currentFileId);
        if (currentFileData) {
          validateFileConfiguration(currentFileData);
          
          // 如果按钮被禁用，说明有错误
          const addToCartBtn = document.getElementById('add-to-cart');
          if (addToCartBtn && addToCartBtn.disabled) {
            event.preventDefault();
            console.log('Blocked native form submission due to validation errors');
            return false;
          }
        }
      }
    });
    
    // 拦截原生的添加到购物车按钮点击
    document.addEventListener('click', function(event) {
      const button = event.target.closest('button');
      if (button && button.type === 'submit' && button.form && button.form.action && button.form.action.includes('/cart/add') && button.form.id !== 'add-form') {
        console.log('Intercepting native add to cart button click');
        
        // 检查是否有验证错误
        if (fileManager.files.size === 0) {
          event.preventDefault();
          showError('请先上传3D模型文件');
          return false;
        }
        
        // 检查当前文件是否有错误
        const currentFileData = fileManager.files.get(fileManager.currentFileId);
        if (currentFileData) {
          validateFileConfiguration(currentFileData);
          
          // 如果按钮被禁用，说明有错误
          const addToCartBtn = document.getElementById('add-to-cart');
          if (addToCartBtn && addToCartBtn.disabled) {
            event.preventDefault();
            console.log('Blocked native button click due to validation errors');
            return false;
          }
        }
      }
    });
  }

  // ==================== Online3DViewer集成函数 ====================

  // 初始化高级3D查看器
  function initAdvancedViewer() {
    console.log('Initializing Advanced 3D Viewer...');
    
    // 检查是否可以使用Online3DViewer
    if (typeof O3DVWrapper !== 'undefined' && typeof OV !== 'undefined') {
      try {
        o3dvWrapper = new O3DVWrapper('viewer-container', {
          backgroundColor: { r: 245, g: 247, b: 250, a: 255 },
          defaultColor: { r: 197, g: 197, b: 197 },
          showEdges: true,
          edgeColor: { r: 0, g: 0, b: 0 },
          edgeThreshold: 20,
        });
        
        useAdvancedViewer = true;
        console.log('Advanced 3D Viewer initialized successfully');
        
        // 添加查看器控制按钮
        addViewerControls();
        
      } catch (error) {
        console.error('Failed to initialize Advanced 3D Viewer:', error);
        useAdvancedViewer = false;
        // 回退到基础Three.js查看器
        initViewer();
      }
    } else {
      console.log('O3DV not available, using basic viewer');
      useAdvancedViewer = false;
      // 回退到基础Three.js查看器
      initViewer();
    }
  }

  // 添加查看器控制按钮
  function addViewerControls() {
    // 临时关闭右上角的高级工具按钮（重置视图 / 测量 / 标注 / 导出），避免误导用户
    // 如需重新启用，只需删除下面这一行 return 即可。
    return;

    if (!viewerContainer || !o3dvWrapper) return;

    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'viewer-controls';
    controlsContainer.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      z-index: 1000;
      display: flex;
      gap: 8px;
      flex-direction: column;
    `;

    // 重置视图按钮
    const resetBtn = createControlButton('重置视图', '🔄', () => {
      o3dvWrapper.resetView();
    });

    // 测量按钮
    const measureBtn = createControlButton('测量', '📏', () => {
      o3dvWrapper.enableMeasurement();
    });

    // 标注按钮
    const annotateBtn = createControlButton('标注', '📝', () => {
      o3dvWrapper.enableAnnotation();
    });

    // 导出按钮
    const exportBtn = createControlButton('导出', '💾', () => {
      o3dvWrapper.exportModel('stl');
    });

    controlsContainer.appendChild(resetBtn);
    controlsContainer.appendChild(measureBtn);
    controlsContainer.appendChild(annotateBtn);
    controlsContainer.appendChild(exportBtn);

    viewerContainer.appendChild(controlsContainer);
  }

  // 创建控制按钮
  function createControlButton(text, icon, onClick) {
    const button = document.createElement('button');
    button.innerHTML = `${icon} ${text}`;
    button.style.cssText = `
      background: rgba(255, 255, 255, 0.9);
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 6px 12px;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.3s ease;
      backdrop-filter: blur(10px);
    `;
    
    button.addEventListener('mouseenter', () => {
      button.style.background = 'rgba(25, 118, 210, 0.1)';
      button.style.borderColor = '#1976d2';
    });
    
    button.addEventListener('mouseleave', () => {
      button.style.background = 'rgba(255, 255, 255, 0.9)';
      button.style.borderColor = '#ddd';
    });
    
    button.addEventListener('click', onClick);
    
    return button;
  }

  // 使用高级查看器加载STP文件
  function loadSTPWithAdvancedViewer(file) {
    console.log('loadSTPWithAdvancedViewer called for file:', file.name);
    if (!o3dvWrapper || !useAdvancedViewer) {
      console.log('Advanced viewer not available, using basic viewer');
      return loadModelForFile(fileManager.currentFileId);
    }

    // 检查高级查看器是否仍然有效
    if (!o3dvWrapper.isInitialized) {
      console.log('Advanced viewer not initialized, reinitializing...');
      try {
        o3dvWrapper.init();
      } catch (error) {
        console.error('Failed to reinitialize advanced viewer:', error);
        useAdvancedViewer = false;
        initViewer();
        return loadModelForFile(fileManager.currentFileId);
      }
    }

    console.log('About to call o3dvWrapper.loadSTPFile for:', file.name);
    return o3dvWrapper.loadSTPFile(file)
      .then(() => {
        console.log('STP/STEP file loaded with advanced viewer:', file.name);
        // 更新尺寸显示
        updateDimensionsDisplay();
        // 确保所有加载指示器都隐藏
        clearLoadingAndPlaceholder();
      })
      .catch(error => {
        console.error('Failed to load STP with advanced viewer:', file.name, error);
        // 确保所有加载指示器都隐藏
        clearLoadingAndPlaceholder();
        // 回退到基本查看器
        useAdvancedViewer = false;
        initViewer();
        return loadModelForFile(fileManager.currentFileId);
      });
  }

  // 切换查看器模式
  function toggleViewerMode() {
    if (!o3dvWrapper) return;

    useAdvancedViewer = !useAdvancedViewer;
    
    if (useAdvancedViewer) {
      console.log('Switched to advanced viewer');
      // 隐藏基本查看器，显示高级查看器
      if (viewerContainer) {
        const basicViewer = viewerContainer.querySelector('.viewer-placeholder');
        if (basicViewer) {
          basicViewer.style.display = 'none';
        }
      }
  } else {
      console.log('Switched to basic viewer');
      // 显示基本查看器，隐藏高级查看器
      if (viewerContainer) {
        const basicViewer = viewerContainer.querySelector('.viewer-placeholder');
        if (basicViewer) {
          basicViewer.style.display = 'block';
        }
      }
    }
  }

  // 获取查看器信息
  function getViewerInfo() {
    if (o3dvWrapper) {
      return o3dvWrapper.getModelInfo();
    }
    return null;
  }

  // ==================== Online3DViewer集成函数结束 ====================

  // 导出到全局
  window.ModelUploader = {
    init,
    fileManager,
    selectFile,
    removeFile,
    enableAddToCart,
    // Online3DViewer集成功能
    loadSTPWithAdvancedViewer,
    toggleViewerMode,
    getViewerInfo,
    o3dvWrapper: () => o3dvWrapper
  };

  // ============== 登录与地址校验 ==============
  function ensureCustomerAuthAndAddress() {
    return new Promise((resolve) => {
      // 检查是否有管理员登录
      if (window.loginManager && window.loginManager.hasAdminAccess()) {
        showError('检测到管理员已登录，请先退出管理员登录后再进行客户操作');
        resolve(false);
        return;
      }
      
      const state = (window.customerState) || { loggedIn: false, hasAddress: false };
      
      // 如果客户已登录且有地址信息，记录到登录管理系统
      if (state.loggedIn && state.hasAddress) {
        if (window.loginManager) {
          window.loginManager.customerLogin({
            email: state.email,
            name: state.customerName || '客户',
            hasAddress: state.hasAddress
          });
        }
        resolve(true);
        return;
      }

      // 构建轻量弹窗
      const overlayId = 'auth-address-overlay';
      if (document.getElementById(overlayId)) { document.getElementById(overlayId).remove(); }
      const overlay = document.createElement('div');
      overlay.id = overlayId;
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10000;display:flex;align-items:center;justify-content:center;';
      const modal = document.createElement('div');
      modal.style.cssText = 'width:min(520px,90vw);background:#fff;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.2);overflow:hidden;';
      const header = document.createElement('div');
      header.style.cssText = 'padding:16px 20px;border-bottom:1px solid #eee;font-weight:600;';
      header.textContent = '完成账户信息后继续';
      const body = document.createElement('div');
      body.style.cssText = 'padding:16px 20px;display:flex;flex-direction:column;gap:12px;font-size:14px;color:#333;';
      const actions = document.createElement('div');
      actions.style.cssText = 'padding:14px 20px;border-top:1px solid #eee;display:flex;gap:10px;justify-content:flex-end;';

      const needLogin = !state.loggedIn;
      const needAddress = !state.hasAddress;
      if (needLogin) {
        const p = document.createElement('div');
        p.innerHTML = '您还未登录，请先登录账户。';
        body.appendChild(p);
      }
      if (needAddress) {
        const p = document.createElement('div');
        p.innerHTML = '请先添加账单地址，以便我们处理询价和后续沟通。';
        body.appendChild(p);
      }

      const btnCancel = document.createElement('button');
      btnCancel.textContent = '稍后再说';
      btnCancel.style.cssText = 'background:#f5f5f5;border:1px solid #ddd;border-radius:6px;padding:8px 14px;cursor:pointer;';
      btnCancel.onclick = () => { document.body.removeChild(overlay); resolve(false); };

      const btnPrimary = document.createElement('button');
      btnPrimary.textContent = '去完善信息';
      btnPrimary.style.cssText = 'background:#1976d2;color:#fff;border:1px solid #1976d2;border-radius:6px;padding:8px 14px;cursor:pointer;';
      btnPrimary.onclick = () => {
        // 优先引导到登录或地址页
        if (needLogin) {
          window.location.href = '/account/login?return_url=' + encodeURIComponent(window.location.pathname + window.location.search + '#resumeQuote');
        } else if (needAddress) {
          // 跳到账户地址管理页
          window.location.href = '/account/addresses?return_url=' + encodeURIComponent(window.location.pathname + window.location.search + '#resumeQuote');
        }
        resolve(false);
      };

      actions.appendChild(btnCancel);
      actions.appendChild(btnPrimary);

      modal.appendChild(header);
      modal.appendChild(body);
      modal.appendChild(actions);
      overlay.appendChild(modal);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) { document.body.removeChild(overlay); resolve(false); } });
      document.body.appendChild(overlay);
    });
  }

  // 展示信息确认弹窗
  function confirmCustomerInfo() {
    return new Promise((resolve) => {
      const state = (window.customerState) || { loggedIn: false, hasAddress: false };
      // 若仍不满足条件，直接拒绝
      if (!state.loggedIn || !state.hasAddress) { resolve(false); return; }

      const overlayId = 'confirm-info-overlay';
      if (document.getElementById(overlayId)) { document.getElementById(overlayId).remove(); }
      const overlay = document.createElement('div');
      overlay.id = overlayId;
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10000;display:flex;align-items:center;justify-content:center;';
      const modal = document.createElement('div');
      modal.style.cssText = 'width:min(560px,92vw);background:#fff;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.2);overflow:hidden;';
      const header = document.createElement('div');
      header.style.cssText = 'padding:16px 20px;border-bottom:1px solid #eee;font-weight:600;';
      header.textContent = '确认信息';
      const body = document.createElement('div');
      body.style.cssText = 'padding:16px 20px;display:flex;flex-direction:column;gap:12px;font-size:14px;color:#333;';

      const email = document.createElement('div');
      email.innerHTML = '<strong>邮箱：</strong>' + (state.email || '—');
      body.appendChild(email);

      const addr = state.address || {};
      const addressBlock = document.createElement('div');
      addressBlock.innerHTML = '<strong>账单地址：</strong>' +
        [addr.first_name, addr.last_name].filter(Boolean).join(' ') + ' ' +
        [addr.address1, addr.address2, addr.city, addr.province, addr.zip, addr.country].filter(Boolean).join('，');
      body.appendChild(addressBlock);

      const tip = document.createElement('div');
      tip.style.cssText = 'font-size:12px;color:#666;';
      tip.textContent = '请确认以上信息准确无误，点击“确认信息”后将提交询价到购物车。';
      body.appendChild(tip);

      const actions = document.createElement('div');
      actions.style.cssText = 'padding:14px 20px;border-top:1px solid #eee;display:flex;gap:10px;justify-content:flex-end;';
      const btnBack = document.createElement('button');
      btnBack.textContent = '返回修改';
      btnBack.style.cssText = 'background:#f5f5f5;border:1px solid #ddd;border-radius:6px;padding:8px 14px;cursor:pointer;';
      btnBack.onclick = () => { document.body.removeChild(overlay); resolve(false); };

      const btnOk = document.createElement('button');
      btnOk.textContent = '确认信息';
      btnOk.style.cssText = 'background:#1976d2;color:#fff;border:1px solid #1976d2;border-radius:6px;padding:8px 14px;cursor:pointer;';
      btnOk.onclick = () => { document.body.removeChild(overlay); resolve(true); };

      actions.appendChild(btnBack);
      actions.appendChild(btnOk);

      modal.appendChild(header);
      modal.appendChild(body);
      modal.appendChild(actions);
      overlay.appendChild(modal);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) { document.body.removeChild(overlay); resolve(false); } });
      document.body.appendChild(overlay);
    });
  }

  // 校验一组文件（传入集合，若不传则校验全部）
  function validateFilesSet(fileIdIterable) {
    const ids = fileIdIterable ? Array.from(fileIdIterable) : Array.from(fileManager.files.keys());
    const errors = [];
    for (const id of ids) {
      const fd = fileManager.files.get(id);
      if (!fd) { errors.push(`文件ID ${id} 不存在`); continue; }
      if (!isValidFile(fd.file)) { errors.push(`❌ 文件"${fd.file.name}"格式不支持`); }
      if (!is3DFile(fd.file.name)) { continue; }
      const need2D = fd.config && (fd.config.hasThread === 'yes' || fd.config.hasAssembly === 'yes');
      if (need2D && !hasCorresponding2DFile(id)) {
        const reason = fd.config.hasThread === 'yes' ? '螺纹' : (fd.config.hasAssembly === 'yes' ? '装配关系' : '特殊要求');
        errors.push(`❌ 文件"${fd.file.name}"已选择有${reason}，但缺少对应的2D图纸（DWG/DXF/PDF）`);
      }
    }
    return { ok: errors.length === 0, errors };
  }

  // ===== 报价面板（全屏独立界面） =====
  function ensureQuotePanel() {
    if (document.getElementById('quote-panel-overlay')) return;
    const style = document.createElement('style');
    style.textContent = `
      #quote-panel-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;z-index:10000}
      #quote-panel{position:fixed;inset:5% 10%;background:#fff;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.2);display:flex;flex-direction:column;z-index:10001}
      #quote-panel-header{padding:16px 20px;border-bottom:1px solid #eee;display:flex;align-items:center;justify-content:space-between}
      #quote-panel-title{font-size:18px;font-weight:600}
      #quote-panel-close{border:none;background:#f5f5f5;border-radius:6px;padding:8px 12px;cursor:pointer}
      #quote-panel-body{padding:16px 20px;overflow:auto}
      .quote-item{border:1px solid #eee;border-radius:8px;padding:12px 14px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center}
      .quote-left{display:flex;flex-direction:column;gap:6px}
      .quote-name{font-weight:600}
      .quote-meta{font-size:12px;color:#666}
      .quote-status{color:#1976d2;background:rgba(25,118,210,.08);padding:6px 10px;border-radius:999px;font-size:12px}
    `;
    document.head.appendChild(style);
    const overlay = document.createElement('div');
    overlay.id = 'quote-panel-overlay';
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeQuotePanel(); });
    const panel = document.createElement('div');
    panel.id = 'quote-panel';
    panel.innerHTML = `
      <div id="quote-panel-header">
        <div id="quote-panel-title">询价明细</div>
        <div>
          <button id="quote-panel-close">关闭</button>
        </div>
      </div>
      <div id="quote-panel-body"></div>
    `;
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    document.getElementById('quote-panel-close').addEventListener('click', closeQuotePanel);
  }

  function renderQuotePanel(fileIds) {
    ensureQuotePanel();
    const body = document.getElementById('quote-panel-body');
    if (!body) return;
    body.innerHTML = '';
    const ids = Array.from(fileIds);
    if (ids.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = '未勾选文件';
      body.appendChild(empty);
      return;
    }
    ids.forEach((id) => {
      const fd = fileManager.files.get(id);
      if (!fd) return;
      const div = document.createElement('div');
      div.className = 'quote-item';
      div.innerHTML = `
        <div class="quote-left">
          <div class="quote-name">${fd.file.name}</div>
          <div class="quote-meta">数量: ${fd.config.quantity || 1} ｜ 材料: ${fd.config.material || ''} ｜ 最严公差: ${fd.config.tightest || ''}</div>
        </div>
        <div class="quote-status">报价中</div>
      `;
      body.appendChild(div);
    });
  }

  function openQuotePanel(fileIds) {
    ensureQuotePanel();
    renderQuotePanel(fileIds);
    const overlay = document.getElementById('quote-panel-overlay');
    if (overlay) overlay.style.display = 'block';
  }
  function closeQuotePanel() {
    const overlay = document.getElementById('quote-panel-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  // 发送询价通知
  async function sendQuoteNotification() {
    try {
      // 收集询价数据
      const orderData = {
        uuid: `${Date.now()}-${selectedFileIds.size}-${Math.random().toString(16).slice(2)}`,
        customer: window.customerState?.customerName || '未知客户',
        email: window.customerState?.email || '',
        phone: window.customerState?.phone || '',
        files: Array.from(selectedFileIds).map(id => {
          const fd = fileManager.files.get(id);
          return fd ? fd.file.name : '未知文件';
        }).join(', '),
        fileType: '3D模型',
        uploadTime: new Date().toLocaleString('zh-CN'),
        quantity: 1,
        material: '待确认',
        tightest: '待确认',
        surfaceTreatment: '待确认',
        note: '客户询价请求'
      };

      // 发送邮件通知
      if (window.emailNotificationSystem) {
        await window.emailNotificationSystem.sendQuoteNotification(orderData);
        await window.emailNotificationSystem.sendInternalNotification(orderData);
      }

      console.log('询价通知已发送:', orderData);
    } catch (error) {
      console.error('发送询价通知失败:', error);
    }
  }
})();
