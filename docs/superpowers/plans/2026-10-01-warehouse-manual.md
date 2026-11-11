# 仓库与便捷手动录入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付保留旧库的原图双视图仓库、真实筛选/对比及统一手动入库流程。

**Architecture:** 先建立兼容旧字符串记录的结构化词条/草稿边界，再从 `App.tsx` 拆出仓库和录入组件。不更换数据库，不全面重写配装算法；本包完成后无需 UID 服务即可独立使用。

**Tech Stack:** 沿用 React 19、TypeScript 6、Vite 8、idb-keyval、Vitest/Testing Library；新增 Playwright 仅用于布局验收。

**Spec:** [已确认设计](../specs/2026-10-01-warehouse-input-redesign-design.md)；[总计划与共享接口](2026-10-01-warehouse-input-redesign.md)。路径/命令/检查点规则及共享类型按总计划执行。

## Global Constraints

- 个人本地 Windows 使用，只收入五星圣遗物；原有本地数据和 JSON 备份继续可用，不为改版清空仓库。
- 所有界面共用 `ArtifactGlyph` 和“套装 + 部位”映射；图片等比缩放、居中、完整显示，使用 `object-fit: contain`。
- 等级为 0～20 整数，至多四条副词条且类型不重复；副词条类型不能与主词条相同。
- 双暴仅计算副词条：`2 × 暴击率 + 暴击伤害`；百分比差值以“百分点”表达；+20 显示“已满级”。
- 不新增 GOOD；旧数据不静默更名或删除；确认取消不写入；主入口是实时采集和手动录入，UID 新增，截图次级保留。
- 当前无 Git：每个任务结束写验收记录和可恢复检查点，不擅自初始化或提交。

## Review Focus

- 已保存 `[]`、存储读取失败和晚到读取结果：空库不变演示库、失败不写回、加载完成前不能入库；W1。
- 同毫秒20件、非法数字、旧未知词条：ID唯一，非法新草稿禁存，旧记录保留并提示；W1。
- 非正方原图、缺图和窄列表：比例不变，缺图不冒充，无弹性压扁；W2/W3。
- 筛选清空选中项、切视图、多选和跨部位：状态一致、空态无假详情、禁止直接跨部位替换比较；W3。
- 双击保存、重复实物、取消、连续录入：一次写入、重复由用户选择、数值不串到下一件；W4。

---

## 文件分工与任务

### Task W1：词条、草稿、权威目录和存储兼容

**Files:** Create `apps/web/src/artifacts/statModel.ts`、`apps/web/src/artifacts/artifactDraft.ts`、`apps/web/src/artifacts/gameData.ts`、`apps/web/src/artifacts/gameData.snapshot.json`、`apps/web/src/storage/libraryRepository.ts`、`scripts/build-artifact-game-data.mjs`；对应新测试 `apps/web/src/artifacts/statModel.test.ts`、`apps/web/src/artifacts/artifactDraft.test.ts`、`apps/web/src/storage/libraryRepository.test.ts`、`scripts/build-artifact-game-data.test.mjs`。Modify `apps/web/src/artifacts/types.ts`、`apps/web/src/artifacts/migrateArtifactData.ts`、`apps/web/src/App.tsx`、`apps/web/src/App.test.tsx`。

**Interfaces:** Produces 总计划全部词条/草稿接口，`artifactDraft.ts` 的 `allocateLocalId(existingIds:number[],now?:number):number`；`libraryRepository.ts` 的 `LibraryState={artifacts:ArtifactRecord[];trash:ArtifactRecord[];queueIds:number[]}`、`loadLibrary():Promise<LibraryState>`、`saveLibrary(next:LibraryState):Promise<void>`。`gameData.ts` 导出 `getPieceName(setKey:ArtifactSetKey,slot:ArtifactSlot):string|null` 及 `GAME_DATA`：`{version:string;sourceCommit:string;sourceHashes:Record<string,string>;setHashes:Record<string,ArtifactSetKey>;pieceHashes:Record<string,{setKey:ArtifactSetKey;slot:ArtifactSlot;name:string}>;characters:Record<string,{name:string}>;mainGrowth:Partial<Record<StatKey,number[]>>;subBounds:Partial<Record<StatKey,{min:number;max:number}>>}`。

