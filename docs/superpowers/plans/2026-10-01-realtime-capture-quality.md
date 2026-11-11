# 实时采集与真实 OCR 质量 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复整屏识别噪声与文字缩小问题，交付可校准、离线、串行且必须确认的 Windows 实时采集。

**Architecture:** 分开画面获取、区域识别和草稿确认。原分辨率区域进入复用的本地OCR worker；会话控制器管理F8、自动检测、最多20件待确认及停止释放；截图复用同一识别/确认路径。

**Tech Stack:** Electron desktopCapturer/globalShortcut、浏览器 MediaStream/Canvas、Tesseract.js 7、React/TypeScript、Vitest/Testing Library、Playwright真实OCR基准。

**Spec:** [已确认设计](../specs/2026-10-01-warehouse-input-redesign-design.md)；[总计划与共享接口](2026-10-01-warehouse-input-redesign.md)；前置 W1/W4，网络能力与本包无运行依赖。

## Global Constraints

- 用户选择可见游戏窗口，明确启动后采集；默认以 F8 主动采集为主，自动检测作为可关闭的辅助选项。
- 不模拟游戏鼠标键盘、不自动翻背包；选中圣遗物图标不作为权威图源。
- 识别使用原画面的详情区域，避免先把完整画面缩到 1280 再裁切。
- 待确认批次最多20件；识别未完成时的再次按键串行处理，不能并发写入。
- 停止、取消、窗口关闭时释放流、快捷键和临时图片；校对期间不删除必要预览。
- 本地 OCR 的资源须随包提供才能验收离线可用；解析失败的必填项禁止保存。
- 至少10张真实中文详情截图、覆盖五部位；所有必填字段完全正确条目达到9/10；不能仅用模拟文本代替识别验收。
- 当前无 Git：各项以实际测试记录和可恢复检查点结束；遵守总计划的草稿、图片与数据保护约束。

## Review Focus

- 4K/超宽画面、125%/150%DPI、框选越界：用捕获帧自身像素标尺裁切，越界拒绝；R1。
- 窗口最小化/关闭、黑帧、权限拒绝：明确失败不造草稿，初始化失败也释放流；R1。
- 首次离线、语言/core缺失、worker失败：不回退CDN、不保存猜测值，资源问题可理解；R2。
- 暴击率3.9误成9.9、标题/套装文本错配：真实图片对照全部字段，不以解析通过冒充识别正确；R2。
- 连按F8、停止期间迟到结果、批次满、待确认关闭：串行且有界，不写库、不泄露URL，不提前删除校对图；R3。

---

### Task R1：原分辨率捕获与详情区域校准

**Files:** Modify `apps/web/src/realtimeCapture.ts`、`apps/web/src/artifacts/artifactOcrImage.ts`、`artifactOcrImage.test.ts`、`apps/web/src/App.tsx`。Create `apps/web/src/capture/{captureRegion,frameQuality}.ts`、`captureRegion.test.ts`、`frameQuality.test.ts`、`CaptureRegionEditor.tsx`、`CaptureRegionEditor.test.tsx`、`apps/web/src/realtimeCapture.test.ts`。

**Interfaces:** `captureRegion.ts` 导出 `CaptureRoi={x:number;y:number;width:number;height:number}`（原捕获帧像素）、`validateCaptureRoi(roi:CaptureRoi,width:number,height:number):boolean`、`cropDetailRegion(frame:Blob,roi:CaptureRoi):Promise<Blob>`；`frameQuality.ts` 导出 `isUsableFrame(image:Blob):Promise<boolean>`。调整现有 `CapturedArtifactFrame={ocrImage:Blob;width:number;height:number;roi:CaptureRoi}`、`CaptureSession={captureFrame:()=>Promise<CapturedArtifactFrame>;stop:()=>void}`、`createCaptureSession(sourceId:string,roi?:CaptureRoi):Promise<CaptureSession>`。width/height始终指原帧；有roi时ocrImage已裁切，R2调用 `recognize(frame.ocrImage)` 不得再次裁切；无roi仅获取原帧供校准，不能直接作为已确认采集。`CaptureRegionEditorProps={frame:Blob;width:number;height:number;onConfirm:(roi:CaptureRoi)=>void;onCancel:()=>void}`，导出同名组件。

