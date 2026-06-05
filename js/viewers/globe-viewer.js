import { BaseViewer } from './base-viewer.js';
import { GlobeBoundaries } from '../utils/globe-boundaries.js';
import { GlobeShader } from '../shaders/shaders.js';

export class GlobeViewer extends BaseViewer {
    constructor() {
        super();
        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 0, 15);

        // 由于 GlobeViewer 默认处于激活状态，将其 DOM 元素显示出来
        this.renderer.domElement.style.display = 'block';
        this.labelRenderer.domElement.style.display = 'block';

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

        // 使用基类的 Tooltip 与 ContextMenu 逻辑
        this.initTooltip();
        this.initMouseClickEvents();
        this.isActive = true;
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
        
        this.tempTexture = this.createTemperatureTexture();

        // 自定义高级着色器材质 (ShaderMaterial)
        this.earthMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uEarthTex: { value: earthTexture },
                uTempTex: { value: this.tempTexture },
                uOpacity: { value: 0.8 },
                uLightDirection: { value: new THREE.Vector3(0, 0, 1) },
                uLayerMode: { value: 0 }
            },
            vertexShader: GlobeShader.vertexShader,
            fragmentShader: GlobeShader.fragmentShader
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

    animate() {
        requestAnimationFrame(() => this.animate());

        if (!this.isActive) return;

        const elapsedTime = this.clock.getElapsedTime();

        this.starField.rotation.y = elapsedTime * 0.002;
        this.starField.rotation.x = elapsedTime * 0.001;

        if (this.boundariesManager) {
            this.boundariesManager.updateLabels();
        }
        this.updateMarkers();
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
        this.labelRenderer.render(this.scene, this.camera);
    }

    latLngToVector3(lat, lng, radius) {
        const phi = lat * (Math.PI / 180);
        const theta = lng * (Math.PI / 180);

        const x = radius * Math.cos(phi) * Math.cos(theta);
        const y = radius * Math.sin(phi);
        const z = -radius * Math.cos(phi) * Math.sin(theta);

        return new THREE.Vector3(x, y, z);
    }

    addMarkerVisual(lat, lon, id) {
        this.removeMarkerVisual(id);

        const el = this.createMarkerElement(id);
        const labelObj = new THREE.CSS2DObject(el);
        const pos = this.latLngToVector3(lat, lon, this.radius * 1.01);
        labelObj.position.copy(pos);

        this.earth.add(labelObj);
        this.markerObjects.set(id, labelObj);
    }

    updateMarkers() {
        if (!this.markerObjects) return;
        const tempV = new THREE.Vector3();
        const cameraPosition = this.camera.position;

        for (const markerObj of this.markerObjects.values()) {
            markerObj.getWorldPosition(tempV);
            const markerDir = tempV.clone().normalize();
            const camDir = tempV.clone().sub(cameraPosition).normalize();
            const dot = markerDir.dot(camDir);

            if (dot > -0.1) {
                markerObj.element.style.opacity = '0';
                markerObj.element.style.display = 'none';
            } else {
                markerObj.element.style.opacity = '1';
                markerObj.element.style.display = 'block';
            }
        }
    }

    start() {
        this.animate();
    }
}
