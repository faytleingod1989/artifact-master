# 圣遗物仓库与录入改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留本地数据的前提下，完成已确认的仓库布局、双视图、便捷手动录入、UID 展柜导入和实时采集改进。

**Architecture:** 沿用现有 React/Vite/Electron/IndexedDB；只拆分这次涉及的仓库、草稿、采集和展柜模块。三份子计划共用词条与确认接口，先完成可离线使用的仓库与手动录入，再接入 UID、实时采集，最后验收两种 Windows 构建。

**Tech Stack:** React 19、TypeScript 6、Vite 8、Electron 43、Tesseract.js 7、idb-keyval、Vitest、Testing Library；浏览器布局验收使用 Playwright。

**Spec:** [已确认设计](../specs/2026-10-01-warehouse-input-redesign-design.md)。执行者同时阅读设计和对应子计划；本文是调度入口，不是完成报告。

**2026-10-01实施状态：** 自动验收与两种Windows包已完成，详细证据见验收记录；P1 Step5、实际游戏采集/DPI和真实UID仍待测，旧问题原图已遗失。私有构建模式修订为personal，因为Vite 8拒绝local模式名称；命令build:local和输出目录不变。勾选表示对应证据已取得，不代表整份计划全部通过。

## Global Constraints

- 个人本地 Windows 使用，只收入五星圣遗物。
- 主入口：实时采集、便捷手动录入；新增：UID 公开角色展柜导入；截图识别保留为次级入口。
- 不新增 GOOD 导入；JSON 备份恢复不属于 GOOD。
- 原有本地数据和 JSON 备份继续可用，不为改版清空仓库。
- 所有界面共用 `ArtifactGlyph` 和“套装 + 部位”映射；图片等比缩放、居中、完整显示，使用 `object-fit: contain`。
- 不读取游戏内存、客户端文件、账号凭据、Cookie、Token 或网络封包；不模拟游戏鼠标键盘、不自动翻背包。
- UID 为可选联网功能；仓库、手动录入和实时采集不依赖 UID 服务。
- 等级为 0～20 整数，至多四条副词条且类型不重复；副词条类型不能与主词条相同。
- 双暴仅计算副词条：`2 × 暴击率 + 暴击伤害`；百分比差值以“百分点”表达；+20 显示“已满级”。
- 待确认批次最多20件；UID 请求超时15秒，单次响应限制5MB；本地和公开构建分离，公开构建保留素材隔离检查。
- 当前目录不是 Git 仓库。不擅自初始化 Git、不执行提交命令；每项验收后记录文件清单、测试结果和回退点。实施前制作不覆盖原文件的带日期源码快照，并提示用户导出 JSON 备份。
- 保留现有回收站、强化队列、角色规则、角色头像和备份功能；只标明“规则初评”，不扩展为伤害模拟、云同步或移动端项目。

## Review Focus

- 已保存的空仓库与读取失败：不能重新塞入演示数据或把读取失败写回为空；由 W1 固定测试。
- 同毫秒批量入库、同词条但不同实物：ID 不冲突，重复由用户决定，取消无写入；由 W1/W4 固定测试。
- 一件未知 UID 装备夹在有效装备中、恶意响应/跳转：有效项可单独确认，未知项不猜，主进程不成为代理；由 U1/U2/U3 固定测试。
- 连按 F8、识别期间停止、关闭后迟到结果：单任务串行，最多20件，不遗留捕获和后台写入；由 R3 固定测试。
- 高 DPI/超宽截图及最小窗口：原分辨率裁切、不漏边界，图标不压扁，主要操作可见；由 W2/W3/R1/P1 固定测试。

---

## 1. 工作包、顺序和文件职责

| 顺序 | 子计划/任务 | 独立交付结果 | 进入下一项的条件 |
| --- | --- | --- | --- |
| 1 | [仓库与手动录入 W1～W4](2026-10-01-warehouse-manual.md) | 保数据、原图双视图、真实筛选、对比、结构化录入与统一确认 | 自动测试通过；两种窗口尺寸人工检查通过 |
| 2 | [UID 展柜 U1～U3](2026-10-01-uid-showcase-import.md) | 点击查询公开展柜、五星解析、重复确认、错误/缓存提示 | 脱敏样本与 IPC 测试通过；实测单列状态 |
| 3 | [实时采集 R1～R3](2026-10-01-realtime-capture-quality.md) | 原分辨率区域、离线 OCR、F8 串行队列、确认与释放 | 至少10张真实截图测试；五部位覆盖；准确条目≥9/10 |
| 4 | 本文 P1 | 本地 Windows 包、公开构建、数据恢复与验收记录 | 所有强制验收项有真实证据 |

文件边界：`src/artifacts/` 管词条、草稿、目录及 OCR；`src/storage/` 管原有存储兼容；`src/warehouse/` 管显示与选择；`src/imports/` 管手动/UID/确认；`src/capture/` 管区域和会话；`electron/` 管系统采集与固定网络请求；`scripts/` 管字典、资源和发布检查。`App.tsx` 仅连接这些模块，不整库重写。

