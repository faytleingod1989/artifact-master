# UID 公开展柜导入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增加用户明确点击触发的 UID 公开角色展柜五星圣遗物导入，不上传库存或读取账号凭据。

**Architecture:** 主进程只请求固定 Enka HTTPS 接口；渲染侧纯转换器把装备转换成 W1 草稿，由 W4 统一确认入库。先用固定脱敏样本证明解析与失败行为，再用用户主动提供的 UID 桌面实测。

**Tech Stack:** Electron 43 原生 HTTPS/IPC、React/TypeScript、Node 内置测试、Vitest/Testing Library；无需额外 Enka SDK、公共代理或数据库服务。

**Spec:** [已确认设计](../specs/2026-10-01-warehouse-input-redesign-design.md)；[总计划与共享接口](2026-10-01-warehouse-input-redesign.md)；前置 W1/W4。

## Global Constraints

- 只解析 `avatarInfoList[*].equipList` 中 `flat.itemType === ITEM_RELIQUARY` 且 `flat.rankLevel === 5` 的装备。
- UID 接口只提供公开角色展柜，不是整个背包；不开机自动查、不在输入时查询、不枚举 UID、不上传本地仓库。
- 不要求账号登录/密码/Cookie/Token；“记住 UID”由用户主动勾选，仅本地保存，默认关闭。
- 保留 contextIsolation、sandbox 和禁用 nodeIntegration；请求超时15秒，单次响应限制5MB，同 UID 请求进行中不得重复。
- 按响应 `ttl` 做内存缓存与刷新倒计时；429尊重 Retry-After/退避，不自动反复重试。
- 词条 `propValue` 不盲目乘100；`reliquary.level` 范围1～21，显示/保存为接口值减1。
- 取消和全部失败路径不修改库存；不推断游戏锁定状态；未知装备单独禁存，不阻断其他有效项。
- 当前无 Git：验收后记录测试和回退点，不擅自提交或发布；共用总计划的数据/图片/确认边界。

## Review Focus

- 缺展柜字段、空数组、非数组和坏JSON：区分空展柜与异常响应，库存不变；U1/U2/U3。
- 混合武器/四星/未知五星、hash冲突：只收入确定映射的五星，未知项禁存；U1。
- 9/10位UID、空格、网址/控制字符、其他页面调用IPC：有效数字规范化，任意URL/来源拒绝；U2。
- 分块超限、跨主机跳转、取消后迟到、同UID并发：不绕过限制，不把过期结果显示到新查询；U2/U3。
- TTL未到、429日期格式、记住UID关闭和离线：不重复请求、不泄露持久化、其他入口可用；U2/U3。

---

### Task U1：版本化映射与纯解析器

**Files:** Create `apps/web/src/imports/enka/{types,parseShowcase}.ts`、`parseShowcase.test.ts`、`fixtures/showcase.json`。Consumes W1 的 `gameData.snapshot.json`，不另维护第二套名称/词条表。

**Interfaces:** `ShowcaseParseResult={drafts:ArtifactDraft[];skipped:{weapons:number;lowerRarity:number};unknown:{characterId?:number;message:string}[];empty:boolean}`；`parseShowcase(payload:unknown,fetchedAt:number):ShowcaseParseResult`。未知记录保留为带 error 的草稿或独立unknown提示，不能伪造setKey；只有有效记录可选。Produces `EnkaQueryResult={ok:true;payload:unknown;fetchedAt:number;refreshAt:number;cached:boolean}|{ok:false;code:'invalid-uid'|'not-found'|'maintenance'|'rate-limited'|'unavailable'|'offline'|'timeout'|'invalid-response'|'unauthorized';retryAt?:number}`，供 U2/U3 共用。

- [x] **Step 1：写失败测试。** `fiveSlotsAndPercentUnits/skipWeaponAndFourStar/unknownDoesNotBlockValid/invalidLevelAndMainBlocked/closedAndMalformedDiffer`：fixture明确含五部位五星、武器、四星、一件未知hash；断言部位顺序与花羽沙杯冠对应、API等级1/21变0/20、主暴伤 `expect(value).toBe(62.2)`、副充能 `expect(value).toBe(22.7)`；低星/武器计数正确；未知项不可保存且其他五星保留；等级0/22及NaN/未知propType报错；缺avatarInfoList为empty，非数组为异常。样本使用虚构UID和无个人简介内容，不查询任何真实账号来造样本。
- [x] **Step 2：跑红灯。** `npm test -- src/imports/enka/parseShowcase.test.ts`，新转换器不存在应失败。
- [x] **Step 3：实现纯转换器。** 校验外层对象及装备字段；EQUIP_BRACER/NECKLACE/SHOES/RING/DRESS分别映射花羽沙杯冠；FIGHT_PROP枚举映射 W1 StatKey，并按key生成单位。套装/单件hash使用字符串查版本字典，核对同套装同部位，未知/矛盾不猜。生成 source='uid'、明确 avatarId、fetchedAt，不存UID/签名/成就；`locked=false`仅表示工具本地默认未锁定，界面不说游戏已解锁。
- [x] **Step 4：绿灯与检查点。** 重跑 Step2、W1草稿测试和 `npm run build`；用W1校验每件有效fixture，断言无error。记录字典版本及未知项处理。

### Task U2：固定网络能力、IPC、缓存与错误

**Files:** Create `apps/web/electron/enkaClient.cjs`、`enkaClient.test.cjs`、`enkaIpc.cjs`、`enkaIpc.test.cjs`。Modify `apps/web/electron/main.cjs`、`preload.cjs`、`apps/web/src/desktop.d.ts`、`apps/web/package.json`。

