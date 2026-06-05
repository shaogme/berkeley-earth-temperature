import { GlobeViewer } from './viewers/globe-viewer.js';
import { FlatViewer } from './viewers/flat-viewer.js';
import { TemperatureChart } from './viewers/temperature-chart.js';
import { TimelineViewer } from './viewers/timeline-viewer.js';

class App {
    constructor() {
        this.globeViewer = new GlobeViewer();
        this.flatViewer = new FlatViewer();
        this.viewer = this.globeViewer; // 默认使用 3D Globe
        this.ncFile = null;
        this.timeList = []; // 存储 { year, month, idx, decYear }
        this.climatology = null; // 缓存气候态基准温度
        this.tempDataset = null; // 缓存温度距平数据集引用
        this.latLength = 180;
        this.lonLength = 360;

        // DOM 元素
        this.loadingOverlay = document.getElementById('loading-overlay');
        this.loaderProgress = document.getElementById('loader-progress');
        this.loaderStatus = document.getElementById('loader-status');

        this.yearSlider = document.getElementById('year-slider');
        this.monthSlider = document.getElementById('month-slider');
        this.opacitySlider = document.getElementById('opacity-slider');

        this.yearVal = document.getElementById('year-val');
        this.monthVal = document.getElementById('month-val');
        this.opacityVal = document.getElementById('opacity-val');
        this.dataStatus = document.getElementById('data-status');

        this.btnAbsolute = document.getElementById('btn-absolute');
        this.btnAnomaly = document.getElementById('btn-anomaly');
        this.colorbarTitle = document.getElementById('colorbar-title');
        this.colorbarBar = document.getElementById('colorbar-bar');
        this.colorbarLabels = document.getElementById('colorbar-labels');
        this.layerMode = 'absolute'; // 'absolute' 或 'anomaly'

        this.currentAbsoluteTempArray = null;
        this.currentAnomalyTempArray = null;

        this.markedPoints = []; // 存储标点数据
        this.markerCountVal = document.getElementById('marker-count-val');
        this.btnGenerateCurve = document.getElementById('btn-generate-curve');
        this.btnClearMarkers = document.getElementById('btn-clear-markers');

        this.btn3D = document.getElementById('btn-3d');
        this.btn2D = document.getElementById('btn-2d');

        // 数据集选择器 DOM
        this.datasetSelectorModal = document.getElementById('dataset-selector-modal');
        this.btnConfirmLoad = document.getElementById('btn-confirm-load');
        this.btnReselectDataset = document.getElementById('btn-reselect-dataset');
        this.rememberSettingsCheckbox = document.getElementById('remember-settings');
        this.geojsonSelect = document.getElementById('geojson-select');

        this.initEvents();
        this.globeViewer.start();
        this.flatViewer.start();

        this.chart = new TemperatureChart(this);
        this.timelineViewer = new TimelineViewer(this);

        // 检测是否存在记忆的数据集，进行按需初始加载
        this.checkAndStart();
    }

    checkAndStart() {
        const savedNC = localStorage.getItem('selected_nc_dataset');
        const savedGeoJSON = localStorage.getItem('selected_geojson_dataset');

        if (savedNC && savedGeoJSON) {
            this.datasetSelectorModal.style.display = 'none';
            this.loadingOverlay.style.display = 'flex';
            this.loadingOverlay.style.opacity = '1';
            this.initDataEngine(savedNC, savedGeoJSON);
        } else {
            this.loadingOverlay.style.display = 'none';
            this.datasetSelectorModal.style.display = 'flex';
        }
    }

