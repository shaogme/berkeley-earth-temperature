import { GlobeViewer } from './globe-viewer.js';
import { FlatViewer } from './flat-viewer.js';
import { TemperatureChart } from './temperature-chart.js';

class App {
    constructor() {
        this.globeViewer = new GlobeViewer();
        this.flatViewer = new FlatViewer();
        this.viewer = this.globeViewer; // 默认使用 3D Globe
        this.ncFile = null;
        this.timeList = []; // 存储 { year, month, idx, decYear }
        this.climatology = null; // 缓存气候态基准温度
        this.tempDataset = null; // 缓存温度距平数据集引用

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

        this.contextMenu = document.getElementById('context-menu');
        this.ctxViewChart = document.getElementById('ctx-view-chart');
        this.lastCtxCoords = null;

        this.btn3D = document.getElementById('btn-3d');
        this.btn2D = document.getElementById('btn-2d');

        this.initEvents();
        this.globeViewer.start();
        this.flatViewer.start();

        this.chart = new TemperatureChart(this);

        // 启动 NetCDF 数据集异步加载与引擎初始化
        this.initDataEngine();
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

        window.addEventListener('globe-contextmenu', (e) => this.onGlobeContextMenu(e));
        this.ctxViewChart.addEventListener('click', () => this.onContextMenuChart());
        document.addEventListener('click', (e) => this.hideContextMenu(e));

        // 交互优化：当拖拽/旋转视口时，隐藏右键菜单
        if (this.globeViewer.controls) {
            this.globeViewer.controls.addEventListener('start', () => this.hideContextMenu());
        }
        if (this.flatViewer.controls) {
            this.flatViewer.controls.addEventListener('start', () => this.hideContextMenu());
        }

        // 交互优化：当右键点击视口以外的空白区域时，隐藏右键菜单
        this.globeViewer.renderer.domElement.addEventListener('contextmenu', (e) => {
            const info = this.globeViewer.getLatLonFromClick(e);
            if (!info) this.hideContextMenu();
        });
        this.flatViewer.renderer.domElement.addEventListener('contextmenu', (e) => {
            const info = this.flatViewer.getLatLonFromClick(e);
            if (!info) this.hideContextMenu();
        });
    }

    onGlobeContextMenu(event) {
        const detail = event.detail;
        this.lastCtxCoords = {
            lat: detail.lat,
            lon: detail.lon,
            latIdx: detail.latIdx,
            lonIdx: detail.lonIdx
        };

        this.contextMenu.style.left = `${detail.clientX}px`;
        this.contextMenu.style.top = `${detail.clientY}px`;

        const rect = this.contextMenu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            this.contextMenu.style.left = `${detail.clientX - rect.width - 5}px`;
        }
        if (rect.bottom > window.innerHeight) {
            this.contextMenu.style.top = `${detail.clientY - rect.height - 5}px`;
        }

