export class BaseViewer {
    constructor() {
        this.currentTempData = null;
        this.opacity = 0.8;
        this.isActive = false;

        // 初始化 Three.js 核心场景对象
        this.scene = new THREE.Scene();
        this.camera = null; // 由子类具体实例化 (PerspectiveCamera / OrthographicCamera)

        // 初始化 WebGL 渲染器
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.domElement.style.display = 'none'; // 默认隐藏，由各视图的 show/hide 方法控制
        document.body.appendChild(this.renderer.domElement);

        // 初始化 2D 标签渲染器
        this.labelRenderer = new THREE.CSS2DRenderer();
        this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
        this.labelRenderer.domElement.style.position = 'absolute';
        this.labelRenderer.domElement.style.top = '0px';
        this.labelRenderer.domElement.style.pointerEvents = 'none';
        this.labelRenderer.domElement.style.zIndex = '1';
        this.labelRenderer.domElement.style.display = 'none'; // 默认隐藏
        document.body.appendChild(this.labelRenderer.domElement);

        this.clock = new THREE.Clock();
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        // 共享的 3D/2D 地图网格及纹理引用
        this.earth = null;
        this.tempTexture = null;
        this.earthMaterial = null;
        this.tooltipEl = null;
        this.controls = null;
    }

    init() {
        throw new Error('init() must be implemented');
    }