所有任务的文件路径相对 `E:/AI Project/YS`。除单独注明外，`npm` 命令在 `apps/web` 执行，`node scripts/...` 命令在项目根执行。新增命令在所属任务完成后才可运行，不代表现在已存在。

## 2. 跨工作包接口锁定

W1 在 `apps/web/src/artifacts/artifactDraft.ts` 定义并导出：

```ts
type DraftSource = 'manual' | 'realtime' | 'screenshot' | 'uid'
type DraftIssue = { field: string; code: string; message: string; severity: 'error' | 'warning' }
type ArtifactDraft = {
  draftId: string; setKey?: ArtifactSetKey; slot?: ArtifactSlot; rarity: 5
  level?: number; main?: StatValue; subs: StatValue[]; name?: string
  source: DraftSource; sourceCharacterId?: number; fetchedAt?: number
  issues: DraftIssue[]
}
type ImportDecision = { draft: ArtifactDraft; action: 'skip' | 'add' | 'update'; targetId?: number }
type ImportResult = { artifacts: ArtifactRecord[]; added: number; updated: number; skipped: number }
validateDraft(draft: ArtifactDraft): DraftIssue[]
draftToRecord(draft: ArtifactDraft, id: number): ArtifactRecord
recordToDraft(record: ArtifactRecord, source: DraftSource): ArtifactDraft
findDuplicateIds(draft: ArtifactDraft, records: ArtifactRecord[]): number[]
applyImportDecisions(existing: ArtifactRecord[], entries: ImportDecision[], reservedIds?: number[]): ImportResult
```

这些是接口声明，非可直接粘贴的完整源码。`ArtifactRecord/ArtifactSlot/ArtifactSetKey` 使用现有 `artifacts/types.ts`；W1 增加兼容的可选 `source: {kind: DraftSource; characterId?: number; fetchedAt?: number}`，不改变旧记录 ID 类型、不存 UID。`draftId` 是临时 UUID；实体 ID 仍为安全整数，由 W1 的分配器统一生成。入库传入回收站 IDs 作为 `reservedIds`，避免以后恢复时撞号；明确更新保留已有本地锁定状态，UID 不覆盖锁定。

W1 在 `statModel.ts` 导出 `StatKey`、`StatValue={key:StatKey;value:number}`、`parseStat(text:string):StatValue|null`、`formatStat(stat:StatValue):string`、`getLegalMainStats(slot:ArtifactSlot):StatKey[]`、`getExpectedMain(slot:ArtifactSlot,key:StatKey,level:number):number|null`、`getCritValue(subs:StatValue[]):number`。`StatKey` 固定为平值/百分比生命、攻击、防御，精通、充能、暴击率、暴伤、治疗、物伤及七元素伤害：`hpFlat/hpPercent/atkFlat/atkPercent/defFlat/defPercent/elementalMastery/energyRecharge/critRate/critDamage/healingBonus/physicalDmgBonus/pyroDmgBonus/hydroDmgBonus/electroDmgBonus/cryoDmgBonus/anemoDmgBonus/geoDmgBonus/dendroDmgBonus`。数值按游戏显示单位，百分比 `62.2` 表示 `62.2%`。

W4 在 `ImportReview.tsx` 导出 `DraftReviewItem={draft:ArtifactDraft;previewUrl?:string;rawOcr?:string}` 及 `ImportReviewProps={items:DraftReviewItem[];existing:ArtifactRecord[];onConfirm:(decisions:ImportDecision[])=>Promise<void>;onCancel:()=>void}`。入库只经 `applyImportDecisions` → `saveLibrary`；来源转换器禁止直接写仓库。图片 URL 归创建者所有，确认/丢弃/取消/卸载时释放；预览组件不擅自提前释放。

## 3. 实施开始前

- [x] 阅读已确认设计和第一份子计划；确认目前未保存改动，保存带日期快照，不覆盖旧源码/EXE。
- [x] 在 `docs/superpowers/verification/2026-10-01-warehouse-input-redesign.md` 新建验收记录，记录基线 `npm test`、`npm run lint`、`npm run build` 的实际结果；基线失败先记录归属，不伪称本次引入。
- [x] 将已批准概念图复制到 `docs/superpowers/design-assets/2026-10-01-warehouse-input-redesign.png`，仅作布局参考，不混入产品图标或数据。
- [x] 按 W1→W2→W3→W4→U1→U2→U3→R1→R2→R3→P1 执行；各任务先失败测试、再最小实现、再验收和回退记录。不同时让多个执行者修改 `App.tsx` 或同一接口文件。

## 4. Task P1：Windows 集成、构建隔离与最终验收

**Files:**

