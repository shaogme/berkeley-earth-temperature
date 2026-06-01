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
        this.lastInteractTime = 0;

        this.initLights();
        this.initControls();
        this.initStarField();
        this.initEarth();
        
        // 实例化边界与国家标签管理模块
        this.boundariesManager = new GlobeBoundaries(this);

        this.initAtmosphereGlow();
        this.initMarker();
        this.initResize();
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
        this.controls.addEventListener('change', () => {
            this.lastInteractTime = Date.now();
        });
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

        const material = new THREE.MeshStandardMaterial({
            map: earthTexture,
            roughness: 0.6,
            metalness: 0.1
        });

        this.earth = new THREE.Mesh(geometry, material);
        this.scene.add(this.earth);
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

    initMarker() {
        this.markerGroup = new THREE.Group();

        const markerSphere = new THREE.Mesh(
            new THREE.SphereGeometry(0.12, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0x00f0ff })
        );
        this.markerGroup.add(markerSphere);

        const ringGeo = new THREE.RingGeometry(0.14, 0.20, 32);
        this.ringMat = new THREE.MeshBasicMaterial({
            color: 0x00f0ff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.9
        });
        this.markerRing = new THREE.Mesh(ringGeo, this.ringMat);
        this.markerGroup.add(this.markerRing);

        this.earth.add(this.markerGroup);
        this.markerGroup.visible = false;
    }

    initResize() {
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    updateMarkerAnimation(elapsedTime) {
        if (this.markerGroup.visible) {
            const scaleVal = 1 + (elapsedTime * 2.5) % 1.5;
            this.markerRing.scale.set(scaleVal, scaleVal, 1);
            this.ringMat.opacity = Math.max(0, 1 - (scaleVal - 1) / 1.5);
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const elapsedTime = this.clock.getElapsedTime();

        if (Date.now() - this.lastInteractTime > 2000) {
            this.earth.rotation.y += 0.0015;
        }

        this.starField.rotation.y = elapsedTime * 0.002;
        this.starField.rotation.x = elapsedTime * 0.001;

        this.updateMarkerAnimation(elapsedTime);
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
}
