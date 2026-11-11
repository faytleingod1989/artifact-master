# 七页面导航 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 顶部七个入口切换七个独立页面，保留仓库会话和共享数据，交付可用 Windows 个人包。

**Architecture:** App 保留唯一持久化/录入控制层，页面只挂载当前主体。Warehouse 接受可选受控会话状态，保持原组件独立使用兼容。角色、推荐、队列、素材、回收站与图鉴各有独立页面组件；导航不改变 URL，保持桌面 IPC 校验。

**Tech Stack:** 当前 React 19 / TypeScript / Vite / Electron / IndexedDB / Vitest / Playwright，不新增依赖。

**Spec:** `docs/superpowers/specs/2026-10-05-page-navigation-design.md`

## Global Constraints

- 七页标识：warehouse、characters、recommendations、queue、catalog、assets、trash。
- 只挂载当前主体；导航不写装备、重载库或改变 URL/hash；默认启动仓库。
- 库存、头像、队列、保存/录入会话和角色选择留在 App；保持 v2 备份、旧键和失败重试。
- 仓库筛选、排序、多选、详情、对比、范围切页保留；图鉴状态单独保留。
- 原图与头像 contain，保持个人/公开隔离；只展示已有核实资料，不编套装效果或完整配装能力。
- 新个人包 `ArtifactMaster-0.1.0-pages-20261005-local.exe`；旧包不删、不覆盖。未授权真实 UID、原 profile 或发布。
- 用户已明确“细化再执行”，本会话直接执行，不重复请求计划批准；无 Git 仓库，使用源码副本和持久 ledger，不初始化或提交 Git。

## Review Focus

1. 被筛选隐藏的跨页查看目标：提示并提供显式清筛选，原筛选不被静默清除（Task 2）。
2. 恢复整库后同 ID 的不同件：会话详情/多选/对比失效，不能误操作新件（Task 2）。
3. 自定义图片延期回调跨页：仍写原角色键；旧恢复代际保护有效（Task 4）。
4. 读取/保存失败及忙碌时切页：状态公共且数据操作仍受保护，不以空库覆盖（Task 1/4）。
5. 公开构建及未知图鉴资料：明确未包含素材/资料缺少，离线查看不联网、不写库存（Task 3/5）。

## Task 1: 真正的页面壳与共享导航

**Files:** Create `src/pages/navigation.ts`, `src/pages/page.css`, `src/pages/PageNavigation.test.tsx`; Modify `src/App.tsx`（路径均相对 apps/web）。
**Interfaces:** `PageId` 七值联合，`PAGE_ITEMS` 标识/标题/icon/副标题；`PageNavigation({ active, onNavigate, disabled, mobile? })`。页面壳 `section[data-page]`，`h1` 是可聚焦页面标题。

- [x] 新增真实 App 测试：七入口各得到对应唯一 h1 与 aria-current，其他主体不在 DOM；素材/回收站不是 dialog；页面切换 URL 不变；录入 dialog 打开时导航禁用。
- [x] Run `npm test -- src/pages/PageNavigation.test.tsx`，Expected: 旧 App 的滚动导航失败。
- [x] 导出导航常量和组件，App 使用 PageId 和条件主体；公共保存/反馈与全部来源弹窗保留；顶部与窄屏都由同一菜单源生成。
- [x] 同一测试重跑为 PASS；缺页内容由后续任务补齐，导航不做假完成结论。

## Task 2: 仓库会话与跨页状态

**Files:** Create `src/warehouse/warehouseSession.ts`; Modify `Warehouse.tsx`, `App.tsx`; Extend `PageNavigation.test.tsx`, `Warehouse.test.tsx`。
**Interfaces:** `WarehouseSession { view, filters, sort, selectedIds, detailId?, comparing }`；`createWarehouseSession()`；Warehouse 可选 `session/onSessionChange`，原 props 保留；App `viewRecord(id)` 设跨页待查看目标。

- [x] RED：搜索/排序/列表/两件多选对比切页后保留；目标被筛选隐藏时提示，点击清筛选才展示；删掉对比项不显示失效对比；成功整库恢复清空旧会话引用（含同 ID）；取消/拒绝备份不重置会话。
- [x] Run `npm test -- src/pages/PageNavigation.test.tsx src/warehouse/Warehouse.test.tsx`，Expected: 未提升状态的切页保留失败。
- [x] App 托管会话与范围；Warehouse 独立使用仍自托管。跨页目标显示提示与明确查看操作；整库成功恢复重置选中引用而保留视图/筛选/排序。仅 ID 确实存在的选择可操作。
- [x] 重跑上述测试 Expected: PASS。

