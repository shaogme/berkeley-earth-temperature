export class TimelineViewer {
    constructor(app) {
        this.app = app;
        this.chartInstance = null;
        this.years = [];
        this.temps = [];
        this.container = document.getElementById('timeline-container');
        this.chartEl = document.getElementById('timeline-chart');

        window.addEventListener('resize', () => {
            if (this.chartInstance) {
                this.chartInstance.resize();
            }
        });
    }

    init(years, temps) {
        this.years = years;
        this.temps = temps;

        if (this.chartInstance) {
            this.chartInstance.dispose();
        }

        this.chartInstance = echarts.init(this.chartEl, 'dark', {
            renderer: 'canvas'
        });

        const tMin = Math.min(...temps.filter(v => v !== null && !isNaN(v)));
        const tMax = Math.max(...temps.filter(v => v !== null && !isNaN(v)));
        const padding = (tMax - tMin) * 0.1;

        const option = {
            backgroundColor: 'transparent',
            grid: {
                left: '20px',
                right: '20px',
                top: '10px',
                bottom: '24px',
                containLabel: false
            },
            tooltip: {
                trigger: 'axis',
                backgroundColor: 'rgba(10, 15, 30, 0.85)',
                borderColor: 'rgba(0, 240, 255, 0.3)',
                borderWidth: 1,
                textStyle: { color: '#e2e8f0', fontSize: 11, fontFamily: 'Outfit' },
                axisPointer: {
                    type: 'line',
                    lineStyle: {
                        color: 'rgba(0, 240, 255, 0.5)',
                        width: 1.5,
                        type: 'dashed'
                    }
                },
                formatter: (params) => {
                    const p = params[0];
                    if (p.value === null || p.value === undefined || isNaN(p.value)) {
                        return `${p.name} 年<br/>无有效数据`;
                    }
                    return `${p.name} 年<br/>全球年均温度: <span style="color:#00f0ff;font-weight:bold;">${p.value.toFixed(2)} °C</span>`;
                }
            },

            xAxis: {
                type: 'category',
                data: this.years.map(String),
                axisLabel: {
                    color: '#64748b',
                    fontSize: 9,
                    fontFamily: 'Orbitron',
                    interval: 10, // 每隔 10 年显示一个刻度
                    align: 'center'
                },
                axisLine: {
                    lineStyle: { color: 'rgba(255, 255, 255, 0.05)' }
                },
                axisTick: {
                    alignWithLabel: true,
                    lineStyle: { color: 'rgba(255, 255, 255, 0.1)' }
                },
                splitLine: { show: false }
            },
            yAxis: {
                type: 'value',
                min: (tMin - padding).toFixed(1),
                max: (tMax + padding).toFixed(1),
                splitLine: {
                    lineStyle: { color: 'rgba(255, 255, 255, 0.03)', type: 'dashed' }
                },
                axisLabel: { show: false },
                axisLine: { show: false },
                axisTick: { show: false }
            },
            series: [
                {
                    name: 'Global Annual Temp',
                    type: 'line',
                    data: this.temps,
                    smooth: true,
                    symbol: 'circle',
                    symbolSize: 4,
                    showSymbol: false,
                    itemStyle: {
                        color: '#00f0ff'
                    },
                    lineStyle: {
                        width: 2,
                        color: {
                            type: 'linear', x: 0, y: 0, x2: 1, y2: 0,
                            colorStops: [
                                { offset: 0, color: '#3b82f6' }, // 早期蓝色代表低温
                                { offset: 0.7, color: '#00f0ff' }, // 中期青色
                                { offset: 1, color: '#ff007f' }  // 近期粉红代表高温
                            ]
                        }
                    },
                    areaStyle: {
                        color: {
                            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                            colorStops: [
                                { offset: 0, color: 'rgba(0, 240, 255, 0.15)' },
                                { offset: 1, color: 'rgba(0, 240, 255, 0.01)' }
                            ]
                        }
                    }
                }
            ]
        };

        this.chartInstance.setOption(option);

        // 注册拖拽洗涤（Scrubbing）与点击事件
        this.isDragging = false;
        this.lastDraggedYear = null;

        const zr = this.chartInstance.getZr();

        // 辅助函数：根据鼠标事件获取对应的年份
        const getYearFromEvent = (params) => {
            const pointInPixel = [params.offsetX, params.offsetY];
            if (this.chartInstance.containPixel('grid', pointInPixel)) {
                const xIndex = this.chartInstance.convertFromPixel({ gridIndex: 0 }, pointInPixel)[0];
                return this.years[xIndex];
            }
            return null;
        };

        // 触发年份切换更新
        const updateYearToApp = (year) => {
            if (year && year !== this.lastDraggedYear) {
                this.lastDraggedYear = year;
                this.app.yearSlider.value = year;
                this.app.onTimeChanged();
            }
        };

        zr.on('mousedown', (params) => {
            const year = getYearFromEvent(params);
            if (year) {
                this.isDragging = true;
                updateYearToApp(year);
            }
        });

        zr.on('mousemove', (params) => {
            if (this.isDragging) {
                const year = getYearFromEvent(params);
                if (year) {
                    updateYearToApp(year);
                }
            }
        });

        const stopDragging = () => {
            this.isDragging = false;
            this.lastDraggedYear = null;
        };

        zr.on('mouseup', stopDragging);
        // 当鼠标移出图表时，也停止拖拽
        zr.on('globalout', stopDragging);
    }

    // 更新时间轴上当前激活的年份（双向联动）
    updateActiveYear(year) {
        if (!this.chartInstance || this.years.length === 0) return;

        const idx = this.years.indexOf(year);
        if (idx !== -1) {
            // 通过 dispatchAction 触发 ECharts 指示器高亮
            this.chartInstance.dispatchAction({
                type: 'showTip',
                seriesIndex: 0,
                dataIndex: idx
            });
        }
    }
}