- [x] **Step 1：写失败测试。** `emptyLibraryStaysEmpty/readFailureDoesNotSave/twentyIdsInOneMillisecond/invalidDraftBlocked/legacyRecordNotRenamed` 固定断言 `expect(reloaded.artifacts).toEqual([])`、`expect(saveSpy).not.toHaveBeenCalled()`、`expect(new Set(ids).size).toBe(20)`；非法等级21/NaN/Infinity、超过四副、重复副类型、主副同类型、治疗副词条、花暴伤主词条、成长值不符都返回 `error`，旧 ID/名称/main/subs 原样保留。`critValueUsesOnlySubs` 使用主暴伤62.2、副暴击3.9时 `expect(cv).toBeCloseTo(7.8)`；目录测试 `expect(mappedPieces).toHaveLength(220)`。加载未结束时保存按钮禁用；组件卸载后迟到读取不触发save；回收站保留ID不被重新分配。
- [x] **Step 2：跑红灯。** `npm test -- src/artifacts/statModel.test.ts src/artifacts/artifactDraft.test.ts src/storage/libraryRepository.test.ts src/App.test.tsx`；根目录 `node --test scripts/build-artifact-game-data.test.mjs`。新模块/行为缺失应失败。
- [x] **Step 3：实现词条和字典接口。** 从已在本地的 `_audit_AnimeGameData/ExcelBinOutput/{ReliquaryExcelConfigData,ReliquarySetExcelConfigData,ReliquaryLevelExcelConfigData,ReliquaryMainPropExcelConfigData,ReliquaryAffixExcelConfigData,AvatarExcelConfigData}.json` 与 `TextMap/TextMapCHS.json` 生成小型版本化快照；记录源提交、源日期与文件哈希。快照包含套装 hash→现有 setKey、单件 hash→setKey/slot/name、角色 ID→名称、五星主词条0～20级成长及副词条边界；不把整个审计目录打包。单件名无可靠匹配时 `getPieceName` 返回 null，展示“套装·部位”。主词条按游戏显示精度比较成长表，异常显示错误，不自动修值；副词条检查有限值与合法范围，不假称仅凭显示值能验证所有强化历史。
- [x] **Step 4：实现草稿和存储接口。** 草稿转换无副作用，非法 `draftToRecord` 抛明确校验错误；ID 基于当前有效安全整数最大值及时间递增分配，含仓库和回收站，更新只用明确 targetId。保留 `artifact-master:artifacts/trash/queue` 键，`setMany` 一次事务保存三项。缺失存储初始化空库，演示内容不写入真实库存；读取失败进入可重试错误态，不启动自动保存。写入串行、失败不显示成功；解析不出的旧词条保持原记录并标明待修正。JSON version1仍可导出/读取，接受空库备份；恢复整库须保留明确危险确认，不能冒充新增合并。
- [x] **Step 5：绿灯和检查点。** 重跑 Step2 并 `npm run build`；补测 `saveLibrary` 事务失败保持上一份库、队列/回收站/角色头像兼容。记录结果与源码快照；不对用户现有库存执行测试清空。

### Task W2：原图等比与私有本地模式

**Files:** Modify `apps/web/src/assets/artifacts/manifest.ts`、`apps/web/src/components/ArtifactGlyph.tsx`、`apps/web/src/components/ArtifactGlyph.test.tsx`、`apps/web/src/assets/artifacts/manifest.production.test.ts`、`apps/web/src/App.css`、`scripts/verify-artifact-release.mjs`、`scripts/verify-artifact-release.test.mjs`。Create `apps/web/src/warehouse/warehouse.css`。

**Interfaces:** Consumes 现有 `resolveArtwork` 和 `ArtifactGlyph` 属性，保留调用方式；Produces `DEV/personal` 可加载 originals、默认生产不加载的映射和 `.artifact-glyph` 等比规则；P1 使用 `--mode personal`。