## Task 3: 角色、推荐与本地图鉴

**Files:** Create `src/pages/characterProfiles.ts`, `CharactersPage.tsx`, `RecommendationsPage.tsx`, `CatalogPage.tsx`, `CatalogPage.test.tsx`; Modify `App.tsx`, `scoring.ts`（只添加现有权重的只读说明导出）。
**Interfaces:** 角色配置单一来源；角色/推荐页 consume `artifacts, characterName, assetMap` 及切角色/查看记录/加入队列回调；Catalog consume `state:{search,setKey,slot,level}, onChange`；图鉴复用现有 catalog/gameData/statModel/manifest。

- [x] RED：角色切换后推荐名称与候选一致；空库五个缺位；推荐评分与原函数一致；图鉴空库仍显示正确五部位名称，花 +20=4780、羽 +20=311，元素充能不能作为杯主词条；缺图/缺效果说明明确，图鉴搜索切页保留。
- [x] Run `npm test -- src/pages/PageNavigation.test.tsx src/pages/CatalogPage.test.tsx`，Expected: 新内容不存在或对应主词条信息失败。
- [x] 实现两页不同职责；候选用既有评分函数与原权重，无装备持久化；图鉴只读成长值/副词条校验范围，资料来自原数据。
- [x] 重跑为 PASS，原 `scoring.test.ts` 回归。

## Task 4: 队列、素材、回收站及旧回归转为跨页

**Files:** Create `QueuePage.tsx`, `AssetsPage.tsx`, `TrashPage.tsx`; Modify `App.tsx`, `App.test.tsx`, `tests/optimization.spec.ts`, `tests/warehouse.spec.ts`, `tests/electron-offline-smoke.mjs`。
**Interfaces:** 页面通过原 App callbacks 改同一份仓库；队列 consume `queuedArtifacts, onRemove, onView, characterName`；素材 consume `assetMap,onImport`；回收站 consume `trash,onRestore,onEmpty`；全部受统一 disabled 保护。

- [x] RED：队列五件在独立页可移除/清空且返回仓库件数不变；回收站恢复跨页更新；素材延期读取跨页应用原角色，不被旧恢复回调覆盖；忙碌/保存失败在所有页面反馈不消失。
- [x] Run 局部 App 测试，Expected: 旧 DOM/dialog 假设在真分页下失败；保留业务断言，只添加真实导航，不删除故障注入覆盖。
- [x] 完成独立页面，去掉旧长页面块和弹窗；更新旧测试按实际流程切页。已有浏览器/离线测试的头像和队列步骤先导航，再继续原验证。
- [x] `npm test` Expected: 全部通过；`npm run test:ui` Expected: 新旧交互全部通过。

## Task 5: 窗口视觉、包级验收与交付

**Files:** Extend `page.css`, `tests/navigation.spec.ts`; Modify `package.json`, `electron-builder.local.cjs`, 根 `启动圣遗物管理大师.vbs`、`本地版使用说明.md`；Create `docs/superpowers/verification/2026-10-05-page-navigation.md`。

- [x] Playwright 新用例在 1440×920 / 980×680 切七页截屏，断言主导航/标题/主体、图片 contain、横向溢出与关键按钮可达；移动导航七入口可达；选择/筛选跨页保留。只用隔离合成库存。
- [x] Run `npm run test:ui`, `npm run lint`, `npm run test:electron`, 根 `node --test scripts/*.test.mjs`；Expected: 全通过。
- [x] 设置唯一 pages-20261005 名称并更新启动器与 fixture 目标，保留旧包。Run `npm run desktop:build:local` Expected: 新 EXE 存在且资源门禁通过。
- [x] Run `npm run test:desktop-offline` Expected: 新 ASAR 真实 OCR/手动、七页导航、头像、队列/备份、重开和 0 外网请求通过。
- [x] Run `npm run build`, `npm run verify:artifact-release`, 公开 OCR 哈希检查；Expected: 个人素材无泄漏，未发布公开 EXE。
- [x] 做最终独立只读代码复核；重要问题补 RED→GREEN 与完整回归。检查 EXE 哈希和启动器 dry-run，保留源码副本/ledger，记录仍需真实场景验收的边界。

## 自检与执行方式

设计九节分别落实到上述五任务；最容易出错的状态/恢复/资料边界均有具体测试。Task 1 的菜单/PageId、Task 2 的 WarehouseSession 由后续页面消费，callback 与持久化唯一归属 App，无循环模块依赖。按用户已指定的当前模型直接实施；最终复核可用同模型独立只读审核，不更换实施模型。