- [x] **Step 1：写失败测试。** `nativeSizeBeforeCrop/roiUsesFramePixels/outOfBoundsRejected/initFailureStopsTracks/blankFrameCreatesNoDraft`：3840×2160帧裁800×1000区域时 `expect(canvasSize).toEqual([800,1000])`，不得先缩成1280；缩放预览坐标正确换回frame像素；负坐标/零面积/超边界false；play失败及捕获结束tracks.stop被调用；黑帧只报可操作错误。旧1920上限导致的实际降采样须显式显示采集尺寸，不能标作原生4K。
- [x] **Step 2：跑红灯。** `npm test -- src/realtimeCapture.test.ts src/capture/captureRegion.test.ts src/capture/frameQuality.test.ts src/capture/CaptureRegionEditor.test.tsx src/artifacts/artifactOcrImage.test.ts`。
- [x] **Step 3：实现捕获/校准接口。** 获取所选窗口原生可用尺寸，移除整帧1280缩放和不必要JPEG压缩；以 `video.videoWidth/videoHeight` 为真值，从原帧先裁区域、再按OCR需要放大，输出PNG。提供详情框选及预览；窗口尺寸变化使旧区域失效并要求重新确认，不把相对整屏预设当已确认区域。删除作为权威图源的artifactThumbnail链路；初始无可靠区域、黑帧/失去窗口时提示重新选择或手动录入。
- [ ] **Step 4：绿灯和检查点。** 重跑 Step2、`npm run build`；实际窗口/屏幕源各试一次，显示采集分辨率，拖框边缘并在缩放桌面核对文字不丢失。即使底层只能提供低分辨率也如实记录，不称已达到原生质量。

### Task R2：离线 OCR、字段解析与真实基准

**Files:** Create `apps/web/src/artifacts/{ocrService,ocrBenchmark}.ts`、`ocrService.test.ts`、`ocrBenchmark.test.ts`、`scripts/prepare-local-ocr.mjs`、`scripts/prepare-local-ocr.test.mjs`、`scripts/benchmark-artifact-ocr.mjs`、`docs/ocr/benchmark/README.md`。Modify `apps/web/src/artifacts/artifactOcr.ts`、`artifactOcr.test.ts`、`artifactOcrImage.ts`、`apps/web/package.json`、`apps/web/package-lock.json`、`.gitignore`。Generated resources: `apps/web/public/ocr/resources.json`、`worker/`、`core/`、`lang/`；私有样本 `tests/private/ocr/manifest.json` 和同目录图像禁止进发布包。

**Interfaces:** `OcrDraftResult={draft:ArtifactDraft;rawText:string;confidence:number}`；`OcrSession={recognize:(image:Blob,roi?:CaptureRoi)=>Promise<OcrDraftResult>;dispose:()=>Promise<void>}`；`createOcrSession():Promise<OcrSession>`。有roi表示原图需先裁详情区域，无roi表示已裁详情图；随后子区域按详情图坐标识别，禁止沿用整屏坐标二次裁切。`OcrBenchmarkCase={id:string;image:Blob;roi:CaptureRoi;expected:{setKey:ArtifactSetKey;slot:ArtifactSlot;level:number;main:StatValue;subs:StatValue[]}}`；`runOcrBenchmark(cases:OcrBenchmarkCase[],session:OcrSession):Promise<{total:number;exact:number;failures:{id:string;fields:string[]}[]}>`，忽略副词条顺序、不忽略类型和值。

- [x] **Step 1：写失败测试。** `localPathsOnly/reuseWorkerWithinSession/errorDoesNotInventDefaults/parserHandlesProblemFields` 固定断言worker/core/lang均是本包路径、两次recognize创建worker一次、dispose终止一次、识别失败main/set/level不得默认深廊或0。文本样本固定旧问题图真值：司信者的圣冕、纺月的夜歌、理之冠、+20、主暴伤62.2%、副精通40/防御16/暴击3.9%/充能22.7%；这是解析回归，不是图像准确性。基准测试故意把3.9改9.9，`expect(report.exact).toBe(0)`且字段错误中含该副词条。
- [x] **Step 2：跑红灯。** `npm test -- src/artifacts/ocrService.test.ts src/artifacts/ocrBenchmark.test.ts src/artifacts/artifactOcr.test.ts`；根目录 `node --test scripts/prepare-local-ocr.test.mjs`。
- [x] **Step 3：实现本地资源与识别接口。** 资源脚本从已锁定的Tesseract依赖复制worker及配套全部core JS/WASM；语言文件取可信上游、记录来源版本/许可/哈希，构建可从已缓存资源离线复现，不每次构建联网。配置workerPath/corePath/langPath为包内路径，资源缺失停止，不回退CDN；P1验证包内完整性。按区域将标题、主副词条、套装分别OCR，字典匹配不改变数值；保留未知和低置信度issues，主副数值交 W1同一校验。可对原色/灰度/对比增强做固定候选选择，但不得为跑分硬编码某张图结果；保存仍强制用户确认。
- [ ] **Step 4：绿灯并建立真实样本。** 重跑 Step2。`docs/ocr/benchmark/README.md`定义样本标注字段、五部位覆盖、隐私处理和逐字段比较；由用户原图建立至少10例，包含旧问题图。图片不公开、不写入仓库、不擅自改原图。缺原图时只标“解析回归通过，真实OCR待验”，不要用生成图或模拟worker填充样本。
- [x] **Step 5：运行真实基准并记录。** 新增 `test:ocr-real` 为 `node ../../scripts/benchmark-artifact-ocr.mjs`；脚本启动仅127.0.0.1测试页，用Playwright调用实际浏览器 `createOcrSession/runOcrBenchmark`，本地受限路由提供私有样本，不启用mock，不把样本复制到public。必须断言 `total>=10`、覆盖五部位、`exact/total>=0.9`；输出逐字段错误和耗时。每件识别结果都先待核对，不能直接入库；错误项必须留在核对流程。失败继续针对区域/预处理/字典改进并复测，保留冻结样本，不删难样本抬高分数。