    initEvents() {
        this.yearSlider.addEventListener('input', () => this.onTimeChanged());
        this.monthSlider.addEventListener('input', () => this.onTimeChanged());
        this.opacitySlider.addEventListener('input', () => {
            const opacity = parseFloat(this.opacitySlider.value) / 100;
            this.opacityVal.textContent = `${this.opacitySlider.value}%`;
            this.globeViewer.setTemperatureOpacity(opacity);
            this.flatViewer.setTemperatureOpacity(opacity);
        });

        // 绑定 2D/3D 切换按钮事件
        this.btn3D.addEventListener('click', () => this.switchMode('3d'));
        this.btn2D.addEventListener('click', () => this.switchMode('2d'));

        // 绑定图层模式切换按钮事件
        this.btnAbsolute.addEventListener('click', () => this.switchLayerMode('absolute'));
        this.btnAnomaly.addEventListener('click', () => this.switchLayerMode('anomaly'));

        window.addEventListener('map-leftclick', (e) => this.onMapLeftClick(e.detail));
        window.addEventListener('map-rightclick', (e) => this.onMapRightClick(e.detail));
        this.btnGenerateCurve.addEventListener('click', () => {
            if (this.markedPoints.length > 0) {
                this.chart.showMulti(this.markedPoints);
            }
        });
        this.btnClearMarkers.addEventListener('click', () => this.clearAllMarkers());

        // 绑定数据集选择按钮事件
        this.btnConfirmLoad.addEventListener('click', () => {
            const selectedNC = document.querySelector('input[name="nc-dataset"]:checked').value;
            const selectedGeoJSON = this.geojsonSelect.value;
            const remember = this.rememberSettingsCheckbox.checked;

            if (remember) {
                localStorage.setItem('selected_nc_dataset', selectedNC);
                localStorage.setItem('selected_geojson_dataset', selectedGeoJSON);
            } else {
                localStorage.removeItem('selected_nc_dataset');
                localStorage.removeItem('selected_geojson_dataset');
            }

            this.datasetSelectorModal.style.display = 'none';
            this.loadingOverlay.style.display = 'flex';
            this.loadingOverlay.style.opacity = '1';
            this.loaderProgress.style.width = '0%';
            this.loaderStatus.textContent = '准备载入数据...';

            this.initDataEngine(selectedNC, selectedGeoJSON);
        });

        this.btnReselectDataset.addEventListener('click', () => {
            const currentNC = this.currentNCUrl || 'data/Global_TAVG_Gridded/5deg.nc';
            const currentGeoJSON = this.currentGeoJSONUrl || 'data/countries-land/countries-land-1m.geo.json';

            const radioToSelect = document.querySelector(`input[name="nc-dataset"][value="${currentNC}"]`);
            if (radioToSelect) radioToSelect.checked = true;
            this.geojsonSelect.value = currentGeoJSON;

            this.datasetSelectorModal.style.display = 'flex';
        });
    }

    onMapLeftClick(coords) {
        const targetLatIdx = this.latLength === 180 ? coords.latIdx : Math.floor(coords.latIdx * this.latLength / 180);
        const targetLonIdx = this.lonLength === 360 ? coords.lonIdx : Math.floor(coords.lonIdx * this.lonLength / 360);
        const srcIdx = targetLatIdx * this.lonLength + targetLonIdx;
        const isLand = this.landMask ? (this.landMask[srcIdx] > 0.05) : true;
        
        const idx = coords.latIdx * 360 + coords.lonIdx;
        if (!isLand || !this.currentAbsoluteTempArray || isNaN(this.currentAbsoluteTempArray[idx])) {
            console.log('Clicked on invalid temperature data (ocean/missing), ignoring marker.');
            return;
        }

        const exists = this.markedPoints.some(p => p.latIdx === coords.latIdx && p.lonIdx === coords.lonIdx);
        if (exists) {
            console.log('Point already marked.');
            return;
        }

        const id = this.markedPoints.length > 0 ? Math.max(...this.markedPoints.map(p => p.id)) + 1 : 1;
        const newPoint = {
            id: id,
            lat: coords.lat,
            lon: coords.lon,
            latIdx: coords.latIdx,
            lonIdx: coords.lonIdx
        };

        this.markedPoints.push(newPoint);
        this.viewer.addMarkerVisual(newPoint.lat, newPoint.lon, newPoint.id);
        this.updateMarkerUI();
    }

