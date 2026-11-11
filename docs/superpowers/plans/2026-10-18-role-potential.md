# 角色单件适配与强化潜力 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对选中的五星圣遗物，用指定角色/玩法显示当前单件分和所有合法+20结果的最低—最高分。

**Architecture:** 独立强化规则快照、可还原的离散历史和精确有界DP；使用与现有scoreArtifact相同的贡献计算内核。在本地Web Worker中计算并有界缓存，UI独立保存比较角色，不改全局配装和库存。

**Tech Stack:** TypeScript、现有角色档案与评分内核、Vite模块Worker、React、Vitest/Playwright；无新增运行时依赖。

**Spec:** `docs/superpowers/specs/2026-10-18-async-capture-role-potential-design.md`，第5—8节。

## Global Constraints

- 只算五星，沿用121角色现有权重/玩法；不重新采集或改写角色攻略。
- 剩余节点`5 - floor(当前等级 / 4)`，三条的首次节点只激活第四条，不额外强化。
- 百分比原表小数转百分点，显示值和底层值区分；不得把STAT_ROLL_UNITS当真实档位。
- 覆盖全部合法历史和未知第四条；非法/无法还原显示“需核实”，不猜数入库。
- 区间是理论极值，不是期望/概率/DPS；+20合法成品区间收敛当前分。
- 不写ArtifactRecord.score或改变备份结构；不暗算4件套条件、不继承另一个角色外部属性。
- 无Git仓库，逐任务记录测试，不初始化/提交；遵循总计划全部约束。

## Review Focus

- 相同显示值的多种底层累计与强化历史全覆盖（B1/B2）。
- 已知待激活第四条与未知第四条不同，前者不再次随机（B2）。
- 暴率100%或充能目标附近、主词条满级变化：当前分和极值用同一内核（B2）。
- 同一角色2件/4件多方案与高命玩法：建议来源、玩法假设必须可见（B3/B4）。
- 快速切换或删除藏品后worker旧结果、worker离线加载失败（B4和总计划I1）。

## 公共接口与文件边界

- `potential/enhancementRules.ts`：离线数据与整数累计/显示规则。
- `potential/rollHistory.ts`：将当前记录还原所有合法属性累计值和每条roll次数，不依赖UI。
- `potential/scorePotential.ts`：合法未来结果DP和评分极值，不读写库存。
- `characters/artifactFit.ts`：从已有档案构造推荐角色/玩法，不计算121份潜力。
- `potential/potentialClient.ts`与`potential.worker.ts`：任务隔离、取消、缓存与worker生命周期。
- `warehouse/ArtifactRoleEvaluation.tsx`：选择控件、假设和派生结果；比较上下文由Warehouse保存。

共享输入类型：`PotentialInput = { record: ArtifactRecord; characterName: string; options: ScoringOptions }`。
共享结果：`PotentialResult = { status: 'ready'; current: number; min: number; max: number; remainingEvents: number; fourth: 'known' | 'unknown' | 'none'; maxed: boolean; ruleVersion: string } | { status: 'needs-verification'; reasons: string[] }`。
禁止以当前分0掩盖非法数据。用户未选择已知角色时显示“请选择评估角色”，不暗用通用权重计算建议。

### Task B1：真实档位、显示规则与可行历史

**Files:**
- Create: `scripts/build-enhancement-rules.mjs`、`scripts/build-enhancement-rules.test.mjs`。
- Create: `apps/web/src/potential/enhancementRules.snapshot.json`、`enhancementRules.ts`、`rollHistory.ts`、`rollHistory.test.ts`（后四项均在`apps/web/src/potential/`）。
- Existing sources read-only: `_audit_AnimeGameData/ExcelBinOutput/ReliquaryAffixExcelConfigData.json`、`ReliquaryExcelConfigData.json`，现有`gameData.snapshot.json`溯源和`statDefinitions.json`。

**Interfaces:**
- `buildEnhancementRules({ affixes, pieces, definitions, sourceCommit, sourceHashes }): EnhancementRulesSnapshot`纯函数可用小fixture测试；CLI使用固定本地源，输出snapshot，不联网。
- Snapshot包含`version`、sourceCommit/哈希、`events: [4,8,12,16,20]`、`tiers: Partial<Record<StatKey, readonly number[]>>`。整数单位统一为百分点/绝对值的1/10000，避免浮点累计；显示百分比一位小数、平值整数，只在显示边界舍入。
- `getRollHistories(record: ArtifactRecord): HistoryResult`；`HistoryResult = { status: 'ready'; histories: readonly RollHistory[] } | { status: 'needs-verification'; reasons: string[] }`；`RollHistory`包含`initialCount: 3|4; mainKey: StatKey; active: readonly { key: StatKey; units: number; rolls: number }[]; pending?: { key: StatKey; units: number }`。

