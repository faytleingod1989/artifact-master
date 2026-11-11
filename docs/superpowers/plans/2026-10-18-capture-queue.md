# 独立取帧与OCR队列 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** OCR处理A时，用户可以保存B/C的真实截图，顺序识别且不串图、不丢图。

**Architecture:** 控制器分离取帧锁和单消费者OCR；不可变Blob由任务资源表持有，React只订阅只读快照。批次取消令牌和任务尝试编号阻止迟到回调；暂停只停新画面，销毁才取消OCR。

**Tech Stack:** 现有CaptureSession/OcrSession、TypeScript、React、Web Audio、Vitest/Playwright。

**Spec:** `docs/superpowers/specs/2026-10-18-async-capture-role-potential-design.md`，第4、7、8节。

## Global Constraints

- 每批最多20个未入库任务；每张编码源图16MiB，源图合计128MiB。
- 单次取帧；单OCR工作会话；禁止延后取帧代替忙时按键、禁止旧任务自动补拍当前画面。
- 同一图片的重新识别不能调用CaptureSession；截图仅内存保留，确认才入库。
- 既有来源/IPC校验不变，禁止静默换整个屏幕或自动提权。
- 两音分别开关，尊重既有静音；音频失败不影响结果、不抢焦点。
- 无Git仓库，任务结束记录测试与文件清单，不初始化/提交；遵循总计划全部约束。

## Review Focus

- 预览选择B时A完成：不能抢预览（A3测试）。
- F8在取帧未完成时重入：立即拒绝而非拍未来画面（A1测试）。
- 丢弃正在识别任务后完成：不响音、不复活、不破坏其他任务（A2测试）。
- 关闭来源窗口：已固定图片继续处理，新截图停止（A2测试）。
- 原生模型退出不同于普通图像失败：前者暂停队列、后者继续下一图（A2测试）。

## 文件边界与公共类型

Create `apps/web/src/capture/captureQueueTypes.ts`，统一导出：

```ts
type CaptureTrigger = 'manual' | 'automatic'
type CaptureJobState = 'capturing' | 'queued' | 'recognizing' | 'failed' | 'pending' | 'cancelled'
type CaptureJobSnapshot = Readonly<{
  id: string; batchId: string; sequence: number; sourceId: string
  trigger: CaptureTrigger; capturedAt?: number; state: CaptureJobState
  previewUrl?: string; item?: DraftReviewItem; error?: string
  diagnostic?: CaptureDiagnostic
}>
type CaptureQueueSnapshot = Readonly<{
  batchId: string; accepting: boolean; capturing: boolean; ocrPaused: boolean
  heldSourceBytes: number; jobs: readonly CaptureJobSnapshot[]
}>
type CaptureRequestOutcome = 'started' | 'inactive' | 'capture-busy' | 'capacity' | 'engine-paused'
```

实际Blob、可撤销URL所有权和异步句柄不放React状态。时间使用performance.now差值；capturedAt用Date.now，仅用于展示。任务ID与draftId不同；成功草稿保留原ID，重试次数另计。

### Task A1：不可变帧任务和单消费者OCR

**Files:**
- Create: `apps/web/src/capture/captureQueueTypes.ts`。
- Modify: `apps/web/src/capture/captureController.ts`、`apps/web/src/capture/nativeWindowCapture.ts`。
- Test: `apps/web/src/capture/captureController.test.ts`；Create `apps/web/src/capture/nativeWindowCapture.test.ts`。

**Interfaces:**
- Consumes unchanged `CaptureSession.captureFrame(): Promise<CapturedArtifactFrame>`、`OcrSession.recognize(image: Blob): Promise<OcrDraftResult>`。
- Produces `requestCapture(): CaptureRequestOutcome`；增加options的`onQueue(snapshot: CaptureQueueSnapshot): void`、`onCaptured(job: CaptureJobSnapshot): void`；保留onItems和onAccepted兼容面板。
- Extend `CaptureDiagnostic`保留原字段，增加`jobId: string; queueWaitMs: number`；`attempt`表示同一固定图的OCR次数，不再代表补拍。