    onMapRightClick(coords) {
        if (this.markedPoints.length === 0) return;

        let closestIdx = -1;
        let minDiff = Infinity;

        this.markedPoints.forEach((p, index) => {
            let diffLon = Math.abs(p.lon - coords.lon);
            if (diffLon > 180) diffLon = 360 - diffLon;
            const diffLat = Math.abs(p.lat - coords.lat);
            const totalDiff = diffLat + diffLon;

            if (totalDiff < minDiff) {
                minDiff = totalDiff;
                closestIdx = index;
            }
        });

        if (closestIdx !== -1 && minDiff < 3) {
            const removed = this.markedPoints.splice(closestIdx, 1)[0];
            this.viewer.removeMarkerVisual(removed.id);
            this.updateMarkerUI();
        }
    }

    clearAllMarkers() {
        this.markedPoints = [];
        this.globeViewer.clearAllMarkersVisual();
        this.flatViewer.clearAllMarkersVisual();
        this.updateMarkerUI();
    }

    updateMarkerUI() {
        const count = this.markedPoints.length;
        this.markerCountVal.textContent = `${count} 个`;

        if (count > 0) {
            this.btnGenerateCurve.disabled = false;
            this.btnGenerateCurve.classList.add('active');
            this.btnClearMarkers.disabled = false;
        } else {
            this.btnGenerateCurve.disabled = true;
            this.btnGenerateCurve.classList.remove('active');
            this.btnClearMarkers.disabled = true;
        }
    }