        this.contextMenu.style.display = 'block';
    }

    onContextMenuChart() {
        this.hideContextMenu();
        if (this.lastCtxCoords) {
            this.chart.show(
                this.lastCtxCoords.lat,
                this.lastCtxCoords.lon,
                this.lastCtxCoords.latIdx,
                this.lastCtxCoords.lonIdx
            );
        }
    }

    hideContextMenu(event) {
        if (event && this.contextMenu.contains(event.target)) return;
        this.contextMenu.style.display = 'none';
    }

    async initDataEngine() {
        try {
            const ncUrl = 'Global_TAVG_Gridded_1deg.nc';
            this.loaderStatus.textContent = '开始建立连接下载 1deg 核心数据集...';

            const response = await fetch(ncUrl);
            if (!response.ok) {
                throw new Error(`加载 NC 数据集失败，HTTP 状态码: ${response.status}`);
            }

            const contentLength = response.headers.get('content-length');
            const totalBytes = contentLength ? parseInt(contentLength, 10) : 427861980; // 默认 408MB

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
            // 确保 h5wasm 完全初始化
            await h5wasm.ready;

            const FS = h5wasm.FS;
            FS.writeFile('Global_TAVG_Gridded_1deg.nc', allChunks);

            this.loaderStatus.textContent = '正在解析 NetCDF-4 气温数据集元数据...';
            this.ncFile = new h5wasm.File('Global_TAVG_Gridded_1deg.nc', 'r');

            // 读取坐标和变量
            const times = this.ncFile.get('time').value;
            const lats = this.ncFile.get('latitude').value;
            const lons = this.ncFile.get('longitude').value;

            this.dataStatus.textContent = `WASM引擎加载完成 [纬度:${lats.length} 经度:${lons.length} 时间序列:${times.length}]`;
            console.log(`lats shape:`, lats.length, `lons shape:`, lons.length);

            // 缓存常年气候态 (Climatology, 一般是 12, 180, 360 形状)
            const climDataset = this.ncFile.get('climatology');
            this.climatology = climDataset.value;
            this.tempDataset = this.ncFile.get('temperature');
            
            // 缓存陆地遮罩 (land_mask, 一般是 180, 360 形状)
            const landMaskDataset = this.ncFile.get('land_mask');
            this.landMask = landMaskDataset.value;

            // 解析十进制时间序列，映射为年月日
            // 1981.125 -> 1981年2月
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

    onTimeChanged() {
        if (!this.ncFile || this.timeList.length === 0) return;

        const targetYear = parseInt(this.yearSlider.value, 10);
        const targetMonth = parseInt(this.monthSlider.value, 10);

        this.yearVal.textContent = `${targetYear} 年`;
        this.monthVal.textContent = `${targetMonth} 月`;

        // 在时间序列中寻找对应的索引
        // 或者是取年份月份完全匹配的最接近的那个点
        let matched = this.timeList.find(t => t.year === targetYear && t.month === targetMonth);
        
        if (!matched) {
            // 如果某年份这个月份恰好缺测，取该年份所有月份中最接近的
            const sameYearList = this.timeList.filter(t => t.year === targetYear);
            if (sameYearList.length > 0) {
                matched = sameYearList.reduce((prev, curr) => 
                    Math.abs(curr.month - targetMonth) < Math.abs(prev.month - targetMonth) ? curr : prev
                );
            } else {
                // 如果整年缺失，取最接近的时间索引
                matched = this.timeList[0];
            }
        }

        const tIdx = matched.idx;
        this.renderGlobalTemperature(tIdx, matched.month);
    }

    // 渲染特定时间索引的全球温度
    renderGlobalTemperature(tIdx, month) {
        if (!this.tempDataset || !this.climatology) return;

        // 使用 slice 获取当前月的距平值，省去加载全部时间轴的内存开销
        // shape [time, lat, lon] = [times_len, 180, 360]
        // slice(start, end)
        const tempSlice = this.tempDataset.slice([[tIdx, tIdx + 1], [0, 180], [0, 360]]);

        const numGrid = 180 * 360;
        const absoluteTemp = new Float32Array(numGrid);

        const climOffset = (month - 1) * numGrid;

        for (let i = 0; i < numGrid; i++) {
            const anomaly = tempSlice[i];
            const isLand = this.landMask ? (this.landMask[i] > 0.05) : true;
            
            // 检查 NaN、极值填充值 (如 -9999 或 _FillValue) 并且仅渲染陆地格点
            if (!isLand || isNaN(anomaly) || anomaly === null || anomaly < -99 || anomaly > 99) {
                absoluteTemp[i] = NaN;
            } else {
                // 绝对温度 = 距平 (anomaly) + 常年该月气候态 (climatology)
                const climVal = this.climatology[climOffset + i];
                
                // 同样检查气候态基准温度是否为异常的填充值
                if (isNaN(climVal) || climVal === null || climVal < -99 || climVal > 99) {
                    absoluteTemp[i] = NaN;
                } else {
                    absoluteTemp[i] = anomaly + climVal;
                }
            }
        }

        // 调用 active viewer 更新数据纹理，同时对后台 viewer 更新以保持数据同步
        this.globeViewer.updateTemperatureTexture(absoluteTemp);
        this.flatViewer.updateTemperatureTexture(absoluteTemp);
        this.dataStatus.textContent = `渲染时间: ${this.timeList[tIdx].decYear.toFixed(4)} (数据索引: ${tIdx})`;
    }

    switchMode(mode) {
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
        
        // 强制隐藏旧状态的右键菜单
        this.hideContextMenu();
        
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
