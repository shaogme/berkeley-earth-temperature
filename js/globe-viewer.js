import { GlobeBoundaries } from './globe-boundaries.js';

export class GlobeViewer {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 0, 15);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        document.body.appendChild(this.renderer.domElement);

        this.labelRenderer = new THREE.CSS2DRenderer();
        this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
        this.labelRenderer.domElement.style.position = 'absolute';
        this.labelRenderer.domElement.style.top = '0px';
        this.labelRenderer.domElement.style.pointerEvents = 'none';
        document.body.appendChild(this.labelRenderer.domElement);

        this.clock = new THREE.Clock();
        this.radius = 5;

        this.initLights();
        this.initControls();
        this.initStarField();
        this.initEarth();
        
        // 实例化边界与国家标签管理模块
        this.boundariesManager = new GlobeBoundaries(this);

        this.initAtmosphereGlow();
        this.initMarker();
        this.initResize();

        // 初始化射线检测与悬浮 Tooltip 相关的属性
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.currentTempData = null;
        this.initTooltip();
    }

    initLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xddf0ff, 0.6);
        directionalLight.position.set(10, 8, 10);
        this.scene.add(directionalLight);

        const backlight = new THREE.DirectionalLight(0x00f0ff, 0.3);
        backlight.position.set(-10, -5, -10);
        this.scene.add(backlight);
    }

    initControls() {
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 6.5;
        this.controls.maxDistance = 30;

    }

    initStarField() {
        const starsGeometry = new THREE.BufferGeometry();
        const starsCount = 1800;
        const starPositions = new Float32Array(starsCount * 3);
        const starColors = new Float32Array(starsCount * 3);

        for (let i = 0; i < starsCount * 3; i += 3) {
            const u = Math.random();
            const v = Math.random();
            const theta = u * 2.0 * Math.PI;
            const phi = Math.acos(2.0 * v - 1.0);
            const r = 80 + Math.random() * 70;

            starPositions[i] = r * Math.sin(phi) * Math.cos(theta);
            starPositions[i + 1] = r * Math.sin(phi) * Math.sin(theta);
            starPositions[i + 2] = r * Math.cos(phi);

            const mixColor = Math.random();
            if (mixColor > 0.6) {
                starColors[i] = 0.8;
                starColors[i + 1] = 0.9;
                starColors[i + 2] = 1.0;
            } else if (mixColor > 0.3) {
                starColors[i] = 1.0;
                starColors[i + 1] = 0.9;
                starColors[i + 2] = 0.8;
            } else {
                starColors[i] = 1.0;
                starColors[i + 1] = 1.0;
                starColors[i + 2] = 1.0;
            }
        }

        starsGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
        starsGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));

        const starsMaterial = new THREE.PointsMaterial({
            size: 0.45,
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
            sizeAttenuation: true
        });

        this.starField = new THREE.Points(starsGeometry, starsMaterial);
        this.scene.add(this.starField);
    }

    initEarth() {
        const geometry = new THREE.SphereGeometry(this.radius, 64, 64);
        const textureLoader = new THREE.TextureLoader();
        const earthTexture = textureLoader.load('earth.jpg');
        
        // 创建一个空白的初始温度数据纹理，填充为无效
        const initialData = new Uint8Array(360 * 180 * 4);
        for(let i = 0; i < 360 * 180; i++) {
            initialData[i * 4] = 128;     // R: 0度对应的归一化中间值
            initialData[i * 4 + 1] = 0;   // G: 0表示无效(不渲染)
            initialData[i * 4 + 2] = 0;   // B: 保留
            initialData[i * 4 + 3] = 255; // A: 不透明
        }
        
        this.tempTexture = new THREE.DataTexture(
            initialData, 360, 180, THREE.RGBAFormat, THREE.UnsignedByteType
        );
        this.tempTexture.minFilter = THREE.LinearFilter;
        this.tempTexture.magFilter = THREE.LinearFilter;
        this.tempTexture.needsUpdate = true;

        // 自定义高级着色器材质 (ShaderMaterial)
        this.earthMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uEarthTex: { value: earthTexture },
                uTempTex: { value: this.tempTexture },
                uOpacity: { value: 0.8 }, // 默认不透明度为 0.8
                uLightDirection: { value: new THREE.Vector3(0, 0, 1) } // 从摄影机位置打光 (在视图空间中，相机永远朝向 -z，朝向相机的方向即为 (0,0,1))
            },
            vertexShader: `
                varying vec3 vNormal;
                varying vec2 vUv;
                varying vec3 vViewPosition;
                void main() {
                    vNormal = normalize(normalMatrix * normal);
                    vUv = uv;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    vViewPosition = -mvPosition.xyz;
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform sampler2D uEarthTex;
                uniform sampler2D uTempTex;
                uniform float uOpacity;
                uniform vec3 uLightDirection;
                
                varying vec3 vNormal;
                varying vec2 vUv;
                varying vec3 vViewPosition;

                // 精美的温度-色彩渐变映射函数
                vec3 getTempColor(float t) {
                    vec3 c1 = vec3(0.035, 0.518, 0.890); // -40C (#0984e3)
                    vec3 c2 = vec3(0.0, 0.808, 0.788);   // -20C (#00cec9)
                    vec3 c3 = vec3(1.0, 0.918, 0.655);   // 0C (#ffeaa7)
                    vec3 c4 = vec3(1.0, 0.463, 0.459);   // 20C (#ff7675)
                    vec3 c5 = vec3(0.839, 0.188, 0.192); // 40C (#d63031)

                    if (t < 0.25) {
                        return mix(c1, c2, t * 4.0);
                    } else if (t < 0.5) {
                        return mix(c2, c3, (t - 0.25) * 4.0);
                    } else if (t < 0.75) {
                        return mix(c3, c4, (t - 0.5) * 4.0);
                    } else {
                        return mix(c4, c5, (t - 0.75) * 4.0);
                    }
                }

                void main() {
                    vec4 earthColor = texture2D(uEarthTex, vUv);
                    vec4 tempSample = texture2D(uTempTex, vUv);
                    
                    float tempNormalized = tempSample.r;
                    float isValid = tempSample.g; // 1.0(255)为有效，0.0(0)为无效

                    // 基础光照计算 (Lambert)，采用从摄影机打光的视角，并使用较柔和的过渡防止侧面发暗
                    vec3 normal = normalize(vNormal);
                    float diffuse = max(dot(normal, uLightDirection), 0.0) * 0.6 + 0.4; // 0.4 为较高的环境底光，0.6 为光照系数，保持立体感的同时解决侧面发暗问题

                    vec3 finalRgb = earthColor.rgb;

                    if (isValid > 0.5) {
                        vec3 tempColor = getTempColor(tempNormalized);
                        // 进行混合：在陆地温度覆盖区域，按透明度混合绝对气温色与基础地形贴图
                        finalRgb = mix(earthColor.rgb, tempColor, uOpacity);
                    }

                    // 施加光照阴影，保持 3D 立体感
                    gl_FragColor = vec4(finalRgb * diffuse, 1.0);
                }
            `
        });

        this.earth = new THREE.Mesh(geometry, this.earthMaterial);
        this.scene.add(this.earth);
        this.earthMaterial.needsUpdate = true;
    }

    initAtmosphereGlow() {
        const vertexShader = `
            varying vec3 vNormal;
            void main() {
                vNormal = normalize(normalMatrix * normal);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;
        const fragmentShader = `
            varying vec3 vNormal;
            void main() {
                float intensity = pow(0.65 - dot(vNormal, vec3(0, 0, 1.0)), 2.5);
                gl_FragColor = vec4(0.0, 0.75, 1.0, 1.0) * intensity;
            }
        `;

        const glowMaterial = new THREE.ShaderMaterial({
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            blending: THREE.AdditiveBlending,
            side: THREE.BackSide,
            transparent: true
        });

        const glowGeometry = new THREE.SphereGeometry(this.radius * 1.12, 64, 64);
        const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
        this.scene.add(glowMesh);
    }

    // 废弃旧的 Marker 机制
    initMarker() {
        // 无需做任何动作，保持函数存在防报错
    }

    initResize() {
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    // 新增：动态更新温度数据纹理的方法
    // arrayData 格式为 Float32Array 包含 180 * 360 个绝对温度值
    updateTemperatureTexture(arrayData) {
        this.currentTempData = arrayData;
        if (!this.tempTexture) return;

        const data = this.tempTexture.image.data;
        
        // NetCDF 的纬度一般是从 -89.5 到 89.5 (180个，南到北)
        // 经度一般是从 -179.5 到 179.5 (360个，西到东)
        // Three.js 的球体贴图 UV 坐标：
        // U 对应 经度 [0, 1] => [-180, 180]
        // V 对应 纬度 [0, 1] => [-90, 90]
        for (let i = 0; i < 360 * 180; i++) {
            const val = arrayData[i];
            
            if (isNaN(val) || val === null) {
                // 无效数据（例如缺测，或者海洋点如果没有被陆地掩码所排除）
                data[i * 4] = 0;
                data[i * 4 + 1] = 0; // G = 0 代表无效
            } else {
                // 绝对温度范围限制在 [-40, 40] 之间进行归一化
                const clamped = Math.max(-40, Math.min(40, val));
                const normalized = (clamped + 40) / 80; // 映射到 [0, 1]
                
                data[i * 4] = Math.round(normalized * 255); // R: 温度值
                data[i * 4 + 1] = 255;                      // G: 255 代表有效
            }
            data[i * 4 + 2] = 0;   // B
            data[i * 4 + 3] = 255; // A
        }

        this.tempTexture.needsUpdate = true;
    }

    // 设置温度图层不透明度
    setTemperatureOpacity(opacity) {
        if (this.earthMaterial && this.earthMaterial.uniforms.uOpacity) {
            this.earthMaterial.uniforms.uOpacity.value = opacity;
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const elapsedTime = this.clock.getElapsedTime();


        this.starField.rotation.y = elapsedTime * 0.002;
        this.starField.rotation.x = elapsedTime * 0.001;

        if (this.boundariesManager) {
            this.boundariesManager.updateLabels();
        }
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
        this.labelRenderer.render(this.scene, this.camera);
    }

    start() {
        this.animate();
    }

    // 初始化悬浮气温 Tooltip 容器和事件绑定
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

    // 鼠标移动时执行射线检测与温度值查询
    onMouseMove(event) {
        if (!this.earth || !this.currentTempData) {
            this.tooltipEl.style.display = 'none';
            return;
        }

        // 1. 计算鼠标在 NDC 空间中的归一化坐标
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        // 2. 实时更新 Tooltip 的物理位置，并增加边界保护防止出界
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

        // 3. 执行射线相交检测
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObject(this.earth);

        if (intersects.length > 0) {
            const intersect = intersects[0];
            if (intersect.uv) {
                const u = intersect.uv.x;
                const v = intersect.uv.y;

                // 4. 将贴图 UV 映射到 180 * 360 网格坐标系中
                // 360表示经度格点数，180表示纬度格点数
                const lon_idx = Math.floor(u * 360) % 360;
                const lat_idx = Math.floor(v * 180) % 180;
                const idx = lat_idx * 360 + lon_idx;

                const temp = this.currentTempData[idx];

                // 5. 过滤并仅对陆地/有效气温点展示
                if (temp !== undefined && temp !== null && !isNaN(temp)) {
                    // 精确计算并在 UI 展示地理位置与气温
                    const lat = (v * 180 - 90).toFixed(1);
                    const lon = (u * 360 - 180).toFixed(1);
                    const latStr = lat >= 0 ? `${lat}°N` : `${Math.abs(lat)}°S`;
                    const lonStr = lon >= 0 ? `${lon}°E` : `${Math.abs(lon)}°W`;

                    this.tooltipEl.innerHTML = `
                        <div class="tooltip-coords">📍 ${latStr}, ${lonStr}</div>
                        <div class="tooltip-temp">🌡️ ${temp.toFixed(1)} °C</div>
                    `;
                    this.tooltipEl.style.display = 'block';
                    return;
                }
            }
        }

        // 未击中地球或击中无效网格点，隐藏 Tooltip
        this.tooltipEl.style.display = 'none';
    }
}
