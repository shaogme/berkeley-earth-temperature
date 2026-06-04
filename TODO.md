基于 **Tamara Munzner 的可视化分析与设计框架**（What-Why-How 及四层嵌套模型），我们可以对当前的全球温度 3D/2D 可视化系统进行系统性的评估，并探讨如何通过增强功能和优化实现来提升其科学性、交互体验和分析深度。

---

## 一、 基于 Munzner 框架的系统现状剖析

在设计改进方案前，我们先梳理当前系统在 **What-Why-How** 维度上的视觉编码与交互逻辑：

### 1. What（数据抽象）
*   **空间格点数据**：1度分辨率的全球陆地网格（$180 \times 360$）。
*   **时间维度**：1850年至今的逐月时间序列（约 2100 个时间步）。
*   **属性（Attributes）**：
    *   **定量（Quantitative）**：温度距平（Anomaly）、绝对温度（Absolute Temp = Anomaly + Climatology）、月度气候态基准（Climatology）。
    *   **分类/定性（Categorical）**：陆地/海洋掩膜（Land Mask）、国家边界与名称。

### 2. Why（任务抽象）
*   **展示/探索（Present/Explore）**：宏观上观察全球变暖在空间维度的分布与随时间的演变趋势。
*   **定位/查询（Lookup/Identify）**：交互式定位到特定经纬度，查询其具体的绝对温度数值。
*   **趋势比较（Compare Trends）**：在局部区域内，分析单点在几十年间的温度上升曲线或年内季节性波动。

### 3. How（习语设计 - 视觉编码与交互）
*   **视觉编码**：
    *   **标记（Marks）**：三维球面/二维平面的网格片（Grid cells）。
    *   **通道（Channels）**：空间位置（经纬度坐标映射至 3D 几何球体或 2D 平面网格）编码**空间属性**；颜色（从蓝色到红色的渐变色盘）编码**定量属性（绝对温度）**。
*   **交互技术**：
    *   **视图切换（Reduce/Change）**：在 3D Globe 和 2D Map 之间无缝切换。
    *   **过滤/切片（Filter/Slice）**：使用滑动条（Slider）调整年份和月份，过滤三维时空数据。
    *   **细节随需（Details-on-demand）**：悬浮 Tooltip 动态展示当前格点温度；右键上下文菜单触发 ECharts 模态框展示历史变化曲线。

---

## 二、 四层嵌套模型下的改进与功能扩展方案

针对系统的四个层级，我们提出以下具体的优化思路与代码改进方向：

### 1. 领域情况层 (Domain Situation) 与 抽象层 (Abstraction)
> **痛点分析**：当前系统主要呈现“绝对温度”。但在气候科学中，**“温度距平（Anomaly）”**（即偏离历史基准的程度）比“绝对温度”更能敏锐地反映全球变暖的趋势。另外，用户无法直观看到“哪里升温最快”。

*   **数据抽象升级：引入“增温速率（Warming Rate）”派生属性**
    *   **What**：计算每个格点在过去 100 年中温度随时间变化的线性回归斜率（Slope），作为派生属性。
    *   **Why**：帮助科学用户直接**发现极值（Identify Extremes）**——例如“北极放大效应”（Arctic Amplification），一眼看出哪些区域变暖速度最快。