- Create: `apps/web/electron-builder.local.cjs`、`scripts/verify-artifact-local.mjs`、`scripts/verify-artifact-local.test.mjs`、`scripts/verify-local-ocr-resources.mjs`、`scripts/verify-local-ocr-resources.test.mjs`。
- Modify: `apps/web/package.json`、`scripts/verify-artifact-release.mjs`、`scripts/verify-artifact-release.test.mjs`；仅调整模式识别所必需的兼容，保留公开输出的拒绝泄漏语义。
- Test/Record: `docs/superpowers/verification/2026-10-01-warehouse-input-redesign.md`、`apps/web/tests/warehouse.spec.ts`。

**Interfaces:** Consumes W2 的本地 `dist-local`、R2 的 `ocr/resources.json`、原有发布检查 `verifyRelease(overrides)`。Produces `verifyLocalArtwork(outputRoot:string):{checked:number}`、`verifyLocalOcrResources(outputRoot:string):{checked:number}`，分别在新检查脚本导出；命令 `verify:artifact-local`/`verify:ocr-local` 调用对应脚本检查 `dist-local`。`build:local`/`desktop:build:local` 输出 `dist-local`/`release-local`；公开命令仍使用 `dist`/`release`。本地 builder 把 `dist-local` 映射到包内 `dist`，沿用现有主进程加载路径和应用 ID，以保持现有存储身份。

- [x] **Step 1：写失败测试。** 命名 `publicRejectsPrivateArtwork/localRequiresEveryMappedIcon/offlinePackageRequiresAllOcrFiles`；Node断言用 `assert.throws(publicLeakCheck)`、`assert.throws(localMissingOneIconCheck)`、`assert.throws(missingLanguageCheck)`。本地检查需核对44套×5部位=220幅原图的来源哈希和构建可达性，不是仅查源码目录；OCR 检查验证 worker、全部所需 core JS/WASM、chi_sim/eng 语言文件及其哈希。
- [x] **Step 2：验证红灯。** 根目录执行 `node --test scripts/verify-artifact-release.test.mjs scripts/verify-artifact-local.test.mjs scripts/verify-local-ocr-resources.test.mjs`；新增能力缺失应失败。
- [x] **Step 3：实现两种独立构建。** `build:local` 定义为 `tsc -b && vite build --mode personal --outDir dist-local`；`desktop:build:local` 顺序调用本地构建、两项本地检查、`electron-builder --config electron-builder.local.cjs --win portable --x64`。本地配置输出 `release-local`，应用 ID 不变；EXE 文件名带版本和本次构建标识，不覆盖旧唯一副本。公开检查不能通过忽略私有素材哈希来“修复”。
- [x] **Step 4：自动验收。** 执行全部 `npm test`、`npm run test:electron`、`npm run lint`、`npm run build`、`npm run verify:artifact-release`、`npm run test:ui`、`npm run test:ocr-real`、`npm run desktop:build:local` 和 `npm run desktop:build`；根目录另跑新增字典/OCR资源/发布检查脚本的 Node 测试。逐条记录退出码和结果，任何强制项失败不能写“全部完成”。
- [ ] **Step 5：实际 Windows 验收。** 1440×920、980×680及125%/150%缩放下检查无遮挡、五部位原图不变形；断网完成手动保存、重开、JSON导出恢复、截图/实时OCR，记录OCR是否有外网请求。已有非空及空库分别升级/重开，不变更用户配置目录。经用户主动提供 UID 才联网实测；错误/取消不修改库存。回收站恢复、角色头像、强化队列、旧编辑和 JSON 恢复各测一次。
- [x] **Step 6：交付检查点。** 记录本地 EXE 完整路径、版本、哈希、已通过项目、未验证项目和恢复步骤；公开包只标作素材隔离验收，不擅自上传或发布。当前版本不能通过真实OCR或UID实测时，交付已完成部分并明确缺口，不把模拟测试算成实测。

## 5. 后续所需用户资料和完成定义

实施开始不要求提供密码、登录或账号凭据。到 R2 真实验收时需要至少10张中文详情原图、覆盖五部位，并重新提供此前问题图；现有历史路径不可读取，不能以复制出来的 OCR 文本代替图片。到 UID 实测时需要用户主动提供一个公开展柜 UID；不从旧截图提取 UID 去查询。

计划勾选只代表该项有证据通过，不能以进度百分比代替验收。全部完成要求 W/U/R/P 每项通过；真实样本或 UID 缺失时标为“待实测”，而非“开发完成”。不提前承诺日期：先测基线和真实OCR，再根据实际结果更新剩余工作。

## 6. 计划自审记录

设计第1～3、5节对应 W1～W4，第6节对应 U1～U3，第4节对应 R1～R3，第7～8节和构建隔离对应 P1。跨包类型、存储键、数值单位、图片所有权及串行写入均固定；五项高风险都有对应测试。本文与三份子计划一同构成实施计划；本轮仅写计划、更新设计确认状态，未实现产品功能。