### Task R3：F8串行、有界会话与确认生命周期

**Files:** Create `apps/web/src/capture/captureController.ts`、`captureController.test.ts`、`RealtimeCapturePanel.tsx`、`RealtimeCapturePanel.test.tsx`。Modify `apps/web/src/App.tsx`、`App.test.tsx`、`realtime.css`、`apps/web/electron/main.cjs`、`preload.cjs`、`apps/web/src/desktop.d.ts`；Create `apps/web/electron/captureIpc.test.cjs`。

**Interfaces:** Consumes R1 CaptureSession、R2 OcrSession、W4 DraftReviewItem。Produces `CaptureStatus='inactive'|'capturing'|'recognizing'|'pending'|'failed'|'stopped'`；`CaptureController={start:(sourceId:string,roi:CaptureRoi)=>Promise<void>;requestCapture:()=>void;setAutoDetect:(enabled:boolean)=>void;stop:()=>Promise<void>;discard:(draftId:string)=>void;cancelBatch:()=>Promise<void>;dispose:()=>Promise<void>}`；`CaptureControllerOptions={createCaptureSession:typeof createCaptureSession;createOcrSession:typeof createOcrSession;onItems:(items:DraftReviewItem[])=>void;onStatus:(status:{state:CaptureStatus;message:string})=>void}`；`createCaptureController(options:CaptureControllerOptions):CaptureController`。`RealtimeCapturePanelProps={existing:ArtifactRecord[];onConfirm:(decisions:ImportDecision[])=>Promise<void>;onClose:()=>void}`，导出同名组件。自动默认false；快捷键沿用已有 `setRealtimeShortcut/onRealtimeCapture`。

- [x] **Step 1：写失败测试。** `f8SerialAndBounded/stopIgnoresLateRecognition/twentyItemsCap/shortcutConflictVisible/previewLifetime/cancelReleasesAll`：连按F8最大活跃recognize为1，待处理触发最多1个合并请求；满20时拒绝新捕获；停止后promise成功也不添草稿、不写库；快捷键注册false显示冲突，不谎称F8生效；关确认面板只是隐藏时预览仍可用，保存/丢弃/取消释放相应URL，卸载释放所有URL、tracks、worker和监听；相同画面提示疑似重复而不自行合并实物。
- [x] **Step 2：跑红灯。** `npm test -- src/capture/captureController.test.ts src/capture/RealtimeCapturePanel.test.tsx src/imports/ImportReview.test.tsx src/App.test.tsx`；`node --test electron/captureIpc.test.cjs`。
- [x] **Step 3：实现控制器和释放。** start显式选择源及区域，启用F8；不得全局F8和页面keydown重复触发同一请求。异步识别用会话代号阻止旧会话回调；stop注销快捷键/停止流/结束worker/清触发，释放未被确认页使用的图，不丢尚在核对的已完成预览。确认成功后逐项discard；cancelBatch先stop再清条目/URL，卸载dispose释放全部。自动辅助仅在用户开启后检查区域变化，和F8共用同一串行入口；停止/失败无自动重启或无限重试。
- [x] **Step 4：实现面板与截图接线。** 状态六种有文字，显示源/实际分辨率/区域/自动开关/待确认数；达到20提示先确认或清理。实时、单张截图、批量截图统一进入W4，未知字段不默认填值；批量识别亦串行且待确认不超过20；已保存图标使用目录映射。捕获IPC同样校验主窗口来源，退出注销F8；截图模式不注册系统快捷键。
- [ ] **Step 5：绿灯与独立交付。** 重跑 Step2、`npm run test:ocr-real`、`npm run test:electron`、`npm run lint`、`npm run build`；Windows实际切游戏按F8、连按、停止、源关闭、批次满、校对取消及重新开启，核对任务/资源释放。R2真实样本未达标或未做离线包测试，记录缺口并保持任务未验收；进入P1完成最终包级检查。
