#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
Berkeley Earth Surface Temperature 高分辨率网格数据提取与展示工具
"""

import os
import argparse
import numpy as np
import pandas as pd
import netCDF4 as nc
import matplotlib.pyplot as plt
from tabulate import tabulate

def parse_arguments():
    parser = argparse.ArgumentParser(
        description="从 Berkeley Earth NetCDF 格式网格化数据集中提取、分析并可视化温度数据。"
    )
    parser.add_argument(
        "--file", 
        type=str, 
        default=None, 
        help="网格数据集文件的路径（.nc 文件）。若不指定，将自动在当前目录下检测。"
    )
    parser.add_argument(
        "--lat", 
        type=float, 
        default=39.9, 
        help="目标地点的纬度（-90 至 90，北纬为正，如北京为 39.9）。"
    )
    parser.add_argument(
        "--lon", 
        type=float, 
        default=116.4, 
        help="目标地点的经度（-180 至 180，东经为正，如北京为 116.4）。"
    )
    parser.add_argument(
        "--start-year", 
        type=int, 
        default=2010, 
        help="数据展示与绘图的开始年份。"
    )
    parser.add_argument(
        "--end-year", 
        type=int, 
        default=2025, 
        help="数据展示与绘图的结束年份。"
    )
    parser.add_argument(
        "--output", 
        type=str, 
        default="temperature_analysis.png", 
        help="导出的折线趋势图文件名。"
    )
    return parser.parse_args()

def find_dataset(specified_path):
    if specified_path:
        if os.path.exists(specified_path):
            return specified_path
        else:
            print(f"[-] 指定的文件不存在: {specified_path}")
            return None
            
    # 自动寻找
    candidates = ["Global_TAVG_Gridded_5deg.nc", "Global_TAVG_Gridded_1deg.nc"]
    for c in candidates:
        if os.path.exists(c):
            print(f"[+] 自动检测到数据集文件: {c}")
            return c
            
    # 查找当前目录下的所有 .nc 文件
    nc_files = [f for f in os.listdir(".") if f.endswith(".nc")]
    if nc_files:
        print(f"[+] 自动检测到数据集文件: {nc_files[0]}")
        return nc_files[0]
        
    print("[-] 未能在当前目录下找到任何 .nc 数据集文件。")
    return None

def decimal_year_to_datetime(dec_year):
    """
    将十进制年份格式（如 1981.125）转换为 pandas Timestamp 和月份/年份
    1981.125 -> 1981 年 2 月底/月中
    """
    year = int(dec_year)
    remainder = dec_year - year
    # 每个月代表 1/12
    month = int(round(remainder * 12)) + 1
    if month > 12:
        month = 12
    elif month < 1:
        month = 1
    return year, month, pd.Timestamp(year=year, month=month, day=15)

def analyze_netcdf(file_path, target_lat, target_lon, start_year, end_year):
    print(f"\n[+] 正在载入数据集: {file_path}")
    dataset = nc.Dataset(file_path)
    
    # 1. 打印元数据摘要
    print("\n" + "="*50)
    print(" 数据集基础元数据信息")
    print("="*50)
    print(f"数据格式: {dataset.file_format}")
    
    # 打印全局属性摘要
    attrs = list(dataset.ncattrs())
    print(f"全局属性数: {len(attrs)}")
    if 'title' in dataset.ncattrs():
        print(f"数据集标题: {dataset.title}")
    
    # 打印维度和变量
    print("\n包含维度:")
    for dim_name, dim in dataset.dimensions.items():
        print(f"  - {dim_name}: 长度 {len(dim)}")
        
    print("\n包含变量:")
    for var_name, var in dataset.variables.items():
        print(f"  - {var_name}: 类型={var.dtype}, 维度={var.dimensions}")
    print("="*50 + "\n")
    
    # 2. 读取坐标维度
    lats = dataset.variables['latitude'][:]
    lons = dataset.variables['longitude'][:]
    times = dataset.variables['time'][:]
    
    # 3. 寻找最接近目标经纬度的格点索引
    lat_idx = np.abs(lats - target_lat).argmin()
    lon_idx = np.abs(lons - target_lon).argmin()
    
    actual_lat = lats[lat_idx]
    actual_lon = lons[lon_idx]
    
    print(f"[+] 输入目标位置: 纬度 {target_lat}°, 经度 {target_lon}°")
    print(f"[+] 最优匹配格点: 纬度 {actual_lat}°, 经度 {actual_lon}° (索引: lat_idx={lat_idx}, lon_idx={lon_idx})")
    
    # 4. 获取 land_mask (陆地占比)
    land_frac = 1.0
    if 'land_mask' in dataset.variables:
        land_frac = dataset.variables['land_mask'][lat_idx, lon_idx]
        print(f"[+] 该格点陆地占比 (Land Mask): {land_frac * 100:.2f}%")
    
    # 5. 获取 climatology (1951-1980 气候态基准温度，共 12 个月)
    climatology = np.zeros(12)
    if 'climatology' in dataset.variables:
        # 气候态维度一般是 (month, latitude, longitude) 或 (latitude, longitude, month)
        clim_var = dataset.variables['climatology']
        if clim_var.dimensions[0] == 'month' or len(clim_var.shape) == 3 and clim_var.shape[0] == 12:
            climatology = clim_var[:, lat_idx, lon_idx]
        else:
            climatology = clim_var[lat_idx, lon_idx, :]
            
        print("\n[+] 1951-1980 气候态基准温度 (Climatology, °C):")
        months = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"]
        clim_table = [[months[i], f"{climatology[i]:.2f}°C"] for i in range(12)]
        print(tabulate(clim_table, headers=["月份", "基准气候态温度"], tablefmt="fancy_grid"))
        
    # 6. 提取时间序列的温度距平并计算绝对温度
    temp_var = dataset.variables['temperature']
    dim_names = temp_var.dimensions
    
    # 根据维度顺序读取特定格点的全部距平数据
    if dim_names[0] == 'time':
        anomalies = temp_var[:, lat_idx, lon_idx]
    else:
        anomalies = temp_var[lat_idx, lon_idx, :]
        
    # 组装为 DataFrame
    records = []
    for t_idx, t_val in enumerate(times):
        yr, mo, dt = decimal_year_to_datetime(t_val)
        
        # 只保留目标范围年份的数据进行展示和处理
        if yr < start_year or yr > end_year:
            continue
            
        anomaly = anomalies[t_idx]
        
        # 处理掩码或 NaN
        if isinstance(anomaly, np.ma.core.MaskedArray):
            anomaly = anomaly.filled(np.nan)
            
        clim_val = climatology[mo - 1]
        
        if not np.isnan(anomaly):
            absolute_temp = clim_val + anomaly
        else:
            absolute_temp = np.nan
            
        records.append({
            'datetime': dt,
            'year': yr,
            'month': mo,
            'decimal_year': t_val,
            'anomaly': anomaly,
            'climatology': clim_val,
            'absolute_temp': absolute_temp
        })
        
    df = pd.DataFrame(records)
    dataset.close()
    
    return df, actual_lat, actual_lon, land_frac, climatology

def plot_and_save(df, actual_lat, actual_lon, output_path):
    if df.empty:
        print("[-] 没有找到指定时间范围的数据，无法绘图。")
        return
        
    # 设置美观的高清绘图样式
    plt.style.use('seaborn-v0_8-whitegrid' if 'seaborn-v0_8-whitegrid' in plt.style.available else 'default')
    
    # 创建带有双 Y 轴的高级图表
    fig, ax1 = plt.subplots(figsize=(12, 6.5), dpi=150)
    
    # 绘制绝对温度 (主轴 - 左侧)
    color_abs = '#e056fd' # 紫色调
    ax1.set_xlabel('时间 (年份)', fontsize=11, fontweight='bold', labelpad=10)
    ax1.set_ylabel('计算的绝对温度 (°C)', color=color_abs, fontsize=11, fontweight='bold')
    
    # 过滤掉 NaN 绘图
    valid_df = df.dropna(subset=['absolute_temp'])
    
    line1 = ax1.plot(valid_df['datetime'], valid_df['absolute_temp'], color=color_abs, alpha=0.4, 
             linestyle='-', linewidth=1, label='月度绝对温度')
    
    # 加上 12 个月移动平均以显示平滑趋势
    if len(valid_df) >= 12:
        valid_df = valid_df.copy()
        valid_df['smooth_abs'] = valid_df['absolute_temp'].rolling(window=12, center=True).mean()
        line2 = ax1.plot(valid_df['datetime'], valid_df['smooth_abs'], color='#6c5ce7', 
                 linewidth=2.5, label='12个月移动平均 (绝对温度)')
    else:
        line2 = []
        
    ax1.tick_params(axis='y', labelcolor=color_abs)
    
    # 绘制温度距平 Anomaly (副轴 - 右侧)
    ax2 = ax1.twinx()
    color_anom = '#ff7675' # 暖红色调
    ax2.set_ylabel('温度距平 Anomaly (°C)', color=color_anom, fontsize=11, fontweight='bold')
    
    # 用面积图/填充图表示距平超过 0 和低于 0
    valid_anom = df.dropna(subset=['anomaly'])
    
    # 绘制基准线 0
    ax2.axhline(0, color='#b2bec3', linestyle='--', alpha=0.7, linewidth=1)
    
    line3 = ax2.plot(valid_anom['datetime'], valid_anom['anomaly'], color=color_anom, alpha=0.8,
             linewidth=1.5, label='温度距平')
    
    # 填充正负距平区域
    ax2.fill_between(valid_anom['datetime'], valid_anom['anomaly'], 0, 
                     where=(valid_anom['anomaly'] >= 0), color='#ff7675', alpha=0.25, interpolate=True)
    ax2.fill_between(valid_anom['datetime'], valid_anom['anomaly'], 0, 
                     where=(valid_anom['anomaly'] < 0), color='#74b9ff', alpha=0.25, interpolate=True)
    
    ax2.tick_params(axis='y', labelcolor=color_anom)
    
    # 合并图例
    lines = line1 + line2 + line3
    labels = [l.get_label() for l in lines]
    ax1.legend(lines, labels, loc='upper left', frameon=True, facecolor='white', framealpha=0.9)
    
    plt.title(f'网格化气温数据分析图 (纬度: {actual_lat:.2f}°, 经度: {actual_lon:.2f}°)\n'
              f'时间范围: {df["year"].min()} - {df["year"].max()}', 
              fontsize=14, fontweight='bold', pad=15, color='#2d3436')
    
    # 支持中文显示（防止乱码）
    plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei', 'DejaVu Sans', 'Arial']
    plt.rcParams['axes.unicode_minus'] = False
    
    fig.tight_layout()
    plt.savefig(output_path, dpi=300)
    print(f"\n[+] 趋势折线图已绘制并成功保存至: {output_path}")

def main():
    args = parse_arguments()
    
    file_path = find_dataset(args.file)
    if not file_path:
        return
        
    df, actual_lat, actual_lon, land_frac, climatology = analyze_netcdf(
        file_path, args.lat, args.lon, args.start_year, args.end_year
    )
    
    if df.empty:
        print(f"[-] 在年份范围 {args.start_year} - {args.end_year} 内未提取到任何数据。")
        return
        
    # 展示最近的数据表格
    print("\n" + "="*80)
    print(f" 提取温度时间序列数据表（最近的 15 条记录，范围: {args.start_year}-{args.end_year}）")
    print("="*80)
    
    show_df = df.tail(15).copy()
    show_df['datetime'] = show_df['datetime'].dt.strftime('%Y-%m')
    show_df['anomaly'] = show_df['anomaly'].map(lambda x: f"{x:+.3f}°C" if not np.isnan(x) else "NaN")
    show_df['climatology'] = show_df['climatology'].map(lambda x: f"{x:.2f}°C")
    show_df['absolute_temp'] = show_df['absolute_temp'].map(lambda x: f"{x:.3f}°C" if not np.isnan(x) else "NaN")
    
    table_data = show_df[['datetime', 'decimal_year', 'climatology', 'anomaly', 'absolute_temp']].values.tolist()
    print(tabulate(table_data, headers=["时间", "十进制年份", "气候态基准", "距平(Anomaly)", "计算绝对温度"], tablefmt="fancy_grid"))
    
    # 打印简单统计
    valid_temp = df['absolute_temp'].dropna()
    valid_anom = df['anomaly'].dropna()
    if not valid_temp.empty:
        print("\n" + "-"*50)
        print(f" 统计概要 ({args.start_year} - {args.end_year}):")
        print(f"   最大距平值: {valid_anom.max():+.3f} °C")
        print(f"   最小距平值: {valid_anom.min():+.3f} °C")
        print(f"   平均距平值: {valid_anom.mean():+.3f} °C")
        print(f"   计算出的平均绝对温度: {valid_temp.mean():.3f} °C")
        print("-"*50)
        
    # 绘制可视化趋势图
    plot_and_save(df, actual_lat, actual_lon, args.output)

if __name__ == "__main__":
    main()