    async initDataEngine(ncUrl, geojsonUrl) {
        this.currentNCUrl = ncUrl;
        this.currentGeoJSONUrl = geojsonUrl;

        // 清理已有 WebAssembly VFS 句柄
        if (this.ncFile) {
            try {
                this.ncFile.close();
            } catch (e) {
                console.error('关闭旧句柄异常:', e);
            }
            this.ncFile = null;
        }

        this.timeList = [];
        this.climatology = null;
        this.tempDataset = null;
        this.currentAbsoluteTempArray = null;
        this.currentAnomalyTempArray = null;
        this.clearAllMarkers();

        // 重新渲染新选择的地理边界精度
        this.globeViewer.reloadBoundaries(geojsonUrl);
        this.flatViewer.reloadBoundaries(geojsonUrl);

        try {
            const ncFileName = ncUrl.substring(ncUrl.lastIndexOf('/') + 1);
            const titleEl = document.querySelector('.loader-title');
            if (titleEl) titleEl.textContent = `载入 ${ncFileName}`;
            this.loaderStatus.textContent = `开始建立连接下载 ${ncFileName} 数据集...`;

            const response = await fetch(ncUrl);
            if (!response.ok) {
                throw new Error(`加载 NC 数据集失败，HTTP 状态码: ${response.status}`);
            }

            const contentLength = response.headers.get('content-length');
            const totalBytes = contentLength ? parseInt(contentLength, 10) : (ncFileName.includes('5deg') ? 17657057 : 427861980);

            const reader = response.body.getReader();
            let receivedLength = 0;
            let chunks = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                chunks.push(value);
                receivedLength += value.length;

                const progress = (receivedLength / totalBytes) * 100;
                this.loaderProgress.style.width = `${progress.toFixed(1)}%`;
                this.loaderStatus.textContent = `已下载: ${(receivedLength / 1024 / 1024).toFixed(1)} MB / ${(totalBytes / 1024 / 1024).toFixed(1)} MB (${progress.toFixed(0)}%)`;
            }

            this.loaderStatus.textContent = '下载完成！正在组合内存数据流...';
            let allChunks = new Uint8Array(receivedLength);
            let position = 0;
            for (let chunk of chunks) {
                allChunks.set(chunk, position);
                position += chunk.length;
            }

            this.loaderStatus.textContent = '正在初始化 WebAssembly HDF5 虚拟文件系统...';
            await h5wasm.ready;

            const FS = h5wasm.FS;
            FS.writeFile(ncFileName, allChunks);

            this.loaderStatus.textContent = '正在解析 NetCDF-4 气温数据集元数据...';
            this.ncFile = new h5wasm.File(ncFileName, 'r');

            // 读取坐标和变量
            const times = this.ncFile.get('time').value;
            const lats = this.ncFile.get('latitude').value;
            const lons = this.ncFile.get('longitude').value;

            this.latLength = lats.length;
            this.lonLength = lons.length;

            this.dataStatus.textContent = `WASM引擎加载完成 [纬度:${lats.length} 经度:${lons.length} 时间序列:${times.length}]`;
            console.log(`lats shape:`, lats.length, `lons shape:`, lons.length);

            // 缓存常年气候态 (Climatology)
            const climDataset = this.ncFile.get('climatology');
            this.climatology = climDataset.value;
            this.tempDataset = this.ncFile.get('temperature');
            
            // 缓存陆地遮罩 (land_mask)
            const landMaskDataset = this.ncFile.get('land_mask');
            this.landMask = landMaskDataset.value;

            // 解析十进制时间序列，映射为年月日
            for (let i = 0; i < times.length; i++) {
                const decYear = times[i];
                const year = Math.floor(decYear);
                const remainder = decYear - year;
                let month = Math.floor(remainder * 12 + 1e-6) + 1;
                if (month > 12) month = 12;
                if (month < 1) month = 1;

                this.timeList.push({
                    year: year,
                    month: month,
                    idx: i,
                    decYear: decYear
                });
            }

            // 获取时间范围，初始化 Slider
            const years = this.timeList.map(t => t.year);
            const minYear = Math.min(...years);
            const maxYear = Math.max(...years);

            this.yearSlider.min = minYear;
            this.yearSlider.max = maxYear;
            this.yearSlider.value = maxYear; // 默认显示最新的一年
            
            // 开启滑动条控件
            this.yearSlider.disabled = false;
            this.monthSlider.disabled = false;

            // 预先计算全球历史气温变化曲线，以便初始化时间轴
            this.computeGlobalAnnualTemperatures();

            // 隐藏加载遮罩层
            setTimeout(() => {
                this.loadingOverlay.style.opacity = '0';
                setTimeout(() => {
                    this.loadingOverlay.style.display = 'none';
                }, 800);
            }, 500);

            // 首次渲染最新年份月份的数据
            this.onTimeChanged();

        } catch (error) {
            console.error('初始化数据引擎异常:', error);
            this.loaderStatus.innerHTML = `<span style="color:#ff4757;">初始化失败: ${error.message}</span>`;
            this.dataStatus.textContent = '数据载入失败，请确保本地 .nc 文件存在且服务正常。';
        }
    }

    computeGlobalAnnualTemperatures() {
        if (!this.tempDataset || !this.climatology || !this.timeList || this.timeList.length === 0) return;

        console.time('GlobalTempCalculation');
        this.loaderStatus.textContent = '正在利用 WebAssembly 加载引擎计算全球历史气温概览曲线...';

        const latLen = this.latLength;
        const lonLen = this.lonLength;
        const numGrid = latLen * lonLen;
        const landGridIndices = [];
        const areaWeights = [];
        let totalWeight = 0;

        const latsData = this.ncFile.get('latitude').value;

        // 1. 预先提取陆地格点的索引和面积权重
        for (let latIdx = 0; latIdx < latLen; latIdx++) {
            const lat = latsData[latIdx];
            const weight = Math.cos(lat * Math.PI / 180);
            for (let lonIdx = 0; lonIdx < lonLen; lonIdx++) {
                const idx = latIdx * lonLen + lonIdx;
                const isLand = this.landMask ? (this.landMask[idx] > 0.05) : true;
                if (isLand) {
                    landGridIndices.push(idx);
                    areaWeights.push(weight);
                    totalWeight += weight;
                }
            }
        }

        if (landGridIndices.length === 0) {
            for (let i = 0; i < numGrid; i++) {
                landGridIndices.push(i);
                const latIdx = Math.floor(i / lonLen);
                const lat = latsData[latIdx];
                const weight = Math.cos(lat * Math.PI / 180);
                areaWeights.push(weight);
                totalWeight += weight;
            }
        }

        // 2. 计算 12 个月的常年气候态全球陆地平均温
        const monthlyClimMeans = new Float32Array(12);
        for (let m = 0; m < 12; m++) {
            let sumClim = 0;
            let sumW = 0;
            const offset = m * numGrid;
            for (let i = 0; i < landGridIndices.length; i++) {
                const idx = landGridIndices[i];
                const climVal = this.climatology[offset + idx];
                if (!isNaN(climVal) && climVal > -99 && climVal < 99) {
                    const w = areaWeights[i];
                    sumClim += climVal * w;
                    sumW += w;
                }
            }
            monthlyClimMeans[m] = sumW > 0 ? sumClim / sumW : 0;
        }

        // 3. 一次性获取全部温度距平数据以获得最佳性能
        const tempValues = this.tempDataset.value;
        const numMonths = this.timeList.length;
        const monthlyAnomalyMeans = new Float32Array(numMonths);

        for (let t = 0; t < numMonths; t++) {
            let sumAnom = 0;
            let sumW = 0;
            const offset = t * numGrid;
            for (let i = 0; i < landGridIndices.length; i++) {
                const idx = landGridIndices[i];
                const anomaly = tempValues[offset + idx];
                if (!isNaN(anomaly) && anomaly > -99 && anomaly < 99) {
                    const w = areaWeights[i];
                    sumAnom += anomaly * w;
                    sumW += w;
                }
            }
            monthlyAnomalyMeans[t] = sumW > 0 ? sumAnom / sumW : NaN;
        }

        // 4. 合成月度绝对气温并按年分组
        const yearGroups = {};
        for (let t = 0; t < numMonths; t++) {
            const timeInfo = this.timeList[t];
            const anomaly = monthlyAnomalyMeans[t];
            if (isNaN(anomaly)) continue;

            const clim = monthlyClimMeans[timeInfo.month - 1];
            const absTemp = anomaly + clim;

            if (!yearGroups[timeInfo.year]) {
                yearGroups[timeInfo.year] = { sum: 0, count: 0 };
            }
            yearGroups[timeInfo.year].sum += absTemp;
            yearGroups[timeInfo.year].count++;
        }

        // 5. 生成折线图所需的 X 轴和 Y 轴数据
        const chartYears = Object.keys(yearGroups).map(Number).sort((a, b) => a - b);
        const chartTemps = chartYears.map(y => yearGroups[y].count > 0 ? yearGroups[y].sum / yearGroups[y].count : null);

        console.timeEnd('GlobalTempCalculation');

        // 初始化时间轴视图
        this.timelineViewer.init(chartYears, chartTemps);
    }

    onTimeChanged() {
        if (!this.ncFile || this.timeList.length === 0) return;

        const targetYear = parseInt(this.yearSlider.value, 10);
        const targetMonth = parseInt(this.monthSlider.value, 10);

        this.yearVal.textContent = `${targetYear} 年`;
        this.monthVal.textContent = `${targetMonth} 月`;

        // 在时间序列中寻找对应的索引
        let matched = this.timeList.find(t => t.year === targetYear && t.month === targetMonth);
        
        if (!matched) {
            const sameYearList = this.timeList.filter(t => t.year === targetYear);
            if (sameYearList.length > 0) {
                matched = sameYearList.reduce((prev, curr) => 
                    Math.abs(curr.month - targetMonth) < Math.abs(prev.month - targetMonth) ? curr : prev
                );
            } else {
                matched = this.timeList[0];
            }
        }

        const tIdx = matched.idx;
        this.renderGlobalTemperature(tIdx, matched.month);

        // 同步时间轴当前高亮指示的年份
        if (this.timelineViewer) {
            this.timelineViewer.updateActiveYear(targetYear);
        }
    }

    // 渲染特定时间索引的全球温度
    renderGlobalTemperature(tIdx, month) {
        if (!this.tempDataset || !this.climatology) return;

        const latLen = this.latLength;
        const lonLen = this.lonLength;
        const numGrid = latLen * lonLen;

        // 使用 slice 获取当前月的距平值，省去加载全部时间轴的内存开销
        const tempSlice = this.tempDataset.slice([[tIdx, tIdx + 1], [0, latLen], [0, lonLen]]);

        const absoluteTemp = new Float32Array(180 * 360);
        const anomalyTemp = new Float32Array(180 * 360);

        const climOffset = (month - 1) * numGrid;

        for (let latIdx = 0; latIdx < 180; latIdx++) {
            const targetLatIdx = latLen === 180 ? latIdx : Math.floor(latIdx * latLen / 180);
            for (let lonIdx = 0; lonIdx < 360; lonIdx++) {
                const targetLonIdx = lonLen === 360 ? lonIdx : Math.floor(lonIdx * lonLen / 360);

                const destIdx = latIdx * 360 + lonIdx;
                const srcIdx = targetLatIdx * lonLen + targetLonIdx;

                const anomaly = tempSlice[srcIdx];
                const isLand = this.landMask ? (this.landMask[srcIdx] > 0.05) : true;
                
                // 检查 NaN 并仅渲染陆地格点
                if (!isLand || isNaN(anomaly) || anomaly === null || anomaly < -99 || anomaly > 99) {
                    absoluteTemp[destIdx] = NaN;
                    anomalyTemp[destIdx] = NaN;
                } else {
                    const climVal = this.climatology[climOffset + srcIdx];
                    
                    if (isNaN(climVal) || climVal === null || climVal < -99 || climVal > 99) {
                        absoluteTemp[destIdx] = NaN;
                        anomalyTemp[destIdx] = NaN;
                    } else {
                        absoluteTemp[destIdx] = anomaly + climVal;
                        anomalyTemp[destIdx] = anomaly;
                    }
                }
            }
        }

        this.currentAbsoluteTempArray = absoluteTemp;
        this.currentAnomalyTempArray = anomalyTemp;

        this.updateViewerData();

        this.dataStatus.textContent = `渲染时间: ${this.timeList[tIdx].decYear.toFixed(4)} (数据索引: ${tIdx})`;
    }

    updateViewerData() {
        const isAnomaly = (this.layerMode === 'anomaly');
        const arrayData = isAnomaly ? this.currentAnomalyTempArray : this.currentAbsoluteTempArray;
        
        if (!arrayData) return;

        const modeValue = isAnomaly ? 1 : 0;
        this.globeViewer.setLayerMode(modeValue);
        this.flatViewer.setLayerMode(modeValue);

        this.globeViewer.updateTemperatureTexture(arrayData, isAnomaly);
        this.flatViewer.updateTemperatureTexture(arrayData, isAnomaly);
    }

    switchLayerMode(mode) {
        if (this.layerMode === mode) return;
        this.layerMode = mode;

        if (mode === 'absolute') {
            this.btnAbsolute.classList.add('active');
            this.btnAnomaly.classList.remove('active');
            this.updateColorbar('absolute');
        } else {
            this.btnAnomaly.classList.add('active');
            this.btnAbsolute.classList.remove('active');
            this.updateColorbar('anomaly');
        }

        this.updateViewerData();
    }

    updateColorbar(mode) {
        if (mode === 'absolute') {
            this.colorbarTitle.textContent = '全球绝对温度分布比例色阶 (°C)';
            this.colorbarBar.style.background = 'linear-gradient(to right, #0984e3 0%, #00cec9 25%, #ffeaa7 50%, #ff7675 75%, #d63031 100%)';
            this.colorbarLabels.innerHTML = `
                <span>-40°C</span>
                <span>-20°C</span>
                <span>0°C</span>
                <span>20°C</span>
                <span>40°C</span>
            `;
        } else {
            this.colorbarTitle.textContent = '全球温度距平分布比例色阶 (°C)';
            this.colorbarBar.style.background = 'linear-gradient(to right, #053061 0%, #2166ac 25%, #f7f7f0 50%, #b2182b 75%, #67001f 100%)';
            this.colorbarLabels.innerHTML = `
                <span>-8°C</span>
                <span>-4°C</span>
                <span>0°C</span>
                <span>+4°C</span>
                <span>+8°C</span>
            `;
        }
    }

    switchMode(mode) {
        this.clearAllMarkers(); // 切换时清空标点
        const duration = 500; // 动画持续时间 500ms
        
        if (mode === '3d') {
            this.btn3D.classList.add('active');
            this.btn2D.classList.remove('active');
            
            // 先淡出 2D
            this.flatViewer.renderer.domElement.style.transition = `opacity ${duration}ms ease`;
            this.flatViewer.labelRenderer.domElement.style.transition = `opacity ${duration}ms ease`;
            this.flatViewer.renderer.domElement.style.opacity = '0';
            this.flatViewer.labelRenderer.domElement.style.opacity = '0';
            
            setTimeout(() => {
                this.flatViewer.hide();
                
                // 淡入 3D
                this.globeViewer.show();
                this.globeViewer.renderer.domElement.style.opacity = '0';
                this.globeViewer.labelRenderer.domElement.style.opacity = '0';
                this.globeViewer.renderer.domElement.style.transition = `opacity ${duration}ms ease`;
                this.globeViewer.labelRenderer.domElement.style.transition = `opacity ${duration}ms ease`;
                
                // 强制重绘
                this.globeViewer.renderer.domElement.offsetHeight;
                
                this.globeViewer.renderer.domElement.style.opacity = '1';
                this.globeViewer.labelRenderer.domElement.style.opacity = '1';
                this.viewer = this.globeViewer;
            }, duration);
            
        } else {
            this.btn2D.classList.add('active');
            this.btn3D.classList.remove('active');
            
            // 先淡出 3D
            this.globeViewer.renderer.domElement.style.transition = `opacity ${duration}ms ease`;
            this.globeViewer.labelRenderer.domElement.style.transition = `opacity ${duration}ms ease`;
            this.globeViewer.renderer.domElement.style.opacity = '0';
            this.globeViewer.labelRenderer.domElement.style.opacity = '0';
            
            setTimeout(() => {
                this.globeViewer.hide();
                
                // 淡入 2D
                this.flatViewer.show();
                this.flatViewer.renderer.domElement.style.opacity = '0';
                this.flatViewer.labelRenderer.domElement.style.opacity = '0';
                this.flatViewer.renderer.domElement.style.transition = `opacity ${duration}ms ease`;
                this.flatViewer.labelRenderer.domElement.style.transition = `opacity ${duration}ms ease`;
                
                // 强制重绘
                this.flatViewer.renderer.domElement.offsetHeight;
                
                this.flatViewer.renderer.domElement.style.opacity = '1';
                this.flatViewer.labelRenderer.domElement.style.opacity = '1';
                this.viewer = this.flatViewer;
            }, duration);
        }
        
        // 标点已在新模式下清空
        
        // 重新同步透明度
        const opacity = parseFloat(this.opacitySlider.value) / 100;
        setTimeout(() => {
            this.viewer.setTemperatureOpacity(opacity);
        }, duration + 50);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new App();
});