- [ ] Step 1：先写红测试`freezes_B_and_C_while_A_ocr_is_blocked`：延迟A的OCR Promise；三次依次等待取帧后触发，断言captureFrame=3、OCR仅A；解除后识别Blob严格A/B/C，成功草稿/诊断ID对应且序号1/2/3。另测`capture_busy_rejects_without_deferred_read`断言第二次返回capture-busy、未来不偷偷增加读取。
- [ ] Step 2：写容量和资源红测试：20含取帧/OCR/失败/待确认，21返回capacity；用小Blob注入等价测试预算，精确覆盖16MiB和128MiB边界及超1字节，失败不响onCaptured、不覆盖旧任务。正式默认值固定为16*1024*1024与128*1024*1024。
- [ ] Step 3：在`apps/web`执行`npm test -- src/capture/captureController.test.ts src/capture/nativeWindowCapture.test.ts`，记录新增用例确实失败，而非测试初始化或导入错误。
- [ ] Step 4：实现独立取帧锁、预留槽位、固定Blob、FIFO单消费者，删除queued布尔和整次取帧/OCR共用busy。解析失败创建失败任务并继续，不再自动重拍。onCaptured仅在图片通过预算并固定后调用；manual重复保留warning。onQueue发布新对象/只读快照，不向订阅者泄露内部可变对象。
- [ ] Step 5：原生来源初始化验证帧读完即释放；每次captureFrame重新读取，同一来源和全部原校验不变。测试启动读取V、F8读取A时返回A而不是V；停止/空白/错误sourceId/非法尺寸仍拒绝。
- [ ] Step 6：重跑Step 3通过。调整原补拍测试为“失败后不再读取新画面”；保留未被新需求改变的自动重复、疑似重复、草稿校验测试。登记实现文件和测试结果，无Git提交。

### Task A2：暂停、重试、销毁和系统性故障

**Files:**
- Modify: `apps/web/src/capture/captureController.ts`。
- Create: `apps/web/src/artifacts/ocrErrors.ts`、`apps/web/src/capture/captureResources.ts`。
- Modify only typed-error propagation: `apps/web/src/artifacts/nativeOcrService.ts`、`apps/web/src/artifacts/ocrService.ts`、`apps/web/electron/nativeOcrClient.cjs`、`apps/web/electron/ocrIpc.cjs`、`apps/web/src/artifacts/nativeOcrTypes.ts`。
- Test: `apps/web/src/capture/captureController.test.ts`；Create `apps/web/src/capture/captureResources.test.ts`、`apps/web/src/artifacts/ocrErrors.test.ts`；existing `apps/web/electron/nativeOcrClient.test.cjs`、`apps/web/electron/ocrIpc.test.cjs`。

**Interfaces:**
- Extend controller `pauseCapture(): void; resumeCapture(): void; drain(): Promise<void>; retryJob(jobId: string): void; discardJob(jobId: string): void; recoverOcr(): Promise<void>`。
- `drain()`等待当批取帧和OCR终结；普通失败仍可终结，系统暂停拒绝并提供可操作原因；取消批次用AbortError结束等待。停止 accepting后调用，不捕新画面。
- `stop()`保留为pauseCapture后drain的兼容入口，不再dispose OCR；`cancelBatch()`取消并清空；`dispose()`不可恢复。
- `OcrEngineError`带`kind: 'engine-unavailable'`。原生进程退出/模型或会话资源缺失使用明确code，不凭中文/英文消息文本猜测。Electron错误传递不保证保留自定义属性，因此已有open/recognize通道只对可信引擎故障返回可克隆的`NativeOcrEngineFailure = { ok: false; code: 'OCR_ENGINE_UNAVAILABLE'; message: string }`；`NativeOcrBridge.open`结果改为`string | NativeOcrEngineFailure`，recognize结果改为`NativeOcrResult | NativeOcrEngineFailure`，由nativeOcrService收窄并抛OcrEngineError。未授权、非法参数和忙状态仍拒绝，不能包装为可恢复引擎故障；通道和授权不变。现有preload直接invoke透传无需扩权。
- `createCaptureResources()`返回`hold(id, blob): boolean; release(id): void; clear(): void; bytes(): number`及URL登记/撤销，用同一所有权入口保证恰好一次释放。