- [ ] Step 1：写生成器红测试，501恰好10属性各4档；排除其他仓库。断言ER原表0.0648→6.48百分点→64800整数单位→显示6.5%；HP最低209.13→2091300→显示209。内部等级[5,9,13,17,21]转换为[4,8,12,16,20]，任一源缺失/档位不足/内部节点不符明确失败。
- [ ] Step 2：根目录执行`node --test scripts/build-enhancement-rules.test.mjs`确认红；实现独立生成器而非修改现有目录生成器的46套/230部位覆盖门槛。CLI先校验两份本地原表哈希与既有来源记录；生成物通过apply_patch落盘，内容可复现，不借生成过程改圣遗物名称或目录。
- [ ] Step 3：写历史红测试：合法+0三/四条、+3三条、+4四条、+17、+20；小fixture构造“两个累计值显示相同”的历史，断言均保留；总roll数分别为4+floor(level/4)或3+floor(level/4)，其中初始三条在首节点新增一条。pending仅3active且level<4，固定显示约束，不能同主词条或active重复。
- [ ] Step 4：`npm test -- src/potential/rollHistory.test.ts`（cwd `apps/web`）确认红；实现每属性1—6次roll的整数累计集合与显示反推，再按当前总次数合并历史。校验等级/主词条成长、active条数、重复、非法或不可能总次数；三条但level>=4、pending缺值或非法都needs-verification。不修改record对象。
- [ ] Step 5：重跑生成器和历史测试全绿；deepFreeze输入验证无改写。用真实原图已核对样本辅助核对显示规则，不从OCR错值反向强制建立历史。记录快照哈希和测试，无Git提交。

### Task B2：共用评分贡献内核与精确极值

**Files:**
- Modify: `apps/web/src/scoring.ts`。
- Create: `apps/web/src/potential/scorePotential.ts`、`scorePotential.test.ts`、`potentialTypes.ts`。
- Test: `apps/web/src/scoring.test.ts`。

**Interfaces:**
- Consume B1的`getRollHistories`与整数tiers；导出`calculatePotential(input: PotentialInput): PotentialResult`。
- 从scoring提取单件可分解贡献接口：`createSingleArtifactScorer(record: ScoringArtifact, name: string, context?: ScoreContext): { main: number; sub: (stat: StatValue) => number; finish: (sum: number) => number }`。main/sub均未最终舍入，finish统一封顶100并舍入一位；sub共享现有权重、主词条优先分配后的暴击剩余和充能递减，不复制一套权重表。scoreArtifact及整套evaluate保持同一基础贡献计算；保留原usable校验和原整套指标行为。
- 暴率/充能当前角色假设使用显式options，单件默认`includeSetBonuses: false`。三/四条已生效属性才计当前分，pending单独进入未来合法集。

- [ ] Step 1：先写评分一致性红测试：独立贡献相加finish等于scoreArtifact，覆盖121角色全部build与合法花/沙/杯/冠、错主词条、暴率溢出、ER上下边界、心海-100暴率和零ER权重。保留原整套recommendBuild回归，不改变评分尺度。
- [ ] Step 2：`npm test -- src/scoring.test.ts`确认新接口测试红；提取公共贡献内核并重跑全绿，不在这个步骤顺带重设角色权重。若暴率/充能分配发现原算法缺陷，先加入具体失败回归再修，交付文档明确说明分数变化。
- [ ] Step 3：写潜力红测试：+20区间=current；三条+0剩5节点但仅4次强化、四条+0有5次强化、+3仍5节点、+4剩4、+17剩1；pending固定类型/值，未知第四枚举所有合法不重复/非主属性。任何不合法历史返回needs-verification。断言输入/原score字段不变。
- [ ] Step 4：写独立小规模穷举oracle（仅测试，不能调用生产DP、历史合并或贡献裁剪逻辑），用完整scoreArtifact给每个终局评分；对0—2剩余节点、三条激活、已知/未知第四、显示舍入多历史、暴击/ER边界，断言DP min/max与oracle严格相等。另用手算fixture约束节点预算，不只让两个算法共享同一错误。
- [ ] Step 5：`npm test -- src/potential/scorePotential.test.ts`确认红；实现按history/第四条候选构造最终主属性，再按属性建立“分配k次强化后的可达整数和”表，累加后按游戏显示舍入再算该条贡献。用总强化次数为容量的min/max背包合并四属性，覆盖全部分配，不枚举等价顺序、不用Monte Carlo。先验证贡献可分离；不可分离时保留必要共享状态，禁止错误剪枝。汇总所有合法历史极值，只在终局统一finish。
- [ ] Step 6：重跑潜力、历史、scoring测试全绿。满级结果仍先校验历史，非法满级不能假装收敛；无可达终局给needs-verification。保留未知第四说明、真实remainingEvents和规则版本，记录性能样本，无Git提交。

### Task B3：基于现有档案的角色/玩法推荐

**Files:**
- Create: `apps/web/src/characters/artifactFit.ts`、`artifactFit.test.ts`。
- Read-only: `apps/web/src/characters/profiles.ts`、`profileTypes.ts`与现有catalog。

