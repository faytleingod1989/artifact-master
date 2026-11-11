# 待激活副词条与实时录入成功提示音 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 正常接收截图中的三条生效副词条和一条待激活副词条，并在成功加入实时录入待确认列表时播放简短提示音。

**Architecture:** 待激活属性使用独立的可选字段，不混入现有 `subs`，避免评分和配装把未生效属性算进去。采集控制器只在有效结果实际加入列表后发出成功事件，由界面管理可静音的本地提示音；播放失败不影响识别或草稿。

**Tech Stack:** TypeScript、React、Web Audio、Vitest、Playwright、Electron；继续使用现有本地 PP-OCRv5，不新增在线服务。

**Spec:** 本文的“确认范围”；依据用户本轮两条消息及截图 `codex-clipboard-2df7e936-c864-4cbb-ad1f-6b65b1987832.png`。

## 确认范围

- 目标样例：+0 生之花，主词条生命值717；生效副词条暴击率3.1%、攻击力19、暴击伤害5.4%；生命值4.1%为待激活。
- 识别正常的中文/英文括号“待激活”尾注；允许截图原文缺少右括号，不改写任何数字，不放宽数值精度检查。
- 待激活词条在确认、编辑、库存详情中明确显示“待激活”；本地保存、备份及恢复后保留。旧记录没有该字段仍可读取。
- 对待激活数据继续检查类型、数值精度、重复属性和结构；不以待激活词条代替缺失的生效词条，不自动激活或凭空推测数值。
- 成功提示音默认开启，可关闭并记住选择；仅表示“识别通过并已加入待确认”，不表示已经入库。
- 失败、补采中、被自动去重跳过、批次已满、停止后的迟到结果、丢弃草稿均不播放成功音。手动重复采集若确实新增了一条待确认草稿，仍播放一次。
- 提示音短且音量适中，切回游戏后也能播放；不弹窗、不抢焦点、不使用联网音频。静音或音频设备故障不影响采集。

## Global Constraints

- 只收入五星圣遗物。
- 未经用户确认不入库，不改动真实用户库存用于测试。
- 保留当前 OCR 引擎和已有截图；新版验收后，按用户后续要求将旧发布包移入回收站。
- 不新增手动裁剪要求，不把待激活属性计入当前评分和配装属性。
- 工作目录没有 Git 仓库；修改前保存相关文件快照，不初始化仓库、不创建提交。
- 本轮没有关机操作。

## Review Focus

- 待激活尾注缺失右括号仍正确分离；`4.19%` 等异常数值仍拒绝。
- 待激活属性不能凑足生效副词条数量；与主词条或已有副词条重复时仍拒绝。
- 备份往返、编辑保存不丢失待激活状态；旧备份无新增字段继续兼容。
- 游戏在前台时播放不依赖界面重新获得焦点；音频必须在点击启动时提前准备。
- 关闭采集或组件卸载后不迟到播放；播放异常不能把成功草稿变成失败或导致重复采集。

### Task 1: 待激活属性贯穿解析、草稿和保存展示

**Files:**
- Modify: `apps/web/src/artifacts/{artifactOcr.ts,artifactDraft.ts,types.ts}`
- Modify: `apps/web/src/imports/{manualDraft.ts,recognitionCheck.ts,ImportReview.tsx,ManualEntry.tsx}`
- Modify: `apps/web/src/storage/libraryValidation.ts` 和实际展示副词条的库存详情组件。
- Test: 对应现有解析、校验、导入、存储、展示测试文件；评分测试补充未生效属性不参与计算。

**Interfaces:**
- Produces: `ParsedArtifactOcr.pendingSubs?: string[]`、`ArtifactDraft.pendingSubs?: StatValue[]`、`ArtifactRecord.pendingSubs?: string[]`；`subs` 的含义仍为当前生效副词条。
- Consumes: 原有 `parseStat`、`formatStat`、`validateDraft` 和库存备份接口。

