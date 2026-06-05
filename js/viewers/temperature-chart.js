export class TemperatureChart {
    constructor(app) {
        this.app = app;
        this.mode = 'annual';
        this.chartInstance = null;
        this.currentLat = null;
        this.currentLon = null;
        this.currentLatIdx = null;
        this.currentLonIdx = null;
        this.timeSeriesData = null;
        this.isMultiMode = false;
        this.markedPoints = null;

        this.overlay = document.getElementById('chart-overlay');
        this.coordsEl = document.getElementById('chart-coords');
        this.annualRange = document.getElementById('chart-range-annual');
        this.monthlyRange = document.getElementById('chart-range-monthly');
        this.startYearEl = document.getElementById('chart-start-year');
        this.endYearEl = document.getElementById('chart-end-year');
        this.targetYearEl = document.getElementById('chart-target-year');
        this.chartContainer = document.getElementById('chart-container');
        this.renderBtn = document.getElementById('chart-render-btn');
        this.closeBtn = document.getElementById('chart-close-btn');

        this.initEvents();
    }

    initEvents() {
        document.querySelectorAll('input[name="chart-mode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.mode = e.target.value;
                this.updateRangeUI();
            });
        });

        this.startYearEl.addEventListener('change', () => {
            const start = parseInt(this.startYearEl.value);
            const end = parseInt(this.endYearEl.value);
            if (start > end) {
                this.endYearEl.value = start;
            }
        });

        this.endYearEl.addEventListener('change', () => {
            const start = parseInt(this.startYearEl.value);
            const end = parseInt(this.endYearEl.value);
            if (end < start) {
                this.startYearEl.value = end;
            }
        });

        this.closeBtn.addEventListener('click', () => this.hide());
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.hide();
        });
        this.renderBtn.addEventListener('click', () => this.fetchAndRender());

        window.addEventListener('resize', () => {
            if (this.chartInstance) {
                this.chartInstance.resize();
            }
        });
    }

    updateRangeUI() {
        this.annualRange.style.display = this.mode === 'annual' ? 'flex' : 'none';
        this.monthlyRange.style.display = this.mode === 'monthly' ? 'flex' : 'none';
    }

    show(lat, lon, latIdx, lonIdx) {
        this.isMultiMode = false;
        // 如果位置发生变化，才清除缓存的该点时间序列数据
        if (this.currentLatIdx !== latIdx || this.currentLonIdx !== lonIdx) {
            this.timeSeriesData = null;
        }

        this.currentLat = lat;
        this.currentLon = lon;
        this.currentLatIdx = latIdx;
        this.currentLonIdx = lonIdx;

        const latStr = lat >= 0 ? `${lat.toFixed(1)}°N` : `${(-lat).toFixed(1)}°S`;
        const lonStr = lon >= 0 ? `${lon.toFixed(1)}°E` : `${(-lon).toFixed(1)}°W`;
        this.coordsEl.textContent = `📍 ${latStr}, ${lonStr}`;

        // 同步当前的单选框状态到内存 mode 中，并刷新面板控制
        const checkedRadio = document.querySelector('input[name="chart-mode"]:checked');
        this.mode = checkedRadio ? checkedRadio.value : 'annual';
        this.updateRangeUI();

        this.populateYearSelectors();
        this.overlay.style.display = 'flex';

        if (this.chartInstance) {
            this.chartInstance.dispose();
            this.chartInstance = null;
        }

        // 不默认自动生成图表，显示精美的引导提示占位
        this.renderPlaceholder();
    }

    showMulti(markedPoints) {
        this.isMultiMode = true;
        this.markedPoints = markedPoints;

        this.coordsEl.textContent = `📍 多点对比分析（已选择 ${markedPoints.length} 个标点）`;

        const checkedRadio = document.querySelector('input[name="chart-mode"]:checked');
        this.mode = checkedRadio ? checkedRadio.value : 'annual';
        this.updateRangeUI();

        this.populateYearSelectors();
        this.overlay.style.display = 'flex';

        if (this.chartInstance) {
            this.chartInstance.dispose();
            this.chartInstance = null;
        }

        this.renderPlaceholder();
    }

    renderPlaceholder() {
        this.initChart();
        this.chartInstance.setOption({
            title: {
                text: '请选择时间范围与查看模式，点击“生成图表”按钮开始分析',
                textStyle: { color: '#94a3b8', fontSize: 13, fontFamily: 'Outfit' },
                left: 'center',
                top: 'center'
            },
            xAxis: { show: false },
            yAxis: { show: false },
            series: []
        });
    }

    hide() {
        this.overlay.style.display = 'none';
        if (this.chartInstance) {
            this.chartInstance.dispose();
            this.chartInstance = null;
        }
    }

    populateYearSelectors() {
        const timeList = this.app.timeList;
        if (!timeList || timeList.length === 0) return;

        const yearSet = new Set();
        timeList.forEach(t => yearSet.add(t.year));
        const years = Array.from(yearSet).sort((a, b) => a - b);

        if (years.length === 0) return;

        const populate = (select, index) => {
            select.innerHTML = '';
            years.forEach(y => {
                const opt = document.createElement('option');
                opt.value = y;
                opt.textContent = `${y} 年`;
                select.appendChild(opt);
            });
            const idx = Math.min(index, years.length - 1);
            if (idx >= 0) select.value = years[idx];
        };

        populate(this.startYearEl, 0);
        populate(this.endYearEl, years.length - 1);
        populate(this.targetYearEl, Math.min(years.length - 1, Math.max(0, years.length - 10)));
    }

    fetchAndRender() {
        if (this.isMultiMode) {
            this.fetchAndRenderMulti();
            return;
        }

        if (this.currentLatIdx === null || this.currentLonIdx === null) return;

        // 仅在无缓存数据时才发起低效的 WebAssembly 距平切片提取
        if (!this.timeSeriesData) {
            const data = this.fetchPointTimeSeriesFor(this.currentLatIdx, this.currentLonIdx);
            if (!data || data.length === 0) {
                this.renderEmpty();
                return;
            }
            this.timeSeriesData = data;
        }

        if (this.mode === 'annual') {
            this.renderAnnual();
        } else {
            this.renderMonthly();
        }
    }

    fetchPointTimeSeries() {
        return this.fetchPointTimeSeriesFor(this.currentLatIdx, this.currentLonIdx);
    }

    fetchPointTimeSeriesFor(latIdx, lonIdx) {
        const app = this.app;
        if (!app.tempDataset || !app.climatology || !app.timeList) return null;

        const timeLen = app.timeList.length;

        try {
            const tsData = app.tempDataset.slice([[0, timeLen], [latIdx, latIdx + 1], [lonIdx, lonIdx + 1]]);
            const result = [];
            const numGrid = 180 * 360;

            for (let i = 0; i < timeLen; i++) {
                const anomaly = tsData[i];
                const month = app.timeList[i].month;

                if (isNaN(anomaly) || anomaly === null || anomaly < -99 || anomaly > 99) continue;

                const climOffset = (month - 1) * numGrid;
                const climVal = app.climatology[climOffset + latIdx * 360 + lonIdx];

                if (isNaN(climVal) || climVal === null || climVal < -99 || climVal > 99) continue;

                result.push({
                    year: app.timeList[i].year,
                    month: month,
                    decYear: app.timeList[i].decYear,
                    absoluteTemp: anomaly + climVal,
                    anomaly: anomaly,
                    climatology: climVal
                });
            }

            return result;
        } catch (e) {
            console.error('时间序列数据提取失败:', e);
            return null;
        }
    }

    fetchAndRenderMulti() {
        if (!this.markedPoints || this.markedPoints.length === 0) return;

        this.multiTimeSeriesData = [];
        this.markedPoints.forEach(p => {
            const data = this.fetchPointTimeSeriesFor(p.latIdx, p.lonIdx);
            if (data && data.length > 0) {
                this.multiTimeSeriesData.push({
                    point: p,
                    data: data
                });
            }
        });

        if (this.multiTimeSeriesData.length === 0) {
            this.renderEmpty();
            return;
        }

        if (this.mode === 'annual') {
            this.renderAnnualMulti();
        } else {
            this.renderMonthlyMulti();
        }
    }

    renderAnnualMulti() {
        const startYear = parseInt(this.startYearEl.value);
        const endYear = parseInt(this.endYearEl.value);

        const yearsSet = new Set();
        this.multiTimeSeriesData.forEach(item => {
            item.data.forEach(d => {
                if (d.year >= startYear && d.year <= endYear) {
                    yearsSet.add(d.year);
                }
            });
        });
        const years = Array.from(yearsSet).sort((a, b) => a - b);

        if (years.length === 0) {
            this.renderEmpty();
            return;
        }

        const colors = ['#00f0ff', '#ff007f', '#ffeaa7', '#00ff88', '#a855f7', '#3b82f6', '#f97316'];
        const seriesList = [];

        this.multiTimeSeriesData.forEach((item, pIdx) => {
            const yearMap = {};
            item.data.forEach(d => {
                if (d.year >= startYear && d.year <= endYear) {
                    if (!yearMap[d.year]) yearMap[d.year] = { sum: 0, count: 0 };
                    yearMap[d.year].sum += d.absoluteTemp;
                    yearMap[d.year].count++;
                }
            });

            const temps = years.map(y => {
                const group = yearMap[y];
                return (group && group.count > 0) ? +(group.sum / group.count).toFixed(2) : null;
            });

            const latStr = item.point.lat >= 0 ? `${item.point.lat.toFixed(1)}°N` : `${(-item.point.lat).toFixed(1)}°S`;
            const lonStr = item.point.lon >= 0 ? `${item.point.lon.toFixed(1)}°E` : `${(-item.point.lon).toFixed(1)}°W`;

            seriesList.push({
                name: `P${item.point.id} (${latStr}, ${lonStr})`,
                type: 'line',
                data: temps,
                smooth: true,
                symbol: 'none',
                lineStyle: { width: 2, color: colors[pIdx % colors.length] },
                itemStyle: { color: colors[pIdx % colors.length] }
            });
        });

        this.initChart();
        this.chartInstance.setOption({
            title: {
                text: `多点年度平均温度对比趋势 (${startYear} - ${endYear})`,
                textStyle: { color: '#e2e8f0', fontSize: 14, fontFamily: 'Orbitron' },
                left: 'center',
                top: 0
            },
            legend: {
                data: seriesList.map(s => s.name),
                textStyle: { color: '#94a3b8', fontSize: 10, fontFamily: 'Outfit' },
                top: '9%',
                left: 'center'
            },
            tooltip: {
                trigger: 'axis',
                backgroundColor: 'rgba(10,15,30,0.85)',
                borderColor: 'rgba(0,240,255,0.3)',
                borderWidth: 1,
                textStyle: { color: '#e2e8f0', fontSize: 12 },
                formatter: (params) => {
                    let result = `${params[0].axisValue} 年<br/>`;
                    params.forEach(p => {
                        const val = p.value;
                        const valStr = (val !== null && val !== undefined) ? `${val.toFixed(2)} °C` : '无数据';
                        result += `<span style="display:inline-block;margin-right:5px;border-radius:10px;width:9px;height:9px;background-color:${p.color};"></span>${p.seriesName}: ${valStr}<br/>`;
                    });
                    return result;
                }
            },
            grid: { left: '8%', right: '5%', top: '24%', bottom: '10%' },
            xAxis: {
                type: 'category',
                data: years.map(String),
                axisLabel: {
                    color: '#94a3b8',
                    interval: Math.max(0, Math.floor(years.length / 12) - 1),
                    fontSize: 11
                },
                axisLine: { lineStyle: { color: 'rgba(0,240,255,0.15)' } },
                axisTick: { lineStyle: { color: 'rgba(0,240,255,0.15)' } },
                splitLine: { show: false }
            },
            yAxis: {
                type: 'value',
                name: '温度 (°C)',
                nameTextStyle: { color: '#94a3b8', fontSize: 11 },
                axisLabel: { color: '#94a3b8', fontSize: 11 },
                scale: true,
                splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)', type: 'dashed' } }
            },
            series: seriesList
        });
    }

    renderMonthlyMulti() {
        const targetYear = parseInt(this.targetYearEl.value);
        const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

        const colors = ['#00f0ff', '#ff007f', '#ffeaa7', '#00ff88', '#a855f7', '#3b82f6', '#f97316'];
        const seriesList = [];

        this.multiTimeSeriesData.forEach((item, pIdx) => {
            const temps = [];
            for (let m = 1; m <= 12; m++) {
                const entry = item.data.find(d => d.year === targetYear && d.month === m);
                temps.push(entry ? +entry.absoluteTemp.toFixed(2) : null);
            }

            const latStr = item.point.lat >= 0 ? `${item.point.lat.toFixed(1)}°N` : `${(-item.point.lat).toFixed(1)}°S`;
            const lonStr = item.point.lon >= 0 ? `${item.point.lon.toFixed(1)}°E` : `${(-item.point.lon).toFixed(1)}°W`;

            seriesList.push({
                name: `P${item.point.id} (${latStr}, ${lonStr})`,
                type: 'line',
                data: temps,
                smooth: true,
                symbol: 'circle',
                symbolSize: 6,
                lineStyle: { width: 2, color: colors[pIdx % colors.length] },
                itemStyle: { color: colors[pIdx % colors.length], borderColor: '#fff', borderWidth: 1 }
            });
        });

        this.initChart();
        this.chartInstance.setOption({
            title: {
                text: `${targetYear} 年 多点逐月温度变化对比`,
                textStyle: { color: '#e2e8f0', fontSize: 14, fontFamily: 'Orbitron' },
                left: 'center',
                top: 0
            },
            legend: {
                data: seriesList.map(s => s.name),
                textStyle: { color: '#94a3b8', fontSize: 10, fontFamily: 'Outfit' },
                top: '9%',
                left: 'center'
            },
            tooltip: {
                trigger: 'axis',
                backgroundColor: 'rgba(10,15,30,0.85)',
                borderColor: 'rgba(0,240,255,0.3)',
                borderWidth: 1,
                textStyle: { color: '#e2e8f0', fontSize: 12 },
                formatter: (params) => {
                    let result = `${params[0].axisValue}<br/>`;
                    params.forEach(p => {
                        const val = p.value;
                        const valStr = (val !== null && val !== undefined) ? `${val.toFixed(2)} °C` : '无数据';
                        result += `<span style="display:inline-block;margin-right:5px;border-radius:10px;width:9px;height:9px;background-color:${p.color};"></span>${p.seriesName}: ${valStr}<br/>`;
                    });
                    return result;
                }
            },
            grid: { left: '8%', right: '5%', top: '24%', bottom: '10%' },
            xAxis: {
                type: 'category',
                data: monthNames,
                axisLabel: { color: '#94a3b8', fontSize: 11 },
                axisLine: { lineStyle: { color: 'rgba(0,240,255,0.15)' } },
                axisTick: { lineStyle: { color: 'rgba(0,240,255,0.15)' } },
                splitLine: { show: false }
            },
            yAxis: {
                type: 'value',
                name: '温度 (°C)',
                nameTextStyle: { color: '#94a3b8', fontSize: 11 },
                axisLabel: { color: '#94a3b8', fontSize: 11 },
                scale: true,
                splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)', type: 'dashed' } }
            },
            series: seriesList
        });
    }

    renderEmpty() {
        this.initChart();
        this.chartInstance.setOption({
            title: {
                text: '该位置无有效温度数据（海洋或缺失区域）',
                textStyle: { color: '#94a3b8', fontSize: 14, fontFamily: 'Outfit' },
                left: 'center',
                top: 'center'
            },
            xAxis: { show: false },
            yAxis: { show: false },
            series: []
        });
    }

    renderAnnual() {
        const startYear = parseInt(this.startYearEl.value);
        const endYear = parseInt(this.endYearEl.value);

        const yearMap = {};
        this.timeSeriesData.forEach(d => {
            if (d.year >= startYear && d.year <= endYear) {
                if (!yearMap[d.year]) yearMap[d.year] = { sum: 0, count: 0 };
                yearMap[d.year].sum += d.absoluteTemp;
                yearMap[d.year].count++;
            }
        });

        const years = Object.keys(yearMap).map(Number).sort((a, b) => a - b);
        const temps = years.map(y => yearMap[y].count > 0 ? yearMap[y].sum / yearMap[y].count : null);

        const tMin = Math.min(...temps.filter(v => v !== null));
        const tMax = Math.max(...temps.filter(v => v !== null));
        const padding = Math.max(5, (tMax - tMin) * 0.15);

        this.initChart();
        this.chartInstance.setOption({
            title: {
                text: `年度平均温度变化趋势 (${startYear} - ${endYear})`,
                textStyle: { color: '#e2e8f0', fontSize: 15, fontFamily: 'Orbitron' },
                left: 'center',
                top: 0
            },
            tooltip: {
                trigger: 'axis',
                formatter: (params) => {
                    const p = params[0];
                    const val = p.value;
                    if (val === null || val === undefined) return `${p.axisValue} 年<br/>无数据`;
                    return `${p.axisValue} 年<br/>平均温度: ${val.toFixed(2)} °C`;
                },
                backgroundColor: 'rgba(10,15,30,0.85)',
                borderColor: 'rgba(0,240,255,0.3)',
                borderWidth: 1,
                textStyle: { color: '#e2e8f0', fontSize: 12 }
            },
            grid: { left: '8%', right: '5%', top: '16%', bottom: '12%' },
            xAxis: {
                type: 'category',
                data: years.map(String),
                axisLabel: {
                    color: '#94a3b8',
                    interval: Math.max(0, Math.floor(years.length / 12) - 1),
                    fontSize: 11
                },
                axisLine: { lineStyle: { color: 'rgba(0,240,255,0.15)' } },
                axisTick: { lineStyle: { color: 'rgba(0,240,255,0.15)' } },
                splitLine: { show: false }
            },
            yAxis: {
                type: 'value',
                name: '温度 (°C)',
                nameTextStyle: { color: '#94a3b8', fontSize: 11 },
                axisLabel: { color: '#94a3b8', fontSize: 11 },
                min: Math.floor(tMin - padding),
                max: Math.ceil(tMax + padding),
                splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)', type: 'dashed' } }
            },
            series: [{
                type: 'line',
                data: temps,
                smooth: true,
                symbol: 'none',
                lineStyle: { width: 2, color: '#00f0ff' },
                areaStyle: {
                    color: {
                        type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [
                            { offset: 0, color: 'rgba(0,240,255,0.25)' },
                            { offset: 1, color: 'rgba(0,240,255,0.02)' }
                        ]
                    }
                },
                markLine: {
                    silent: true,
                    animation: false,
                    data: [{
                        yAxis: temps.reduce((s, v) => s + v, 0) / temps.length,
                        label: { formatter: '选定期平均: {c}°C', color: '#94a3b8', fontSize: 10, position: 'insideEndTop' },
                        lineStyle: { color: 'rgba(255,255,255,0.2)', type: 'dashed', width: 1 }
                    }]
                }
            }]
        });
    }

    renderMonthly() {
        const targetYear = parseInt(this.targetYearEl.value);

        const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
        const monthTemp = [];

        for (let m = 1; m <= 12; m++) {
            const entry = this.timeSeriesData.find(d => d.year === targetYear && d.month === m);
            monthTemp.push(entry ? +entry.absoluteTemp.toFixed(2) : null);
        }

        const validTemps = monthTemp.filter(v => v !== null);
        const tMin = validTemps.length ? Math.min(...validTemps) : -10;
        const tMax = validTemps.length ? Math.max(...validTemps) : 40;
        const padding = Math.max(3, (tMax - tMin) * 0.15);

        this.initChart();
        this.chartInstance.setOption({
            title: {
                text: `${targetYear} 年 逐月温度变化`,
                textStyle: { color: '#e2e8f0', fontSize: 15, fontFamily: 'Orbitron' },
                left: 'center',
                top: 0
            },
            tooltip: {
                trigger: 'axis',
                formatter: (params) => {
                    const p = params[0];
                    if (p.value === null || p.value === undefined) return `${p.axisValue}<br/>无数据`;
                    return `${p.axisValue}<br/>温度: ${p.value.toFixed(2)} °C`;
                },
                backgroundColor: 'rgba(10,15,30,0.85)',
                borderColor: 'rgba(0,240,255,0.3)',
                borderWidth: 1,
                textStyle: { color: '#e2e8f0', fontSize: 12 }
            },
            grid: { left: '8%', right: '5%', top: '14%', bottom: '10%' },
            xAxis: {
                type: 'category',
                data: monthNames,
                axisLabel: { color: '#94a3b8', fontSize: 11 },
                axisLine: { lineStyle: { color: 'rgba(0,240,255,0.15)' } },
                axisTick: { lineStyle: { color: 'rgba(0,240,255,0.15)' } },
                splitLine: { show: false }
            },
            yAxis: {
                type: 'value',
                name: '温度 (°C)',
                nameTextStyle: { color: '#94a3b8', fontSize: 11 },
                axisLabel: { color: '#94a3b8', fontSize: 11 },
                min: Math.floor(tMin - padding),
                max: Math.ceil(tMax + padding),
                splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)', type: 'dashed' } }
            },
            series: [{
                type: 'line',
                data: monthTemp,
                smooth: true,
                symbol: 'circle',
                symbolSize: 7,
                lineStyle: { width: 2.5, color: '#ff007f' },
                itemStyle: { color: '#ff007f', borderColor: '#fff', borderWidth: 1 },
                areaStyle: {
                    color: {
                        type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [
                            { offset: 0, color: 'rgba(255,0,127,0.2)' },
                            { offset: 1, color: 'rgba(255,0,127,0.01)' }
                        ]
                    }
                }
            }]
        });
    }

    initChart() {
        if (this.chartInstance) {
            this.chartInstance.dispose();
        }
        this.chartInstance = echarts.init(this.chartContainer, 'dark', {
            renderer: 'canvas'
        });
    }
}