- [ ] Step 1：写红测试`retry_failed_job_uses_original_blob`、`ordinary_failure_does_not_block_B`、`engine_exit_preserves_queue_until_explicit_recovery`；重试插到队尾，不变sequence、不增加槽位，只允许failed；recover最多一次新会话初始化，失败保持暂停，不自动重启循环。
- [ ] Step 2：写红测试`pause_drains_existing_frames`、`source_loss_does_not_cancel_frozen_frames`、`discard_inflight_ignores_late_result`、`cancel_batch_aborts_drain_and_all_callbacks`、`late_old_batch_never_mutates_new_batch`。断言回调、音效、URL撤销和字节预算；有任务时start新来源明确拒绝，不清空旧批。
- [ ] Step 3：运行`npm test -- src/capture/captureController.test.ts src/capture/captureResources.test.ts src/artifacts/ocrErrors.test.ts`和`npm run test:electron`确认相关新增断言失败。
- [ ] Step 4：实现批次/尝试令牌、暂停/排空/取消分离、资源所有权。成功后释放源Blob保留详情预览与草稿；失败保留原Blob；丢弃活跃OCR任务标取消但仍等该OCRsettle才开始下一件，防止同会话并发。来源损失只停取帧。全部用户通知再次核对批次身份。
- [ ] Step 5：实现自动辅助仅在accepting且无取帧/排队/OCR时运行、默认关闭；自动重复释放任务、不响捕获音，manual重复照常保留。recover不修改图片或批次，只替换工作会话并恢复队列。
- [ ] Step 6：重跑Step 3全绿；原有IPC来源、尺寸、安全与销毁测试不得放宽。记录文件和结果，无Git提交。

### Task A3：任务列表、双音与核对流程

**Files:**
- Modify: `apps/web/src/capture/RealtimeCapturePanel.tsx`、`apps/web/src/capture/capture.css`、`apps/web/src/capture/captureSuccessSound.ts`。
- Create: `apps/web/src/capture/CaptureJobList.tsx`、`apps/web/src/capture/captureSoundPreferences.ts`。
- Test: `apps/web/src/capture/RealtimeCapturePanel.test.tsx`、`apps/web/src/capture/captureSuccessSound.test.ts`；Create `apps/web/src/capture/captureSoundPreferences.test.ts`。
- Modify browser tests: `apps/web/tests/capture.spec.ts`、`apps/web/tests/pending-sound.spec.ts`。

**Interfaces:**
- Consumes A1/A2 controller快照和动作；不在React另建OCR队列。
- `CaptureJobList({ jobs, selectedId, onSelect, onRetry, onDiscard })`按sequence展示；详情读取selectedId对应快照，不读“最后一次结果”。
- `createCaptureSuccessSound()`保留成功音`play()`，增加`playCaptured(): Promise<void>`；准备/释放共享AudioContext；捕获音为单段短音、成功音保留原上扬双音感，不从外部下载音频。
- Preferences新键`artifact-master:capture-sound-preferences:v2`保存`{ captured: boolean; recognized: boolean }`；无新键且旧v1=off时两项false，否则两项true；新键损坏回退旧偏好。不写库存。

- [ ] Step 1：写红测试：OCR忙时按钮仍可截图、取帧忙时按钮disabled并解释；已收到F8/已捕获/拒绝原因分开；选B预览后A完成不改变selectedId；逐任务显示capture/queue/OCR/total；失败A重识别而不是补拍；成功待确认只来自pending状态。
- [ ] Step 2：写红测试：只有queued/failed关闭也确认；暂停注销F8但OCR继续；“结束截图并核对”等待drain，取消等待返回列表且不丢任务；恢复截图继续同一源，旧批未清前禁止换源；review确认成功才discard相应成功任务，确认失败不清草稿，失败任务始终可返回处理。
- [ ] Step 3：写声音红测试：captured与recognized各只播放一次、静音迁移两项off、任一设备异常不撤销任务、关闭迟到完成不响音、自动重复不响捕获音。监听真实F8仍由原preload/快捷键注册提供，不新增仅前台keydown替代。
- [ ] Step 4：在`apps/web`运行`npm test -- src/capture/RealtimeCapturePanel.test.tsx src/capture/captureSuccessSound.test.ts src/capture/captureSoundPreferences.test.ts`确认红；实现列表、状态汇总、所选任务诊断、双音设置和暂停/排空UI。快捷键生命周期仍串行注册/注销；暂停不释放仍需播放成功音的音频会话，关闭才释放。
- [ ] Step 5：重跑Step 4全绿；运行`npm run test:ui -- tests/capture.spec.ts tests/pending-sound.spec.ts`，延迟OCR连续注入3次F8，验证图像/序号/声音和弹窗不抢焦点；测试失败保留trace，不手动改库存。
- [ ] Step 6：登记A独立验收：取帧与OCR重叠、20总容量、重试/暂停/取消与所有权测试、背景提示音结果。进入总计划I1实际本地包验收前不声称游戏前台已验证，无Git提交。