- [ ] **Step 1:** 保存相关源文件快照；先增加用户截图原文回归测试，断言 `subs` 仅三条、`pendingSubs` 为生命值4.1%，识别通过；补充括号变体、精度异常、冲突、缺失生效词条、旧备份和往返保存测试。
- [ ] **Step 2:** 运行 `npm test -- src/artifacts/artifactOcr.test.ts src/artifacts/artifactDraft.test.ts src/imports/recognitionCheck.test.ts src/storage/libraryValidation.test.ts`；记录因尚无待激活支持而失败的断言。存储测试若现有文件名不同，采用实际现有文件。
- [ ] **Step 3:** 实现尾注分离和独立字段转换；保留非法原文对应的校验错误，不截断或四舍五入数字。校验待激活状态与当前三词条低等级结构一致，沿用现有高等级四条生效词条完整性要求。
- [ ] **Step 4:** 在确认摘要、编辑及库存详情显示待激活状态；保存和备份保留字段；评分、配装仍仅消费 `subs`。编辑状态不能悄悄提升为生效属性。
- [ ] **Step 5:** 重跑上述测试及新增展示、评分、存储往返测试，全部通过后再做 Task 2。

### Task 2: 实时采集成功音与静音开关

**Files:**
- Modify: `apps/web/src/capture/{captureController.ts,RealtimeCapturePanel.tsx}`
- Create: `apps/web/src/capture/captureSuccessSound.ts`
- Test: `apps/web/src/capture/{captureController.test.ts,RealtimeCapturePanel.test.tsx,captureSuccessSound.test.ts}`
- Test: `apps/web/tests/native-ocr.spec.ts` 或专门的实时采集音频集成测试。

**Interfaces:**
- Produces: `CaptureControllerOptions.onAccepted?: () => void`，只在一件草稿实际加入列表后调用一次。
- Produces: `createCaptureSuccessSound()` 返回 `prepare(): Promise<void>`、`play(): Promise<void>`、`dispose(): Promise<void>`，负责一个受控音频上下文及短提示音。
- Consumes: Task 1 后的识别校验；界面本地音效偏好默认开启。

- [ ] **Step 1:** 先写失败测试：成功新增触发一次；自动跳过、失败、满批、补采中、丢弃、停止后迟到不触发；补采最终成功只触发一次；音频失败草稿仍保留。界面测试覆盖静音记忆与启动点击时提前准备音频。
- [ ] **Step 2:** 运行 `npm test -- src/capture`，确认测试因缺少成功事件和音频行为失败。
- [ ] **Step 3:** 控制器在加入列表后发成功事件；界面仅在开启音效且会话有效时播放，隔离音频错误。使用本地产生的约0.2秒柔和提示音，不下载素材；启动按钮点击时准备音频，关闭时释放资源。
- [ ] **Step 4:** 运行采集测试，覆盖静音、音频设备失败、停止和重启竞态；在真实浏览器中验证音频上下文已运行且合成的音频确实含非零信号，而不是只断言 mock 被调用。
- [ ] **Step 5:** 新增浏览器失焦集成测试确认仍产生成功音；无法替用户验证实际扬声器或原神前台听感时，在交付中明确说明，不宣称已实测。

### Task 3: 完整验证与新版交付

**Files:**
- Modify: 本地构建产物名称配置、根目录启动器和 `本地版使用说明.md`（验证通过后才切换启动目标）。
- Create: 本轮验收记录；新版通过后按用户后续要求清理旧发布 EXE。

- [ ] **Step 1:** 运行完整 `npm test`、`npm run lint`、`npx tsc -b`、`npm run test:electron` 和 `npm run test:ui`，记录通过数量及任何失败。
- [ ] **Step 2:** 构建具有独立名称的本地 Windows 可执行文件；运行离线桌面验收，用隔离资料目录验证待激活草稿、保存恢复及音效开关；不修改真实库存。
- [ ] **Step 3:** 通过后更新根目录启动器并验证目标存在；交付新程序路径、已验证内容及仍需实际游戏/音频设备确认的事项。

## 自检与执行方式

两个功能分别测试后集成；无需更换引擎、联网服务或重新设计页面。由当前模型直接执行，不新建实现子代理。用户已确认，2026-10-17完成并交付；验收记录位于 `docs/ocr/2026-10-17-待激活与成功提示音验收.md`。用户后续要求清理旧版本，覆盖上文保留旧EXE的约束：新版验证通过后旧发布包已移入回收站。
