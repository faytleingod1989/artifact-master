# 连续录入与角色潜力评估 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** F8连续保存独立截图，后台顺序OCR；库存详情按指定角色/玩法显示当前单件分与合法+20理论范围。

**Architecture:** 两个独立子项目共用现有数据和评分接口，不相互依赖。先完成采集队列，再完成角色潜力；合并后只交付一份通过本地包验收的新版本。

**Tech Stack:** Electron 43、React 19、TypeScript 6、Vite 8、Vitest、Playwright；现有本地PP-OCRv5，不添加运行时依赖。

**Spec:** `docs/superpowers/specs/2026-10-18-async-capture-role-potential-design.md`（已由用户确认）。

## Global Constraints

- 沿用现有本地Windows程序、PP-OCRv5引擎、五星圣遗物规则和121位角色档案。
- 不读取游戏装备，不自动穿戴、强化或入库；不改变库存和备份格式。
- 固定图片仅保存在内存；单张编码图片上限16MiB，批次持有的编码源图片总量上限128MiB。
- 每批最多保留20个未处理完的任务，合计正在取帧、排队、识别中、失败待处理及成功待确认。
- 潜力是理论极值，不是期望、置信区间或升级保证；单件适配分不是实战DPS。
- 不扩大权限，不新增云端OCR、账号接口、遥测或后台上传；不改变个人/公开素材隔离。
- 当前工作区不是Git仓库：不初始化、不创建工作树、不执行提交；每任务用测试结果和文件清单留痕。源码/文档用apply_patch修改。
- 所有自动验收使用隔离数据；不关闭用户程序，不改真实库存，不删截图，不自动提权或关机。

## Review Focus

1. 同时出现截图完成与旧OCR结果：任务身份、预览和声音不能错配（子计划A任务A1/A3）。
2. 只有排队/失败、尚无成功草稿就关闭：必须确认并释放资源（A2/A3）。
3. 显示相同数值但底层累计/初始条数不同：覆盖全部合法历史，不把舍入值视为真实档位（B1/B2）。
4. 快速切角色/藏品并删除当前藏品：旧worker结果不得闪回，也不能改变库存（B4）。
5. 开发服务器通过但实际离线包worker或模型加载失败：必须检验实际ASAR、背景声音和零联网（集成任务I1）。

## 子项目与执行顺序

1. [A：独立取帧与OCR队列](2026-10-18-capture-queue.md)，A1 → A2 → A3。可单独验收交付连续录入，不依赖评分改动。
2. [B：角色单件适配与强化潜力](2026-10-18-role-potential.md)，B1 → B2；B3可独立于B1/B2；最后B4集成。可单独验收详情评估，不依赖实时录入。
3. I1：完整回归、实际本地包验收、启动器切换与交付。

推荐当前会话直接实施：队列生命周期和潜力评分分别有紧密接口，单一实施者便于保持一致；完成后安排独立审查。若用户选择子代理逐任务实施，再按对应技能执行，不复用历史失效模型名。

## 集成任务 I1：回归和离线交付

**Files:**
- Modify: `apps/web/tests/electron-offline-smoke.mjs`、`apps/web/electron-builder.local.cjs`。
- Modify after package passes: `启动圣遗物管理大师.cmd`、`启动圣遗物管理大师.vbs`、`本地版使用说明.md`。
- Create: `docs/连续录入与角色潜力-20261018-验收.md`。
- Modify package-name fixture with launcher: `scripts/verify-personal-launcher.test.mjs`；保留“拒绝旧包/公开包”的安全断言，不把它放宽为选任意最新EXE。
- Existing gates: 素材/原生OCR校验脚本；不得为了让测试绿而放宽安全断言。

**Interfaces:** 消费A的任务队列UI和B的详情UI；产出新个人便携包、SHA256、验收记录和指向该包的现有启动入口。

- [ ] Step 1：先扩展实际包测试并确认旧包失败。增加隔离库存样本；详情能搜索121角色并切换玩法、满级收敛、非满级显示区间、非法旧记录“需核实”；在`file:`入口运行真实潜力worker，页面无异常。采集测试用受控A/B/C图片和被延迟的OCR验证队列，再另跑原生真实图OCR，明确模拟与真实测试的边界。
- [ ] Step 2：在`apps/web`执行`npm test`、`npx tsc -b`、`npm run lint`、`npm run test:electron`、`npm run test:ui`；在根目录执行`node --test scripts/*.test.mjs`。要求全部通过，无新增跳过；记录实际数量，不沿用旧289/27等计数。
- [ ] Step 3：在`apps/web`执行`npm run build`与`npm run verify:artifact-release`，再执行`npm run desktop:build:local`。包名改为`ArtifactMaster-${version}-capture-potential-20261018-local.${ext}`，避免覆盖现有可用包。个人头像仍不得进入公开产物。
- [ ] Step 4：执行`npm run test:desktop-offline`，检验新ASAR而非旧dist：worker启动、实际原生OCR、真实F8注册/释放、后台捕获/成功双音、队列等待、隔离库存确认/重启/备份与损坏备份拒绝。拦截并断言0外部请求；记录20任务及连续切换时内存峰值、计算耗时和取帧/OCR分项。128MiB仅是编码源帧预算，不是进程内存承诺。
- [ ] Step 5：仅在Step 2—4通过后，通过apply_patch将根启动器指向新包；执行`node --test scripts/verify-personal-launcher.test.mjs`并按其既有dry-run方式核对真实解析路径。记录新包绝对路径、大小和SHA256。
- [ ] Step 6：按用户此前“只保留最新版”的授权，先枚举`apps/web/release-local`根目录的旧个人便携EXE，逐个确认确属本项目、不是新包且未被占用，再送入回收站；不删win-unpacked、模型资源、公开包或工作区其他EXE。占用则保留并告知，不终止进程。记录可恢复的回收目标。
- [ ] Step 7：更新说明与验收文档，给出已完成/未验证项目和限制；任何实际游戏前台无法自动验证的步骤单列，不用模拟结果代替。无Git提交。

## 审阅状态

- [x] 已核对书面规格、现有采集/评分/角色类型和测试命令。
- [x] 已拆分两个独立可验收子项目，明确接口、资源上限、失败和结束行为。
- [x] 已自查规格覆盖、步骤、跨任务类型、Review Focus和计划长度。
- [x] 用户审阅实施计划，并选择直接实施。
- [x] 实施核心功能、测试、独立只读审查、打包和新启动器验证。完整证据与两个Minor见`docs/连续录入与角色潜力-20261018-验收.md`，逐任务执行记录在本计划专属账本。
- [x] 旧`all-characters`EXE回收：最初运行中时保留；最终复查进程退出后，验证路径、已知哈希、新包哈希及独占锁，已送入回收站。未终止用户进程，发布根目录只保留最新个人便携包。