**Interfaces:** Produces `normalizeUid(input:string):string|null`、`queryShowcase(uid:string):Promise<EnkaQueryResult>`、`clearShowcaseCache():void`、`registerEnkaIpc(ipcMain:IpcMain,getMainWindow:()=>BrowserWindow|null):()=>void`（Electron类型用于JSDoc）。preload仅新增 `artifactDesktop.queryShowcase(uid:string):Promise<EnkaQueryResult>`，保留采集桥。工厂 `createEnkaClient(options:{request:typeof import('node:https').request;now:()=>number})` 返回前三个方法，允许注入测试；生产固定 `node:https`，调用方不可指定 URL/headers。清缓存同时取消未完成请求。

- [x] **Step 1：写失败测试。** `fixedEndpointAndCaller/timeoutAt15000/streamLimit5000000/redirectDenied/sameUidSingleRequest/cacheUntilTtl/retryAfterBackoff`：trim后的9～10位非零开头十进制字符串可提交，网址/指数/控制字符拒绝；非主窗口/非主frame拒绝。捕获请求只允许 `https://enka.network/api/uid/{uid}/` 且有产品UA；Node断言 `assert.equal(requestCount,1)`覆盖同UID并发和TTL内重复；15000ms超时；分块总字节5000001失败；任意3xx不跟随；429秒数/HTTP日期与无头回退60秒均禁止提前请求。
- [x] **Step 2：跑红灯。** 在 `apps/web` 执行 `node --test electron/enkaClient.test.cjs electron/enkaIpc.test.cjs`；新客户端/IPC缺失应失败。
- [x] **Step 3：实现网络与IPC。** 校验 sender 是当前主窗口 webContents 且senderFrame为其mainFrame、页面是本包入口；仅接收UID，不接收任意URL。UA固定 `ArtifactMaster/{appVersion} (local-Windows)`；15秒 abort、流式计数上限5_000_000字节、拒绝重定向，错误分400/404/424/429/500/503/断网/超时/坏JSON。进程内按UID缓存到ttl，无效ttl回退60秒；限流期间无自动重试。只缓存/返回解析所需角色装备字段，删除个人签名/简介/成就/owner；禁止输出UID或原响应到日志。窗口关闭/退出取消请求并清缓存，防止遗留后台任务。
- [x] **Step 4：绿灯与检查点。** 重跑 Step2；加入 `test:electron` 命令 `node --test electron/*.test.cjs`，类型检查通过；检查 webPreferences 安全设置未改变。该阶段全部使用注入网络样本，不算真实查询成功。

### Task U3：查询界面、选择与统一确认

**Files:** Create `apps/web/src/imports/UidShowcaseImport.tsx`、`UidShowcaseImport.test.tsx`、`enka/uidPreference.ts`、`enka/uidPreference.test.ts`。Modify `apps/web/src/App.tsx`、`apps/web/src/imports/imports.css`。

**Interfaces:** Consumes U1/U2和W4 `ImportReview`。Produces `UidShowcaseImportProps={existing:ArtifactRecord[];onConfirm:(decisions:ImportDecision[])=>Promise<void>;onClose:()=>void}`；`UidShowcaseImport(props:UidShowcaseImportProps)`、`readRememberedUid():string|null`、`writeRememberedUid(uid:string|null):void`，唯一偏好键 `artifact-master:remembered-uid-v1`。

- [x] **Step 1：写失败测试。** `typingDoesNotQuery/queryShowsDisclosure/validSubsetCanImport/cancelKeepsLibrary/staleResultIgnored/uidNotRememberedByDefault/browserUnsupported`：输入/打开组件无query调用；点击前显示“第三方Enka、仅公开角色展柜、不是整个背包”；含未知项时有效项可进确认；取消save调用0次；关闭/换查询后迟到响应不改变UI；默认localStorage不含UID，主动记住才保存，取消勾选删除旧记忆；无artifactDesktop时明确Windows桌面能力提示。空展柜、各错误、TTL倒计时分别断言提示文字和库存不变。
- [x] **Step 2：跑红灯。** `npm test -- src/imports/UidShowcaseImport.test.tsx src/imports/enka/uidPreference.test.ts src/imports/ImportReview.test.tsx`。
- [x] **Step 3：实现UI及接线。** 明确点击“查询公开展柜”后发一次请求，加载中禁重复，刷新仅在倒计时结束允许；显示查询时间/缓存标记。按角色列五星装备，武器/低星统计和未知项原因可见，所有新增仍经过 W4重复/校验确认；不绑定任意用户头像远程请求。关闭清内存输入和响应、使请求序号失效；记住UID默认关闭且可删除。断网不阻挡仓库/手动/采集入口。
- [ ] **Step 4：绿灯与独立交付。** 重跑 Step2、`npm run test:electron`、`npm run lint`、`npm run build`。记录样本验收；只有用户主动提供公开UID后才桌面实测一次查询、缓存、导入及重开离线查看，未提供则实测状态保持“待验证”，不私自使用文档示例或截图UID。

接口依据：2026-10-01复核 [Enka访问规则](https://github.com/EnkaNetwork/API-docs/blob/master/api.md) 与 [原神装备字段](https://github.com/EnkaNetwork/API-docs/blob/master/docs/gi/api.md)。9～10位本地输入限制、5_000_000字节和60秒回退是本项目实现选择，不声称是服务端所有版本的完整规则；出现服务端新格式需更新测试再扩展。
