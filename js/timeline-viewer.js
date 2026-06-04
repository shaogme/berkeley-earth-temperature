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
            brush: {
                toolbox: [], // 隐藏默认工具栏按钮以保持 UI 简洁，直接在图表上拖拽进行刷选
                brushType: 'lineX',
                xAxisIndex: 0,
                brushStyle: {
                    borderWidth: 1,
                    color: 'rgba(0, 240, 255, 0.15)',
                    borderColor: 'rgba(0, 240, 255, 0.5)'
                },
                outOfBrush: {
                    colorAlpha: 0.3
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

        // 注册交互事件 1: 点击网格背景/折线以联动跳转
        this.chartInstance.getZr().on('click', (params) => {
            // 如果是在刷选状态，则不触发常规点击
            if (this.isBrushing) return;

            const pointInPixel = [params.offsetX, params.offsetY];
            if (this.chartInstance.containPixel('grid', pointInPixel)) {
                const xIndex = this.chartInstance.convertFromPixel({ gridIndex: 0 }, pointInPixel)[0];
                const year = this.years[xIndex];
                if (year) {
                    this.app.yearSlider.value = year;
                    this.app.onTimeChanged();
                }
            }
        });

        // 注册交互事件 2: 拖拽刷选 (Brush) 联动跳转
        this.chartInstance.on('brushEnd', (params) => {
            const areas = params.areas;
            if (areas && areas.length > 0) {
                const range = areas[0].coordRange;
                if (range && range.length === 2) {
                    const startIdx = Math.round(range[0]);
                    const endIdx = Math.round(range[1]);
                    // 跳转至选中区间的末年份
                    const targetYear = this.years[endIdx];
                    if (targetYear) {
                        this.app.yearSlider.value = targetYear;
                        this.app.onTimeChanged();
                    }
                }
            }
        });
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