**Interfaces:**
- `getArtifactFitOptions(record: ArtifactRecord, query?: string): { recommended: readonly ArtifactRoleFit[]; others: readonly ArtifactRoleFit[] }`。
- `ArtifactRoleFit = { characterId: string; characterName: string; suggestedBuildId: string; setFit?: 'preferred-four' | 'alternative-four' | 'two-piece'; mainMatches: boolean; label: string; condition?: string }`。
- 同角色仅一项，suggestedBuildId来自真实档案；无匹配时为既有首个build。推荐主词条匹配者，排序首选四件→替代四件→二件/过渡→同层当前分降序→角色既有顺序。主词条不匹配者列其他，仍可选并明确提示。查询在分组前过滤且两组去重后并集覆盖全部121。

- [ ] Step 1：写红测试：4件首选、替代、2+2、主词条不适合、同一角色多玩法、花/羽固定主词条、未知套装、未知/旧文本主属性、中文搜索和别名；未搜索时两组ID唯一、总数121，无套装推荐仍可选全部角色。suggestedBuildId确属该角色，不暗补不存在的C6玩法。
- [ ] Step 2：`npm test -- src/characters/artifactFit.test.ts`确认红；用现有setPlan.pieces/key/count和mainStats构建分组，角色建议不附加套装虚构分、不执行potential，不写档案或库存。
- [ ] Step 3：重跑全绿；遍历真实所有角色/build/setPlan验证返回引用合法、无重复且保留2件/4件和condition信息；记录测试，无Git提交。

### Task B4：详情比较上下文、后台计算和可访问选择

**Files:**
- Create: `apps/web/src/potential/potential.worker.ts`、`potentialClient.ts`、`potentialClient.test.ts`。
- Create: `apps/web/src/warehouse/ArtifactRoleEvaluation.tsx`、`ArtifactRoleEvaluation.test.tsx`。
- Modify: `apps/web/src/warehouse/ArtifactDetails.tsx`、`Warehouse.tsx`、`warehouseSession.ts`、`warehouse.css`（均在`apps/web/src/warehouse/`，只追加评估区域样式）。
- Test: `apps/web/src/warehouse/Warehouse.test.tsx`；Create `apps/web/tests/role-potential.spec.ts`。

**Interfaces:**
- `createPotentialClient(): { evaluate(input: PotentialInput, signal?: AbortSignal): Promise<PotentialResult>; dispose(): void }`，一个本地module worker处理当前选择；postMessage带requestId，回包也带requestId。新请求中止旧请求并按需terminate旧worker，确保CPU任务真正可停；dispose使所有未完成请求以AbortError结束。
- 最多64项LRU，key由完整record评分内容（含pending）、角色、build、全部ScoringOptions及ruleVersion构成，不仅用record.id；不缓存运行异常。模块Worker使用`new Worker(new URL('./potential.worker.ts', import.meta.url), { type: 'module' })`，不下载脚本、不fallback主线程暴算。
- WarehouseSession增加可选内存字段`evaluation?: { characterName: string; buildId: string }`。缺省跟随props角色/build；手选后切藏品保留，恢复跟随时清除；不保存到库存/备份。改角色重置前角色额外属性，跟随模式显示当前全局显式额外属性与武器假设。
- `ArtifactRoleEvaluation({ record, characterName, scoringOptions, comparison, onComparisonChange })`组合B2/B3，controlled comparison。展示玩法、武器/外部暴率和ER、当前分、+20区间、有效副词条、主词条匹配状态和理论极值说明。pending仅在未来显示。

- [ ] Step 1：写client红测试：不同record相同id不错误命中缓存、参数/规则版本变动重算、64项淘汰、取消/销毁reject、乱序回包不能覆盖请求、worker抛异常明确错误且不虚构结果。
- [ ] Step 2：写UI红测试：默认跟随，手选只改comparison、切record仍保留角色、恢复跟随、不同角色重置额外属性、选玩法同步分数；搜索和分组native select可键盘操作，玩法条件可见；未知角色/非法记录显示明确说明；+20满级收敛，非满级未知第四标注。
- [ ] Step 3：写快切红测试：A角色慢返回，B角色先展示，A结果不回闪；当前藏品被移除时取消；onEdit/onQueue等原动作仍指原record，选择比较角色不触发全局/库存回调。
- [ ] Step 4：`npm test -- src/potential/potentialClient.test.ts src/warehouse/ArtifactRoleEvaluation.test.tsx src/warehouse/Warehouse.test.tsx`确认红；实现worker协议/取消/LRU与面板。提取详情评估区不重构整页；样式保持现有图标contain比例，角色查询/两组select及玩法select有label、错误/计算中状态可读。
- [ ] Step 5：重跑Step 4全绿；实现Playwright流程并运行`npm run test:ui -- tests/role-potential.spec.ts`，以隔离样本验证攻击/生命/精通角色切换、条件说明、错误主词条、快速切换、列表/图标视图保留、库存和全局角色未改。监测worker运行期间UI心跳和F8事件仍响应，不用只mock结果的测试声称性能通过。
- [ ] Step 6：记录真实+0最宽未知第四、+17、+20样本计算耗时和连续切换峰值；不硬承诺设备毫秒数，卡顿则修复后再交付。文件协议worker必须在总计划I1实际包复测，无Git提交。