- [x] **Step 1：写失败测试。** `localModeHasAllFiveSlots/publicModeHasNoPrivateArtwork/failedImageShowsMissing`：本地每套五部位可解析，生产私有映射为空，失效图片显示明确缺图而不换别套图。Node发布检查的泄漏样本必须 `assert.throws(() => verifyRelease(leakFixture))`，正常公开样本通过。
- [x] **Step 2：跑红灯。** `npm test -- src/components/ArtifactGlyph.test.tsx src/assets/artifacts/manifest.production.test.ts`；根目录 `node --test scripts/verify-artifact-release.test.mjs`。
- [x] **Step 3：实现模式和样式。** 仅 `import.meta.env.DEV || import.meta.env.MODE === 'personal'` 引用私有映射；公开构建不导入，不能靠隐藏图片完成隔离。所有大小共用 `object-fit:contain`、居中、固定容器、不对图片变换/滤色；列表容器 `flex-shrink:0`。发布检查如需适配模式表达式，仅改识别表达式，不改变私有哈希/路径拒绝规则。
- [x] **Step 4：绿灯和检查点。** 重跑 Step2，`npm run build`、`npm run verify:artifact-release`；W3 的浏览器测试负责真实非正方渲染比例，不能用 jsdom 属性断言替代。记录当前220幅覆盖与未知套装缺图行为。

### Task W3：融合仓库、双视图、筛选和对比

**Files:** Create `apps/web/src/warehouse/{Warehouse,WarehouseFilters,ArtifactList,ArtifactGrid,ArtifactDetails,ArtifactCompare}.tsx`、`warehouseModel.ts`、`warehouseModel.test.ts`、`Warehouse.test.tsx`、`apps/web/tests/warehouse.spec.ts`、`apps/web/playwright.config.ts`。Modify `apps/web/src/App.tsx`、`App.css`、`mobile.css`、`scoring.ts`、`apps/web/package.json`、`apps/web/package-lock.json`；Create `apps/web/src/scoring.test.ts`。

**Interfaces:** Consumes W1 的 `ArtifactRecord`、词条及 CV。Produces `WarehouseProps={records:ArtifactRecord[];scope:'all'|'character';characterName?:string;onScopeChange:(scope:'all'|'character')=>void;onEdit:(id:number)=>void;onCopy:(id:number)=>void;onToggleLock:(id:number)=>void;onBulkTrash:(ids:number[])=>void;onQueue:(ids:number[])=>void}`；`Warehouse(props:WarehouseProps)`；`WarehouseFilters={search:string;setKey:ArtifactSetKey|'all';slot:ArtifactSlot|'all';main:StatKey|'all';minLevel:number;maxLevel:number;locked:'all'|'locked'|'unlocked'}`；`filterAndSort(records:ArtifactRecord[],filters:WarehouseFilters,sort:'level'|'cv'|'recharge'):ArtifactRecord[]`；`compareArtifacts(left:ArtifactRecord,right:ArtifactRecord):{comparable:boolean;reason?:string;rows:{label:string;left:string;right:string;delta:string|null}[]}`。

- [x] **Step 1：写失败测试。** `togglePreservesSelectionAndFilters/emptyResultClearsDetails/mainLevelLockFilters/crossSlotNotComparable/maxLevelNotWorthStrengthening`：切换后搜索/筛选/排序/多选不变、零结果无旧详情、各筛选确实影响结果、跨部位 `expect(result.comparable).toBe(false)`、同部位百分比差文案含“百分点”、+20不含“值得强化”。浏览器用五部位和非正方测试图验证 `objectFit==='contain'`、容器不被挤压、完整图片可见；同时检查980×680主要操作位于视口内。
- [x] **Step 2：跑红灯。** `npm test -- src/warehouse/warehouseModel.test.ts src/warehouse/Warehouse.test.tsx src/scoring.test.ts`。新增 `test:ui` 为 `playwright test -c playwright.config.ts`，本地测试服务只绑定127.0.0.1；运行后新布局断言应失败。
- [x] **Step 3：实现仓库组件和模型。** 顶部导航/左筛选/中间双视图/右详情对比/底部多选；图标卡片和列表显示设计要求的主副词条、等级、锁与选择。等级/CV/充能默认降序，同值按ID稳定排列，不能修改传入数组；旧异常词条显示待核实，不造数值。文字≥14px；视图键 `artifact-master:warehouse-view-v1` 与库存分离，异常偏好退回图标视图。没有可见选中项则清空详情；多选保留但提示隐藏数量，批量操作显示总选中数量与确认，不暗中操作未选项目。
- [x] **Step 4：接回现有功能。** 工具栏放实时、手动、UID入口；截图放“更多录入”，JSON放仓库菜单。“全部库存/按角色查看”切换由App提供scope及现有角色规则结果，角色视图明确“规则初评”，不改写库存或承诺最优。保留原角色/队列/回收站入口，删除统一“攻击力提高18%”伪套装效果；满级判断修改 `scoreReason` 而不重写评分。比较不作必然优劣判断、不改变游戏装备。
- [x] **Step 5：绿灯和检查点。** 重跑两类测试及 `npm run lint`/`npm run build`；人工对照批准概念图并检查1440×920、980×680布局，记录图标、详情、列表和空态截图。主操作有遮挡则本任务不通过。

