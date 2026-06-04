import { BaseViewer } from './base-viewer.js';
import { loadBoundariesGeoJSON } from './geojson-loader.js';

export class FlatViewer extends BaseViewer {
    constructor() {
        super();
        
        // 使用正交相机来实现完美的 2D 效果，无透视畸变
        // 投影宽高比例对应经纬度 360:180
        const aspect = window.innerWidth / window.innerHeight;
        const viewHeight = 12; 
        const viewWidth = viewHeight * aspect;
        
        this.camera = new THREE.OrthographicCamera(
            -viewWidth / 2, viewWidth / 2,
            viewHeight / 2, -viewHeight / 2,
            0.1, 1000
        );
        this.camera.position.set(0, 0, 10);
        
        // 2D 平面尺寸定义：宽 20, 高 10 （比例 2:1，对应经纬度比例）
        this.planeWidth = 20;
        this.planeHeight = 10;

        this.initLights();
        this.initControls();
        this.initStarField();
        this.initFlatEarth();
        this.initBoundaries();
        this.initResize();

        this.initTooltip();
        this.initContextMenu();
    }

    initLights() {
        // 2D 模式下采用均匀光照即可
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
        this.scene.add(ambientLight);
    }

    initControls() {
        // 平面模式使用普通的 OrbitControls，但限制旋转角度，使其只能进行 2D 平移和缩放
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.enableRotate = false; // 禁用三维旋转
        this.controls.minZoom = 0.5;
        this.controls.maxZoom = 4.0;

        // 修改鼠标映射：将左键设为平移 (Panning)，而不是默认的右键平移
        this.controls.mouseButtons = {
            LEFT: THREE.MOUSE.PAN,      // 左键平移拖拽
            MIDDLE: THREE.MOUSE.DOLLY,  // 中键缩放
            RIGHT: THREE.MOUSE.ROTATE   // 右键旋转（这里因为 enableRotate=false，右键将被忽略/失效）
        };
    }

