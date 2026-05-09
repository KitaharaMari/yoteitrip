# YoteiTrip 开发日志 (Phase 0–5 归档，见 git history)

---

## 2026-05-05 — Phase 6: 方案 B 并行备案系统

### 数据模型
- **`SceneTag`** 类型：`'INDOOR' | 'REST' | 'LATE_START'`
- **Activity** 新增字段：`isBackup?`, `linkedToId?`, `sceneTags?`
- 备案活动与主活动共存于 `activities[]`（Flat list），通过 `isBackup + linkedToId` 区分
- 主活动链（cascade / DnD）：`primaryActivities = activities.filter(a => !a.isBackup)`

### Store 新增 Actions
| Action | 说明 |
|---|---|
| `addBackupActivity(dayId, primaryId, type)` | 在主活动后方插入备案活动 |
| `setPreferred(dayId, primaryId, backupId)` | 互换主/备方案（Flags + 位置互换） |
| `removeBackupActivity(dayId, backupId)` | 删除备案活动 |
| `reorderActivities` (更新) | 以主活动为单位移动整组（主+其全部备案）|

### 动画架构（Framer Motion）
- `LayoutGroup` 包裹整个 ActivityList → 统一 FLIP 动画作用域
- 主活动卡：`motion.div layoutId="card-{id}"` + `layout`
- 备案卡：`motion.div layoutId="card-{id}"` + `layout`（在 BackupSlot 内）
- 点击"设为首选"后，两个 layoutId 的 DOM 位置互换 → Framer Motion 自动 FLIP 动画（新主从下往上升，旧主从上往下降）
- 通勤自动重算：`setPreferred` 改变主活动 `placeId` → `useCommuteTime` deps 变更 → 新缓存 key → 重新调用 Distance Matrix

### 展开/收起动画（BackupSlot）
```
initial: { height: 0, opacity: 0 }
animate: { height: 'auto', opacity: 1 }
exit:    { height: 0, opacity: 0 }
transition: duration 0.24s ease[0.4, 0, 0.2, 1]
```

### Task 4: 场景模拟标签
- `src/lib/sceneTags.ts`：`SCENE_TAG_META` + `ALL_SCENE_TAGS`
- 每张 BackupCard 可 toggle 场景标签（标签存于 activity.sceneTags[]）
- BackupSlot 顶部显示场景筛选栏（仅当有备案携带标签时出现）
- 点击标签：高亮匹配的备案（`bg-amber-50 border-amber-200`）并过滤其他

### Plan B 入口（ActivityCard 右下角）
- Fork 图标 + "方案 B" 文字（若有备案则显示数量 "方案 B · 2"）
- 无备案时：灰色淡显；有备案时：蓝色；展开时：深灰
- Preview 模式隐藏

### 新文件
| 文件 | 说明 |
|---|---|
| `src/types.ts` | +SceneTag, +isBackup, +linkedToId, +sceneTags |
| `src/lib/sceneTags.ts` | 场景标签元数据 |
| `src/components/BackupCard.tsx` | 备案卡片：Tags + 设为首选 + 删除 |
| `src/components/BackupSlot.tsx` | AnimatePresence 展开槽 + 场景筛选栏 + Add 按钮 |

### 修改文件
- `src/store/useTripStore.ts` — 新增3个 action，更新 reorderActivities
- `src/components/ActivityCard.tsx` — Fork 按钮行、新 Props
- `src/components/SortableActivityItem.tsx` — 透传 backup Props
- `src/components/ActivityList.tsx` — LayoutGroup, motion.div layoutId, BackupSlot

**tsc --noEmit：零报错 ✅**

---