    initResize() {
        window.addEventListener('resize', () => {
            if (!this.camera) return;
            if (this.camera.isPerspectiveCamera) {
                this.camera.aspect = window.innerWidth / window.innerHeight;
            } else if (this.camera.isOrthographicCamera) {
                const aspect = window.innerWidth / window.innerHeight;
                const viewHeight = 12;
                const viewWidth = viewHeight * aspect;
                this.camera.left = -viewWidth / 2;
                this.camera.right = viewWidth / 2;
                this.camera.top = viewHeight / 2;
                this.camera.bottom = -viewHeight / 2;
            }
            this.camera.updateProjectionMatrix();

            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    updateTemperatureTexture(arrayData, isAnomaly = false) {
        this.currentTempData = arrayData;
        this.isAnomalyMode = isAnomaly;
        if (!this.tempTexture) return;

        const data = this.tempTexture.image.data;
        for (let i = 0; i < 360 * 180; i++) {
            const val = arrayData[i];
            if (isNaN(val) || val === null) {
                data[i * 4] = 0;
                data[i * 4 + 1] = 0; // G = 0 代表无效
            } else {
                if (isAnomaly) {
                    const clamped = Math.max(-8, Math.min(8, val));
                    const normalized = (clamped + 8) / 16;
                    data[i * 4] = Math.round(normalized * 255); // R: 温度距平值
                } else {
                    const clamped = Math.max(-40, Math.min(40, val));
                    const normalized = (clamped + 40) / 80;
                    data[i * 4] = Math.round(normalized * 255); // R: 绝对温度值
                }
                data[i * 4 + 1] = 255;                      // G: 255 代表有效
            }
            data[i * 4 + 2] = 0;   // B
            data[i * 4 + 3] = 255; // A
        }
        this.tempTexture.needsUpdate = true;
    }

    setTemperatureOpacity(opacity) {
        this.opacity = opacity;
        if (this.earthMaterial && this.earthMaterial.uniforms && this.earthMaterial.uniforms.uOpacity) {
            this.earthMaterial.uniforms.uOpacity.value = opacity;
        }
    }

    setLayerMode(mode) {
        if (this.earthMaterial && this.earthMaterial.uniforms && this.earthMaterial.uniforms.uLayerMode) {
            this.earthMaterial.uniforms.uLayerMode.value = mode;
            this.earthMaterial.needsUpdate = true;
        }
    }

    show() {
        this.isActive = true;
        this.renderer.domElement.style.display = 'block';
        this.labelRenderer.domElement.style.display = 'block';
        if (this.controls) this.controls.enabled = true;
    }

    hide() {
        this.isActive = false;
        this.renderer.domElement.style.display = 'none';
        this.labelRenderer.domElement.style.display = 'none';
        if (this.tooltipEl) this.tooltipEl.style.display = 'none';
        if (this.controls) this.controls.enabled = false;
    }

    initTooltip() {
        this.tooltipEl = document.createElement('div');
        this.tooltipEl.className = 'temp-tooltip';
        this.tooltipEl.style.position = 'absolute';
        this.tooltipEl.style.display = 'none';
        this.tooltipEl.style.pointerEvents = 'none';
        this.tooltipEl.style.zIndex = '1000';
        document.body.appendChild(this.tooltipEl);

        window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    }

    onMouseMove(event) {
        if (!this.isActive) return;
        const overlay = document.getElementById('chart-overlay');
        if (overlay && overlay.style.display !== 'none') {
            this.tooltipEl.style.display = 'none';
            return;
        }
        const ctxMenu = document.getElementById('context-menu');
        if (ctxMenu && ctxMenu.style.display !== 'none') {
            this.tooltipEl.style.display = 'none';
            return;
        }
        if (!this.earth || !this.currentTempData) {
            this.tooltipEl.style.display = 'none';
            return;
        }

        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        let left = event.clientX + 15;
        let top = event.clientY + 15;
        const tooltipWidth = 160; 
        const tooltipHeight = 70;
        if (left + tooltipWidth > window.innerWidth) {
            left = event.clientX - tooltipWidth - 15;
        }
        if (top + tooltipHeight > window.innerHeight) {
            top = event.clientY - tooltipHeight - 15;
        }
        this.tooltipEl.style.left = `${left}px`;
        this.tooltipEl.style.top = `${top}px`;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObject(this.earth);

        if (intersects.length > 0) {
            const intersect = intersects[0];
            if (intersect.uv) {
                const u = intersect.uv.x;
                const v = intersect.uv.y;

                const lon_idx = Math.floor(u * 360) % 360;
                const lat_idx = Math.floor(v * 180) % 180;
                const idx = lat_idx * 360 + lon_idx;

                const temp = this.currentTempData[idx];

                if (temp !== undefined && temp !== null && !isNaN(temp)) {
                    const lat = (v * 180 - 90).toFixed(1);
                    const lon = (u * 360 - 180).toFixed(1);
                    const latStr = lat >= 0 ? `${lat}°N` : `${Math.abs(lat)}°S`;
                    const lonStr = lon >= 0 ? `${lon}°E` : `${Math.abs(lon)}°W`;

                    const tempSign = temp >= 0 ? '+' : '';
                    const tempLabel = this.isAnomalyMode ? `距平: ${tempSign}${temp.toFixed(1)} °C` : `温度: ${temp.toFixed(1)} °C`;

                    this.tooltipEl.innerHTML = `
                        <div class="tooltip-coords">📍 ${latStr}, ${lonStr}</div>
                        <div class="tooltip-temp">🌡️ ${tempLabel}</div>
                    `;
                    this.tooltipEl.style.display = 'block';
                    return;
                }
            }
        }

        this.tooltipEl.style.display = 'none';
    }

    createTemperatureTexture() {
        const initialData = new Uint8Array(360 * 180 * 4);
        for (let i = 0; i < 360 * 180; i++) {
            initialData[i * 4] = 128;     // R: 0度对应的归一化中间值
            initialData[i * 4 + 1] = 0;   // G: 0表示无效(不渲染)
            initialData[i * 4 + 2] = 0;   // B: 保留
            initialData[i * 4 + 3] = 255; // A: 不透明
        }
        
        const tempTexture = new THREE.DataTexture(
            initialData, 360, 180, THREE.RGBAFormat, THREE.UnsignedByteType
        );
        tempTexture.minFilter = THREE.LinearFilter;
        tempTexture.magFilter = THREE.LinearFilter;
        tempTexture.needsUpdate = true;
        return tempTexture;
    }

    initContextMenu() {
        this.renderer.domElement.addEventListener('contextmenu', (e) => {
            if (!this.isActive) return;
            e.preventDefault();
            const info = this.getLatLonFromClick(e);
            if (info) {
                const customEvent = new CustomEvent('globe-contextmenu', {
                    detail: {
                        lat: info.lat,
                        lon: info.lon,
                        latIdx: info.latIdx,
                        lonIdx: info.lonIdx,
                        clientX: e.clientX,
                        clientY: e.clientY
                    }
                });
                window.dispatchEvent(customEvent);
            } else {
                window.dispatchEvent(new CustomEvent('globe-contextmenu-hide'));
            }
        });
    }

    getLatLonFromClick(event) {
        if (!this.earth) return null;

        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObject(this.earth);

        if (intersects.length > 0) {
            const uv = intersects[0].uv;
            if (!uv) return null;
            const lonIdx = Math.floor(uv.x * 360) % 360;
            const latIdx = Math.floor(uv.y * 180) % 180;
            const lat = uv.y * 180 - 90;
            const lon = uv.x * 360 - 180;
            return { lat, lon, latIdx, lonIdx };
        }
        return null;
    }

    destroy() {}
}