### Task W4：手动表单与统一确认入库

**Files:** Create `apps/web/src/imports/{ManualEntry,ImportReview}.tsx`、`manualDraft.ts`、`manualDraft.test.ts`、`ManualEntry.test.tsx`、`ImportReview.test.tsx`、`imports.css`。Modify `apps/web/src/App.tsx`、`App.test.tsx`，用共享表单接替自由文本手动/编辑及旧 OCR 保存路径。

**Interfaces:** Consumes W1/W3；Produces 总计划 `DraftReviewItem/ImportReviewProps` 和 `ImportReview(props:ImportReviewProps)`；`ManualEntryProps={initial?:ArtifactDraft;onReview:(draft:ArtifactDraft,continueEntry:boolean)=>void;onCancel:()=>void}`、`ManualEntry(props:ManualEntryProps)`、`createManualDraft(setKey?:ArtifactSetKey,slot?:ArtifactSlot):ArtifactDraft`。连续保存成功后调用新草稿工厂，只保留套装/部位，不保留数字/唯一ID。

- [x] **Step 1：写失败测试。** `flowerAndPlumeFixedMain/threeSubsAtLevelZeroAllowed/continueClearsNumbers/copyGetsNewIdentity/duplicateDefaultsToSkip/doubleConfirmWritesOnce/cancelDoesNotWrite`：花仅hpFlat、羽仅atkFlat；零级三副词条可确认；下一件 `expect(next.main).toBeUndefined()`、`expect(next.draftId).not.toBe(previous.draftId)`；复制不沿用实体ID；重复默认跳过、显式新增允许同词条第二件、更新必须选择现存targetId；双击只有一次 `saveLibrary`；取消无写入。
- [x] **Step 2：跑红灯。** `npm test -- src/imports/manualDraft.test.ts src/imports/ManualEntry.test.tsx src/imports/ImportReview.test.tsx src/App.test.tsx`。
- [x] **Step 3：实现便捷表单。** 可搜索套装、部位/等级、合法主词条下拉和成长表建议值、最多四行类型+数字；百分号由类型生成，已选副类型及主类型从其余副行排除。名称由核实目录生成，不要求用户编句子；Tab顺序、保存/保存并继续/复制草稿可用。编辑旧记录若有不可解析字段显示原文待修正，不偷偷删除；保存前走统一校验。
- [x] **Step 4：实现确认组件和接线。** 左原图/右可编辑字段，低置信度及异常高亮，原OCR折叠；无图手动草稿不显示假图片。支持跳过/新增/明确更新、默认疑似重复不选；必填错误禁存。确认按钮锁定至异步保存结束；保存失败保留草稿/预览并提示，成功显示数量。来源图片创建者按总计划生命周期释放；单张/批量截图暂沿用现有识别函数但改为草稿→确认，不得绕开校验或把截图图标写入权威素材。
- [x] **Step 5：绿灯和独立交付。** 重跑 Step2、`npm run test:ui`、`npm run lint`、`npm run build`；实际连续录入五部位、三/四副词条、非法值、取消、重复、新增及更新，重开仍可见。记录 W 包通过项后再进入 UID；W包可单独交付，尚不宣称实时OCR已改好。
