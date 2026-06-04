import { BaseViewer } from './base-viewer.js';
import { loadBoundariesGeoJSON } from '../utils/geojson-loader.js';
import { countryNameMap, customCentroids } from '../config/country-config.js';
import { FlatShader } from '../shaders/shaders.js';

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

        this.tempTexture = this.createTemperatureTexture();

        // 复用 3D 的温度-色彩着色器，简化光照计算
        this.earthMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uEarthTex: { value: earthTexture },
                uTempTex: { value: this.tempTexture },
                uOpacity: { value: 0.8 },
                uLightDirection: { value: new THREE.Vector3(0, 0, 1) },
                uLayerMode: { value: 0 } // 0: 绝对温度, 1: 温度距平
            },
            vertexShader: FlatShader.vertexShader,
            fragmentShader: FlatShader.fragmentShader
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
                    
                    const displayName = countryNameMap[a3];
                    if (displayName) {
                        const centroid = customCentroids[a3];
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
