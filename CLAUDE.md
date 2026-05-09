# YoteiTrip MVP — 开发工作手册

## 项目概述
模块化旅游日程规划工具。去中心化、非线性的"积木式"规划体验，支持分钟级精确规划。

## 核心交互逻辑
- 首页即日程表，默认从 Day 1 开始（非问答式启动）
- 右上角 `+` 动态增加天数（无限扩展）
- Mobile：手势左右滑动切换天数；Web：Tab 切换
- 每天内部：垂直时间轴 + 模块化卡片

## 四类积木模块
| 类型 | 说明 |
|---|---|
| Transport | 机场/车站，支持自定义起始时间 |
| Stay | 景点/活动/购物点 |
| Meal | 餐饮（午餐/午茶/晚餐） |
| Accommodation | 酒店，支持"同前一晚"或"新区域" |

## 时间推算逻辑
```
当前模块结束时间 = 开始时间 + 用户手动选择的停留时长
下一模块开始时间 = 当前模块结束时间 + Google Distance Matrix 通勤时间
```

## Google Maps API 集成
- Places Autocomplete：所有模块地点输入
- Distance Matrix API：相邻模块通勤时长计算
- 点击通勤模块 → 唤起 Google Maps 原生导航

## 开发阶段规划
- **Phase 1** — Zustand 状态树（多天 + 多模块数据结构）✅
- **Phase 2** — 核心 UI（卡片渲染、横向切换逻辑）
- **Phase 3** — Google Maps API 联调（地点选择 + 时间推算）
- **Phase 4** — 时间轴顺延逻辑优化

## 技术栈
- 框架：Next.js (App Router)
- 状态管理：Zustand + persist middleware (localStorage)
- 样式：Tailwind CSS
- 语言：TypeScript
- 双端适配：Mobile-first，Web 中心化窄屏容器

## 开发规范
- 极简模块化卡片设计（Modular Card Design）
- 通勤模块显示为两卡片间连接线，标注步行/驾车/公交时间
- Web 端保持 App 级一致观感
- 纯客户端应用，无后端，localStorage 持久化