    initStarField() {
        // 创建背景粒子
        const starsGeometry = new THREE.BufferGeometry();
        const starsCount = 800;
        const starPositions = new Float32Array(starsCount * 3);
        const starColors = new Float32Array(starsCount * 3);

        for (let i = 0; i < starsCount * 3; i += 3) {
            starPositions[i] = (Math.random() - 0.5) * 60;
            starPositions[i + 1] = (Math.random() - 0.5) * 40;
            starPositions[i + 2] = -10; // 放置在平面后方

            starColors[i] = 0.4 + Math.random() * 0.4;
            starColors[i + 1] = 0.6 + Math.random() * 0.4;
            starColors[i + 2] = 1.0;
        }

        starsGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
        starsGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));

        const starsMaterial = new THREE.PointsMaterial({
            size: 0.15,
            vertexColors: true,
            transparent: true,
            opacity: 0.5
        });

        this.starField = new THREE.Points(starsGeometry, starsMaterial);
        this.scene.add(this.starField);
    }

    initFlatEarth() {
        const geometry = new THREE.PlaneGeometry(this.planeWidth, this.planeHeight);
        const textureLoader = new THREE.TextureLoader();
        const earthTexture = textureLoader.load('earth.jpg');

        const initialData = new Uint8Array(360 * 180 * 4);
        for(let i = 0; i < 360 * 180; i++) {
            initialData[i * 4] = 128;
            initialData[i * 4 + 1] = 0;
            initialData[i * 4 + 2] = 0;
            initialData[i * 4 + 3] = 255;
        }
        
        this.tempTexture = new THREE.DataTexture(
            initialData, 360, 180, THREE.RGBAFormat, THREE.UnsignedByteType
        );
        this.tempTexture.minFilter = THREE.LinearFilter;
        this.tempTexture.magFilter = THREE.LinearFilter;
        this.tempTexture.needsUpdate = true;

        // 复用 3D 的温度-色彩着色器，简化光照计算
        this.earthMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uEarthTex: { value: earthTexture },
                uTempTex: { value: this.tempTexture },
                uOpacity: { value: 0.8 },
                uLightDirection: { value: new THREE.Vector3(0, 0, 1) }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D uEarthTex;
                uniform sampler2D uTempTex;
                uniform float uOpacity;
                
                varying vec2 vUv;

                vec3 getTempColor(float t) {
                    vec3 c1 = vec3(0.035, 0.518, 0.890); // -40C
                    vec3 c2 = vec3(0.0, 0.808, 0.788);   // -20C
                    vec3 c3 = vec3(1.0, 0.918, 0.655);   // 0C
                    vec3 c4 = vec3(1.0, 0.463, 0.459);   // 20C
                    vec3 c5 = vec3(0.839, 0.188, 0.192); // 40C

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
                    float isValid = tempSample.g;

                    vec3 finalRgb = earthColor.rgb;

                    if (isValid > 0.5) {
                        vec3 tempColor = getTempColor(tempNormalized);
                        finalRgb = mix(earthColor.rgb, tempColor, uOpacity);
                    }

                    gl_FragColor = vec4(finalRgb, 1.0);
                }
            `
        });

        this.earth = new THREE.Mesh(geometry, this.earthMaterial);
        this.scene.add(this.earth);
    }

    initBoundaries() {
        this.countryLabelsGroup = new THREE.Group();
        this.scene.add(this.countryLabelsGroup);

        loadBoundariesGeoJSON()
            .then(geojson => {
                const vertices = [];
                geojson.features.forEach(feature => {
                    if (!feature.geometry) return;
                    const type = feature.geometry.type;
                    const coordinates = feature.geometry.coordinates;

                    if (type === 'Polygon') {
                        this.processPolygon(coordinates, vertices);
                    } else if (type === 'MultiPolygon') {
                        coordinates.forEach(polygonCoords => {
                            this.processPolygon(polygonCoords, vertices);
                        });
                    }

                    // 创建 2D 标签
                    const props = feature.properties || {};
                    const a3 = props.A3 || props.a3 || "";
                    
                    const countryNameMap = {
                        'CHN': '中国', 'USA': '美国', 'RUS': '俄罗斯', 'BRA': '巴西',
                        'AUS': '澳大利亚', 'IND': '印度', 'CAN': '加拿大', 'ZAF': '南非',
                        'FRA': '法国', 'DEU': '德国', 'GBR': '英国', 'JPN': '日本',
                        'KOR': '韩国', 'ITA': '意大利', 'ESP': '西班牙', 'ARG': '阿根廷',
                        'MEX': '墨西哥', 'EGY': '埃及', 'SAU': '沙特阿拉伯', 'IDN': '印尼',
                        'TUR': '土耳其', 'KAZ': '哈萨克斯坦', 'MNG': '蒙古', 'GRL': '格陵兰',
                        'CHL': '智利', 'SWE': '瑞典', 'NOR': '挪威', 'FIN': '芬兰',
                        'IRN': '伊朗', 'PAK': '巴基斯坦', 'NGA': '尼日利亚', 'DZA': '阿尔及利亚',
                        'SDN': '苏丹', 'KEN': '肯尼亚', 'THA': '泰国', 'VNM': '越南',
                        'PHL': '菲律宾', 'NZL': '新西兰', 'PER': '秘鲁', 'COL': '哥伦比亚',
                        'VEN': '委内瑞拉', 'BOL': '玻利维亚', 'LBY': '利比亚', 'MDG': '马达加斯加',
                        'UKR': '乌克兰', 'POL': '波兰'
                    };

                    const displayName = countryNameMap[a3];
                    if (displayName) {
                        const customCentroids = {
                            'CHN': { lat: 35.8617, lng: 104.1954 },
                            'USA': { lat: 37.0902, lng: -95.7129 },
                            'RUS': { lat: 61.5240, lng: 105.3188 },
                            'BRA': { lat: -14.2350, lng: -51.9253 },
                            'AUS': { lat: -25.2744, lng: 133.7751 },
                            'IND': { lat: 21.0000, lng: 78.9629 },
                            'CAN': { lat: 56.1304, lng: -106.3468 },
                            'ZAF': { lat: -30.5595, lng: 22.9375 },
                            'FRA': { lat: 46.2276, lng: 2.2137 },
                            'DEU': { lat: 51.1657, lng: 10.4515 },
                            'GBR': { lat: 54.3781, lng: -2.4360 },
                            'JPN': { lat: 36.2048, lng: 138.2529 },
                            'KOR': { lat: 35.9078, lng: 127.7669 },
                            'ITA': { lat: 41.8719, lng: 12.5674 },
                            'ESP': { lat: 40.4637, lng: -3.7492 },
                            'ARG': { lat: -38.4161, lng: -63.6167 },
                            'MEX': { lat: 23.6345, lng: -102.5528 },
                            'EGY': { lat: 26.8206, lng: 30.8025 },
                            'SAU': { lat: 23.8859, lng: 45.0792 },
                            'IDN': { lat: -0.7893, lng: 113.9213 },
                            'TUR': { lat: 38.9637, lng: 35.2433 },
                            'KAZ': { lat: 48.0196, lng: 66.9237 },
                            'MNG': { lat: 46.8625, lng: 103.8467 },
                            'GRL': { lat: 72.0000, lng: -40.0000 },
                            'CHL': { lat: -35.6751, lng: -71.5430 },
                            'SWE': { lat: 60.1282, lng: 18.6435 },
                            'NOR': { lat: 60.4720, lng: 8.4689 },
                            'FIN': { lat: 61.9241, lng: 25.7482 },
                            'IRN': { lat: 32.4279, lng: 53.6880 },
                            'PAK': { lat: 30.3753, lng: 69.3451 },
                            'NGA': { lat: 9.0820, lng: 8.6753 },
                            'DZA': { lat: 28.0339, lng: 1.6596 },
                            'SDN': { lat: 12.8628, lng: 30.2176 },
                            'KEN': { lat: -0.0236, lng: 37.9062 },
                            'THA': { lat: 15.8700, lng: 100.9925 },
                            'VNM': { lat: 14.0583, lng: 108.2772 },
                            'PHL': { lat: 12.8797, lng: 121.7740 },
                            'NZL': { lat: -40.9006, lng: 174.8860 },
                            'PER': { lat: -9.1900, lng: -75.0152 },
                            'COL': { lat: 4.5709, lng: -74.2973 },
                            'VEN': { lat: 6.4238, lng: -66.5897 },
                            'BOL': { lat: -16.2902, lng: -63.5887 },
                            'LBY': { lat: 26.3351, lng: 17.2283 },
                            'MDG': { lat: -18.7669, lng: 46.8691 },
                            'UKR': { lat: 48.3794, lng: 31.1656 },
                            'POL': { lat: 51.9194, lng: 19.1451 }
                        };

                        let centroid = customCentroids[a3];
                        if (centroid) {
                            this.createCountryLabel(displayName, centroid.lat, centroid.lng);
                        }
                    }
                });

                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

                const material = new THREE.LineBasicMaterial({
                    color: 0x00f0ff,
                    transparent: true,
                    opacity: 0.35,
                    linewidth: 1
                });

                this.boundaries = new THREE.LineSegments(geometry, material);
                this.boundaries.position.z = 0.01; // 稍微抬高避免 z-fighting
                this.scene.add(this.boundaries);
            });
    }

    processPolygon(polygonCoords, vertices) {
        if (!polygonCoords || polygonCoords.length === 0) return;
        const ring = polygonCoords[0];
        for (let i = 0; i < ring.length - 1; i++) {
            const p1 = this.latLngToVector2D(ring[i][1], ring[i][0]);
            const p2 = this.latLngToVector2D(ring[i+1][1], ring[i+1][0]);
            vertices.push(p1.x, p1.y, 0);
            vertices.push(p2.x, p2.y, 0);
        }
    }

    latLngToVector2D(lat, lng) {
        // 映射关系：lng [-180, 180] -> x [-10, 10], lat [-90, 90] -> y [-5, 5]
        const x = (lng / 180) * (this.planeWidth / 2);
        const y = (lat / 90) * (this.planeHeight / 2);
        return new THREE.Vector3(x, y, 0);
    }

    createCountryLabel(name, lat, lng) {
        const div = document.createElement('div');
        div.className = 'country-label country-label-2d';
        div.textContent = name;
        div.style.color = 'rgba(0, 240, 255, 0.7)';

        const labelObj = new THREE.CSS2DObject(div);
        const pos = this.latLngToVector2D(lat, lng);
        pos.z = 0.02;
        labelObj.position.copy(pos);

        this.countryLabelsGroup.add(labelObj);
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        if (!this.isActive) return;

        this.controls.update();
        this.renderer.render(this.scene, this.camera);
        this.labelRenderer.render(this.scene, this.camera);
    }

    start() {
        this.animate();
    }
}