*   **多任务扩展：多点/多国对比（Compare Multiple Targets）**
    *   **Why**：目前的 [temperature-chart.js](file:///d:/Documents/GitHub/berkeley-earth-temperature/js/temperature-chart.js) 仅支持单点查询。在分析中，用户往往需要对比“同一纬度不同经度”或“不同国家”的变暖速度。
    *   **How**：支持在图表中同时绘制多条曲线，或计算区域平均（如“中国平均”与“全球平均”的对比）。

---

### 2. 习语设计层 (Idiom / Visual Encoding & Interaction)
> **痛点分析**：
> 1. 颜色通道：绝对温度和温度距平均使用同一套蓝-红渐变色盘，这不符合 Munzner 的编码原则（定量距平数据应使用**发散色带 Diverging Colormap**）。
> 2. 交互缺乏上下文：年份选择器是盲目的，用户无法在调整滑块时预知“哪一年全球平均温度最高”。

*   **视觉编码改进：发散色带（Diverging Colormap）用于距平展示**
    *   **设计**：提供一个“图层模式切换”按钮（绝对温度 vs 温度距平）。当切换到**温度距平**时，使用经典发散色系（如 `RdBu`：深蓝代表负距平，白色/浅黄代表 0°C，深红代表正距平）。
    *   **修改位置**：修改 [globe-viewer.js](file:///d:/Documents/GitHub/berkeley-earth-temperature/js/globe-viewer.js#L155-L171) 中的 WebGL Shader 逻辑，将自定义的 `getTempColor` 修改为可配置的双色盘映射。
*   **全局时空联动：Overview + Detail（概览+细节）时间轴**
    *   **设计**：在 [index.html](file:///d:/Documents/GitHub/berkeley-earth-temperature/index.html) 底部或侧边栏，增加一个**全球年平均气温折线图**。
    *   **交互逻辑**：该折线图作为“Overview”。用户可以在折线图上直接点击或刷选（Brush）某年份，主视图（地球/平面图）会立即**同步联动（Linking）**跳转到对应年份，满足 Shneiderman 的“Overview first, zoom and filter, then details-on-demand”原则。
*   **时间维度动态播放（Animation Controls）**
    *   **设计**：在 [app.js](file:///d:/Documents/GitHub/berkeley-earth-temperature/js/app.js) 中增加播放/暂停/倍速控制按钮，使地球能随时间轴自动旋转并播放温度渐变动画，增强视觉冲击力。

---

### 3. 算法层 (Algorithm)
> **痛点分析**：
> 1. 数据量巨大（408MB NC 文件在前端下载耗时较长，对网络要求极高）。
> 2. [temperature-chart.js](file:///d:/Documents/GitHub/berkeley-earth-temperature/js/temperature-chart.js#L170-L208) 在获取单点时间序列时，调用了 WebAssembly `slice`，当频繁点击不同位置时会产生卡顿。

*   **算法优化 1：数据降维与渐进式加载（Progressive Resolution Loading）**
    *   **实现**：在发布生产环境时，可提供一份 2.5度（约 15MB）的轻量级网格数据集供快速载入，在后台异步下载 1度（408MB）的高精度数据。下载完成后，自动平滑替换 DataTexture。
*   **算法优化 2：单点时序提取性能提升**
    *   **实现**：目前的 NetCDF 文件存储格式通常是 `[time, lat, lon]`。当对特定点提取时序时，需要跨步长读取磁盘/内存，效率极低。可将常用的主要城市或区域的时序数据提前预计算并压缩为一个小 JSON，或者在 WASM 内存初始化时，在后台构建一个转置的 `[lat, lon, time]` 索引缓存，实现点击时毫秒级瞬时响应。
*   **算法优化 3：GPU 端数据重构与渲染**
    *   **实现**：将 `LandMask`、`Climatology` 和 `Anomaly` 的计算完全交由着色器（Shader）处理，避免在 CPU 中遍历 $180 \times 360$ 个网格进行浮点数相加，进一步榨干 GPU 性能，确保即使在低配设备上自转和缩放也是满帧（60FPS）。

---

## 三、 展望与后续开发建议

如果您打算着手改进此系统，建议的开发步骤如下：

1.  **推荐使用 `/goal` 或者是自主规划模式**，在系统架构上先将数据模式从纯“绝对温度”扩展为“绝对温度 + 距平模式”双通道切换。
2.  在 [index.html](file:///d:/Documents/GitHub/berkeley-earth-temperature/index.html) 中引入底部全局时间趋势图（Overview 视图），并在 [app.js](file:///d:/Documents/GitHub/berkeley-earth-temperature/js/app.js) 中实现它与 [globe-viewer.js](file:///d:/Documents/GitHub/berkeley-earth-temperature/js/globe-viewer.js) 之间的双向事件绑定。
3.  重构 [base-viewer.js](file:///d:/Documents/GitHub/berkeley-earth-temperature/js/base-viewer.js#L65-L85) 中的 `updateTemperatureTexture` 算法，使其在接收到不同数据类型时能应用不同的归一化区间，并在 Shader 中完美还原发散色盘。