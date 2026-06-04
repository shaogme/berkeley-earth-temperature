import { loadBoundariesGeoJSON } from './geojson-loader.js';

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
                    
                    const countryNameMap = {
                        'CHN': '中国',
                        'USA': '美国',
                        'RUS': '俄罗斯',
                        'BRA': '巴西',
                        'AUS': '澳大利亚',
                        'IND': '印度',
                        'CAN': '加拿大',
                        'ZAF': '南非',
                        'FRA': '法国',
                        'DEU': '德国',
                        'GBR': '英国',
                        'JPN': '日本',
                        'KOR': '韩国',
                        'ITA': '意大利',
                        'ESP': '西班牙',
                        'ARG': '阿根廷',
                        'MEX': '墨西哥',
                        'EGY': '埃及',
                        'SAU': '沙特阿拉伯',
                        'IDN': '印尼',
                        'TUR': '土耳其',
                        'KAZ': '哈萨克斯坦',
                        'MNG': '蒙古',
                        'GRL': '格陵兰',
                        'CHL': '智利',
                        'SWE': '瑞典',
                        'NOR': '挪威',
                        'FIN': '芬兰',
                        'IRN': '伊朗',
                        'PAK': '巴基斯坦',
                        'NGA': '尼日利亚',
                        'DZA': '阿尔及利亚',
                        'SDN': '苏丹',
                        'KEN': '肯尼亚',
                        'THA': '泰国',
                        'VNM': '越南',
                        'PHL': '菲律宾',
                        'NZL': '新西兰',
                        'PER': '秘鲁',
                        'COL': '哥伦比亚',
                        'VEN': '委内瑞拉',
                        'BOL': '玻利维亚',
                        'LBY': '利比亚',
                        'MDG': '马达加斯加',
                        'UKR': '乌克兰',
                        'POL': '波兰'
                    };

                    const displayName = countryNameMap[a3];

                    if (displayName) {
                        // 预设国家视觉中心经纬度，防止边界线高密度顶点（如喜马拉雅国界）把标签扯到边境线
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
