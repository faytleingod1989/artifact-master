# 圣遗物原版图标替换设计规格

**范围：** V0.1.x 本地 Windows 版的代码改造阶段；不将尚未审核的任何原版素材打入发布包。

## 目标与非目标

将圣遗物图标的解析规则从“仅部位”改为“套装 + 部位”，使当前可录入的四套圣遗物各自拥有五个独立图标位。角色头像的本地导入能力维持不变。

本迭代不重构 OCR、评分、推荐算法或公开版云端架构；不引入运行时图片热链；不提供圣遗物自定义图标入口；不以 AI 或通用图标代替缺失的原版素材。

## 当前实现与改造边界

当前 `apps/web/src/App.tsx` 定义 `slotArtwork: Record<Slot, string>`，`ArtifactGlyph` 只接收 `slot`，并允许通过 `assetMap[artifact:<id>]` 覆盖圣遗物图标。该结构会使不同套装的同部位共用图标，并让内置圣遗物素材和用户本地素材混在同一逻辑中。

改造后，内置圣遗物素材存放在 `apps/web/src/assets/artifacts/`，并通过独立的 `manifest.ts` 作为唯一映射来源。`App.tsx` 只消费解析结果，保留现有页面布局、OCR 流程、IndexedDB 仓库、队列和回收站行为。

## 数据契约

### 稳定键与显示名

新增以下类型和静态注册表：

```ts
export type ArtifactSetKey =
  | 'shenlang-zhongqu'
  | 'heiyao-midian'
  | 'zhuying-lieren'
  | 'xishi-zhige'

export type Slot = '生之花' | '死之羽' | '时之沙' | '空之杯' | '理之冠'
export type ArtworkStatus = 'ready' | 'missing'

export type ArtifactArtworkEntry = {
  setKey: ArtifactSetKey
  setName: string
  slot: Slot
  status: ArtworkStatus
  src: string
  alt: string
  missingReason?: 'unregistered-set' | 'missing-asset' | 'load-error' | 'legacy-set-unresolved'
}
```

每一个已支持的 `ArtifactSetKey` 必须显式列出五个部位。代码阶段可以将某项标记为 `missing`，其 `src` 必须是统一占位图；但不能省略声明、复用其他套装图标或把 `missing` 当作最终发布可接受状态。

`Artifact` 增加 `setKey?: ArtifactSetKey`。新建、编辑、OCR 确认和 JSON 导入都写入 `setKey`；保留 `set` 作为中文显示名及历史数据兼容来源。读取历史数据时，以受控的中文名到 `setKey` 映射进行一次解析；无法解析时不猜测，返回缺图并记录迁移原因。

## 图标解析与组件接口

`getArtifactArtwork({ setKey, set, slot })` 是唯一的查图入口：

1. 优先使用合法 `setKey`；若缺失，仅通过精确中文套装名解析。
2. 查到 `ready` 条目时返回其图标和包含“套装名·部位原版图标”的 `alt`。
3. 未注册套装、缺失条目、缺失素材、旧数据无法解析以及图片加载失败均返回同一个占位图，并带可定位的 `missingReason`。
4. 在 `import.meta.env.DEV` 下，缺图以 `console.warn` 输出 `setKey`、`set`、`slot` 和原因。

`ArtifactGlyph` 改为接收 `artifact: Pick<Artifact, 'setKey' | 'set' | 'slot' | 'hue'>`，不再接收可覆盖的 `src`。图像加载错误切换到占位图，并保留缺图语义。仓库卡片、详情、强化队列、回收站、推荐方案、OCR 待确认及 JSON 导入后的记录均复用该组件。

## 素材与合规门禁

目录固定为：

```text
apps/web/src/assets/artifacts/
  manifest.ts
  placeholder-missing.svg
  shenlang-zhongqu/{flower,plume,sands,goblet,circlet}.png
  heiyao-midian/{flower,plume,sands,goblet,circlet}.png
  zhuying-lieren/{flower,plume,sands,goblet,circlet}.png
  xishi-zhige/{flower,plume,sands,goblet,circlet}.png
```

`docs/artifacts/source-register.md` 是发布审核记录。每个素材项记录 `setKey`、官方中文名、部位、来源 URL、获取日期、使用依据、源文件与项目文件 SHA-256、格式、像素尺寸、文件大小、处理说明和人工签收状态。

最终 Windows 发布门禁：20 项均为 `ready`，均有审核通过的来源记录，并且不存在占位图。否则仅可宣称“代码改造阶段完成”。

## 用户本地数据迁移

删除“导入此圣遗物图标”入口和读取 `artifact:<id>` 覆盖的行为。升级时不删除旧覆盖数据：迁移报告列出发现的旧键、关联圣遗物 ID 与忽略原因，并以版本标记防止重复报告。角色头像继续使用现有本地 `assetMap` 流程；在用户确认新版运行正常后，另行提供可恢复的清理动作，不能在本迭代首次启动时清除。

## 验证策略

在现有 Vite + React + TypeScript 项目中补充 Vitest 和 React Testing Library。单元测试验证注册表的 4×5 完整性、同部位跨套装不共享 `ready` 图标、`missing` 返回统一占位及开发告警。组件测试验证 `ArtifactGlyph` 的准确 `src`、`alt` 和图片加载失败降级行为。流程测试覆盖新建/编辑、OCR 确认、JSON 导入、强化队列、回收站与推荐区域的图标一致性。

每次代码合并前执行 `npm run lint`、测试与 `npm run build`；素材齐全后额外执行 Windows 便携包重建、打包产物清单核对和桌面/移动响应式视觉验收。

## 风险与处理

当前应用尚未配置测试脚本，且核心 UI 集中在 `App.tsx`。本迭代优先抽离最小的资产清单、解析器和图标组件，不扩展为全面组件重构。素材来源不清或官方名称未核实时，条目必须保持 `missing` 并进入缺口清单；不可因赶发布使用替代图。
