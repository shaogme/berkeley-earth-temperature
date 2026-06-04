import { loadBoundariesGeoJSON } from './geojson-loader.js';
import { countryNameMap, customCentroids } from './country-config.js';

export class GlobeBoundaries {
    constructor(viewer) {
        this.viewer = viewer;
        this.earth = viewer.earth;
        this.radius = viewer.radius;
        
        // 创建国家标签 Group 并加入地球，确保其同步自转
        this.countryLabelsGroup = new THREE.Group();
        this.earth.add(this.countryLabelsGroup);

        this.initBoundaries();
    }

    initBoundaries() {
        loadBoundariesGeoJSON()
            .then(geojson => {
                const vertices = [];
                // 将半径设为几乎贴合地球表面，彻底消除视差带来的偏移
                const boundaryRadius = this.radius * 1.0005;

                geojson.features.forEach(feature => {
                    if (!feature.geometry) return;
                    const type = feature.geometry.type;
                    const coordinates = feature.geometry.coordinates;

                    // 1. 绘制边界线
                    if (type === 'Polygon') {
                        this.processPolygon(coordinates, vertices, boundaryRadius);
                    } else if (type === 'MultiPolygon') {
                        coordinates.forEach(polygonCoords => {
                            this.processPolygon(polygonCoords, vertices, boundaryRadius);
                        });
                    }

                    // 2. 智能化创建主要国家名称标签
                    const props = feature.properties || {};
                    const a3 = props.A3 || props.a3 || "";
                    
                    const displayName = countryNameMap[a3];

                    if (displayName) {
                        let centroid = customCentroids[a3];

                        if (!centroid) {
                            if (type === 'Polygon') {
                                centroid = this.calculateCentroid(coordinates);
                            } else if (type === 'MultiPolygon') {
                                let maxLen = 0;
                                let largestPolygon = null;
                                coordinates.forEach(polygonCoords => {
                                    if (polygonCoords[0] && polygonCoords[0].length > maxLen) {
                                        maxLen = polygonCoords[0].length;
                                        largestPolygon = polygonCoords;
                                    }
                                });
                                if (largestPolygon) {
                                    centroid = this.calculateCentroid(largestPolygon);
                                }
                            }
                        }

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
                    opacity: 0.45,
                    linewidth: 1,
                    polygonOffset: true,
                    polygonOffsetFactor: -1,
                    polygonOffsetUnits: -4
                });

                this.boundaries = new THREE.LineSegments(geometry, material);
                // 将边界线添加到地球中，这样它们就能与地球自转完美保持一致
                this.earth.add(this.boundaries);
            })
            .catch(error => {
                console.error('Failed to load earth boundaries GeoJSON:', error);
            });
    }

    calculateCentroid(polygonCoords) {
        let sumLat = 0;
        let sumLng = 0;
        let count = 0;
        const ring = polygonCoords[0];
        if (!ring || ring.length === 0) return null;
        for (let i = 0; i < ring.length; i++) {
            sumLng += ring[i][0];
            sumLat += ring[i][1];
            count++;
        }
        return { lat: sumLat / count, lng: sumLng / count };
    }

    createCountryLabel(name, lat, lng) {
        const div = document.createElement('div');
        div.className = 'country-label';
        div.textContent = name;

        const labelObj = new THREE.CSS2DObject(div);
        // 将标签位置设为略高于地表（1.01倍半径），营造高科技悬浮感
        const labelPos = this.latLngToVector3(lat, lng, this.radius * 1.01);
        labelObj.position.copy(labelPos);

        this.countryLabelsGroup.add(labelObj);
    }

    updateLabels() {
        if (!this.countryLabelsGroup) return;

        const tempV = new THREE.Vector3();
        const cameraPosition = this.viewer.camera.position;

        this.countryLabelsGroup.children.forEach(labelObj => {
            // 获取标签在世界空间中的三维位置
            labelObj.getWorldPosition(tempV);

            // 从地球中心 (0,0,0) 指向该标签的方向向量（即该点的法线方向）
            const labelDir = tempV.clone().normalize();
            // 从摄像机指向该标签的方向向量
            const camDir = tempV.clone().sub(cameraPosition).normalize();

            // 计算法线与视线方向的点积
            const dot = labelDir.dot(camDir);

            // 如果点积大于 -0.1，说明该国家已转入地球背面或处于极边缘位置
            if (dot > -0.1) {
                labelObj.element.style.opacity = '0';
                labelObj.element.style.display = 'none';
            } else {
                // 在地平线边缘进行平滑的渐变淡入淡出，极其平滑和极具科技感
                const opacity = Math.min(1, (-dot - 0.1) * 3) * 0.85;
                labelObj.element.style.opacity = opacity.toString();
                labelObj.element.style.display = 'block';
            }
        });
    }

    processPolygon(polygonCoords, vertices, radius) {
        if (!polygonCoords || polygonCoords.length === 0) return;
        // polygonCoords[0] 是外环（exterior ring）
        const ring = polygonCoords[0];
        for (let i = 0; i < ring.length - 1; i++) {
            const p1 = this.latLngToVector3(ring[i][1], ring[i][0], radius);
            const p2 = this.latLngToVector3(ring[i+1][1], ring[i+1][0], radius);
            vertices.push(p1.x, p1.y, p1.z);
            vertices.push(p2.x, p2.y, p2.z);
        }
    }

    latLngToVector3(lat, lng, radius) {
        const phi = lat * (Math.PI / 180);
        const theta = lng * (Math.PI / 180);

        const x = radius * Math.cos(phi) * Math.cos(theta);
        const y = radius * Math.sin(phi);
        const z = -radius * Math.cos(phi) * Math.sin(theta);

        return new THREE.Vector3(x, y, z);
    }
}
