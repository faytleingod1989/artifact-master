import type { CaptureSession, CapturedArtifactFrame, createCaptureSession } from '../realtimeCapture'
import type { OcrSession, OcrTimings, createOcrSession } from '../artifacts/ocrService'
import type { CaptureRoi } from './captureRegion'
import type { DraftReviewItem } from '../imports/ImportReview'
import { fingerprint, type ArtifactDraft } from '../artifacts/artifactDraft'
import { getRecognitionProblems } from '../imports/recognitionCheck'
import { createCaptureResources } from './captureResources'
import { MANUAL_BATCH_LIMIT, PAGE_BATCH_LIMIT, STREAMING_INFLIGHT_LIMIT, type CaptureJobSnapshot, type CaptureQueueSnapshot, type CaptureRequestOutcome } from './captureQueueTypes'
export type CaptureStatus = 'inactive' | 'capturing' | 'recognizing' | 'pending' | 'retry' | 'failed' | 'stopped'
export type CaptureDiagnostic = { requestId: number; jobId: string; attempt: number; rawText: string; captureMs: number; queueWaitMs: number; startupMs?: number; totalMs: number; ocr?: OcrTimings }
export type AutoCommitResult = { committed: boolean; duplicateIds?: number[] }
export type CaptureControllerOptions = {
  createCaptureSession: typeof createCaptureSession; createOcrSession: typeof createOcrSession
  onItems: (items: DraftReviewItem[]) => void; onStatus: (status: { state: CaptureStatus; message: string }) => void
  onQueue?: (snapshot: CaptureQueueSnapshot) => void; onCaptured?: (job: CaptureJobSnapshot) => void
  onPreview?: (frame: { image: Blob; width: number; height: number; roi?: CaptureRoi }) => void
  onDiagnostics?: (diagnostic: CaptureDiagnostic) => void; onAccepted?: () => void
  canAutoCommit?: () => boolean
  onAutoCommit?: (draft: ArtifactDraft, batchId: string) => AutoCommitResult
  onDraftRecognized?: (draft: ArtifactDraft) => void
}
export type CaptureController = {
  start: (sourceId: string, roi?: CaptureRoi) => Promise<void>; requestCapture: () => CaptureRequestOutcome
  requestPageCapture: (input: PageCaptureInput) => CaptureRequestOutcome
  setAutoDetect: (enabled: boolean) => void; pauseCapture: () => void; resumeCapture: () => void
  drain: () => Promise<void>; stop: () => Promise<void>; retryJob: (id: string) => void
  discardJob: (id: string) => void; recoverOcr: () => Promise<void>; discard: (draftId: string) => void
  cancelBatch: () => Promise<void>; dispose: () => Promise<void>
}
type PageCaptureInput = { pageId: string; cellId: string; frame: CapturedArtifactFrame }
type Job = { snapshot: CaptureJobSnapshot; started: number; queuedAt: number; captureMs: number; attempts: number; startupMs?: number }
const aborted = () => new DOMException('采集批次已取消。', 'AbortError')
const messageOf = (error: unknown) => error instanceof Error ? error.message : '处理失败，请重试此图。'
export function createCaptureController(options: CaptureControllerOptions): CaptureController {
  const resources = createCaptureResources()
  let generation = 0, sequence = 0, batchId = '', sourceId = ''
  let capture: CaptureSession | undefined, ocr: OcrSession | undefined
  let accepting = false, capturing = false, disposed = false, ocrPaused = false, recovering = false
  let engineError = '', lastArtifact = '', startupMs: number | undefined
  let autoCommittedCount = 0
  let jobs: Job[] = [], queue: Job[] = [], running: Job | undefined
  let timer: ReturnType<typeof setInterval> | undefined
  const waiters = new Set<{ resolve: () => void; reject: (error: unknown) => void }>()
  const status = (state: CaptureStatus, message: string) => { if (!disposed) options.onStatus({ state, message }) }
  const safeNotify = (notify: (() => void) | undefined) => { try { notify?.() } catch { /* Audio is optional. */ } }
  const publish = () => {
    if (disposed) return
    options.onQueue?.({ batchId, accepting, capturing, ocrPaused, heldSourceBytes: resources.bytes(), autoCommittedCount, jobs: jobs.map(job => ({ ...job.snapshot })) })
    options.onItems(jobs.flatMap(job => job.snapshot.item ? [job.snapshot.item] : []))
  }
  const valid = (job: Job, token: number) => token === generation && !disposed && job.snapshot.state !== 'cancelled'
  const update = (job: Job, next: Partial<CaptureJobSnapshot>) => { job.snapshot = { ...job.snapshot, ...next } }
  const settle = () => {
    if (ocrPaused || !capturing && !running && !queue.length) {
      for (const waiter of waiters) { if (ocrPaused) waiter.reject(new Error(engineError)); else waiter.resolve() }
      waiters.clear()
    }
  }
  function pauseCapture() { accepting = false; clearInterval(timer); timer = undefined; publish(); status('stopped', '已暂停截图，已保存的图片继续识别。') }
  function drain() {
    if (ocrPaused) return Promise.reject(new Error(engineError))
    if (!capturing && !running && !queue.length) return Promise.resolve()
    return new Promise<void>((resolve, reject) => { waiters.add({ resolve, reject }) })
  }
  async function pump() {
    if (running || ocrPaused || !ocr || disposed) return
    const job = queue.shift()
    if (!job) { settle(); return }
    const image = resources.get(job.snapshot.id)
    if (!image || job.snapshot.state === 'cancelled') { void pump(); return }
    const token = generation, currentOcr = ocr
    running = job; job.attempts++
    const queueWaitMs = Math.round(performance.now() - job.queuedAt)
    update(job, { state: 'recognizing', error: undefined }); publish()
    status('recognizing', '正在识别第' + job.snapshot.sequence + '张，仍可按F8截图下一件。')
    try {
      const result = await currentOcr.recognize(image)
      if (!valid(job, token)) return
      const diagnostic: CaptureDiagnostic = { requestId: job.snapshot.sequence, jobId: job.snapshot.id, attempt: job.attempts, rawText: result.rawText, captureMs: job.captureMs, queueWaitMs, startupMs: job.startupMs, totalMs: Math.round(performance.now() - job.started), ocr: result.timings }
      update(job, { diagnostic, previewUrl: resources.preview(job.snapshot.id, result.detailImage ?? image), roi: result.detailRoi ?? job.snapshot.roi })
      options.onDiagnostics?.(diagnostic)
      const problems = getRecognitionProblems(result.draft)
      if (problems.length) throw new Error('本图需重试，未加入待确认。' + problems.join(' ') + ' 可重新识别此图，或重新采集当前画面。')
      const signature = fingerprint(result.draft)
      if (job.snapshot.trigger === 'automatic' && signature === lastArtifact) { discardJob(job.snapshot.id); status('pending', '自动辅助：详情未改变，未重复加入。'); return }
      lastArtifact = signature
      const draft: ArtifactDraft = { ...result.draft, source: 'realtime' as const, draftId: crypto.randomUUID(), batchId, issues: [...result.draft.issues], ...(job.snapshot.gameLocked === true ? { observedGameLocked: true } : {}) }
      options.onDraftRecognized?.(draft)
      const autoCommitEligible = job.snapshot.trigger === 'page' && Boolean(options.canAutoCommit?.() && options.onAutoCommit) && draft.issues.length === 0
      if (autoCommitEligible && options.onAutoCommit) {
        const commitResult = options.onAutoCommit(draft, batchId)
        if (!valid(job, token)) return
        if (commitResult.committed) {
          autoCommittedCount++
          resources.release(job.snapshot.id)
          jobs = jobs.filter(other => other !== job)
          publish()
          status('pending', `第${job.snapshot.sequence}张已自动入库（本批已入库 ${autoCommittedCount} 件）。`)
          if (valid(job, token)) safeNotify(options.onAccepted)
          return
        }
        const conflictText = commitResult.duplicateIds?.length ? commitResult.duplicateIds.map(id => `#${id}`).join('、') : '已有圣遗物'
        draft.issues.push({ field: 'source', code: 'inventory-duplicate', severity: 'warning', message: `与仓库已有 ${conflictText} 疑似重复；已留待人工核对，请决定跳过或保留。` })
      } else if (jobs.some(other => other !== job && other.snapshot.item && fingerprint(other.snapshot.item.draft) === signature)) {
        draft.issues.push({ field: 'source', code: 'batch-duplicate', severity: 'warning', message: '与批次已有草稿疑似重复；不自动合并，请核实是否为另一件实物。' })
      }
      const item: DraftReviewItem = { draft, previewUrl: job.snapshot.previewUrl, rawOcr: result.rawText }
      update(job, { state: 'pending', item }); resources.releaseSource(job.snapshot.id); publish()
      status('pending', '第' + job.snapshot.sequence + '张识别成功，已加入待确认，尚未入库。')
      if (valid(job, token)) safeNotify(options.onAccepted)
    } catch (error) {
      if (!valid(job, token)) return
      const message = messageOf(error)
      if (error && typeof error === 'object' && 'kind' in error && error.kind === 'engine-unavailable') {
        ocrPaused = true; engineError = message; update(job, { state: 'queued', error: message }); queue.unshift(job)
        status('retry', 'OCR引擎已暂停：' + message + ' 图片已保留，请恢复引擎。')
      } else { update(job, { state: 'failed', error: message }); status('retry', message) }
      clearInterval(timer); timer = undefined; publish()
    } finally {
      if (token === generation && running === job) { running = undefined; publish(); void pump(); settle() }
    }
  }
  function request(manual: boolean, page?: PageCaptureInput): CaptureRequestOutcome {
    if (!accepting || !capture || !ocr || disposed) return 'inactive'
    if (ocrPaused) { status('retry', 'OCR引擎已暂停，请先恢复；已有图片保留。'); return 'engine-paused' }
    if (capturing) { status('capturing', '正在截图，请听到捕获提示后再切换；本次按键未接收。'); return 'capture-busy' }
    const streaming = Boolean(page && options.canAutoCommit?.())
    if (streaming) {
      const inflight = jobs.filter(job => job.snapshot.state === 'capturing' || job.snapshot.state === 'queued' || job.snapshot.state === 'recognizing').length
      if (inflight >= STREAMING_INFLIGHT_LIMIT) { status('pending', `后台识别待处理已达${STREAMING_INFLIGHT_LIMIT}件流控上限，暂停前台截图等待消化…`); return 'capacity' }
    } else {
      const limit = page ? PAGE_BATCH_LIMIT : MANUAL_BATCH_LIMIT
      if (jobs.length >= limit) { status('pending', `本批任务已满${limit}件（含排队、失败和待确认），请先核对或丢弃。`); return 'capacity' }
    }
    if (page && (!/^[a-z0-9-]{1,64}$/i.test(page.pageId) || !/^r\d{1,2}c\d{1,2}$/.test(page.cellId) || !(page.frame.ocrImage instanceof Blob))) return 'inactive'
    const currentCapture = capture, token = generation, started = performance.now(), freezeMs = page?.frame.captureMs ?? 0
    const job: Job = { snapshot: { id: crypto.randomUUID(), batchId, sourceId, sequence: ++sequence, trigger: page ? 'page' : manual ? 'manual' : 'automatic', state: 'capturing', ...(page ? { pageId: page.pageId, cellId: page.cellId } : {}) }, started: started - freezeMs, queuedAt: started, captureMs: 0, attempts: 0, startupMs }
    startupMs = undefined; jobs.push(job); capturing = true; publish(); status('capturing', '正在截图第' + sequence + '张…')
    void (async () => {
      try {
        const frame = page ? page.frame : await currentCapture.captureFrame()
        if (!valid(job, token)) return
        if (!resources.hold(job.snapshot.id, frame.ocrImage)) {
          discardJob(job.snapshot.id); status('retry', '图片超过单张16MiB或本批128MiB源图预算，本次未保存；请先处理已有任务。'); return
        }
        job.captureMs = page ? freezeMs : Math.round(performance.now() - started); job.queuedAt = performance.now()
        update(job, { state: 'queued', capturedAt: Date.now(), width: frame.width, height: frame.height, roi: frame.roi, capturePath: frame.capturePath, captureFallbackReason: frame.fallbackReason, gameLocked: frame.gameLocked, previewUrl: resources.preview(job.snapshot.id, frame.ocrImage) })
        queue.push(job); publish()
        if ((manual || page) && valid(job, token)) safeNotify(() => options.onCaptured?.({ ...job.snapshot }))
      } catch (error) {
        if (!valid(job, token)) return
        discardJob(job.snapshot.id); accepting = false; capture?.stop(); capture = undefined
        clearInterval(timer); timer = undefined; status('failed', messageOf(error) + ' 已保存的图片继续识别。')
      } finally {
        if (token === generation) { capturing = false; publish(); void pump(); settle() }
      }
    })()
    return 'started'
  }
  function discardJob(id: string) {
    const job = jobs.find(job => job.snapshot.id === id)
    if (!job) return
    update(job, { state: 'cancelled', item: undefined }); resources.release(id)
    jobs = jobs.filter(job => job.snapshot.id !== id); queue = queue.filter(job => job.snapshot.id !== id); publish(); settle()
  }
  async function cancelBatch() {
    generation++; accepting = false; capturing = false; clearInterval(timer); timer = undefined
    for (const waiter of waiters) waiter.reject(aborted()); waiters.clear()
    for (const job of jobs) update(job, { state: 'cancelled' })
    jobs = []; queue = []; running = undefined; autoCommittedCount = 0; resources.clear(); capture?.stop(); capture = undefined
    const previous = ocr; ocr = undefined; ocrPaused = false; recovering = false; publish()
    await previous?.dispose(); status('stopped', '批次已结束，未入库任务已丢弃。')
  }
  return {
    async start(source, roi) {
      if (disposed) throw new Error('采集会话已经结束。')
      if (jobs.length || running || capturing) throw new Error('请先核对或丢弃本批任务，再更换来源。')
      await cancelBatch(); const token = generation, started = performance.now()
      let nextCapture: CaptureSession | undefined, nextOcr: OcrSession | undefined
      try {
        nextCapture = await options.createCaptureSession(source, roi); nextOcr = await options.createOcrSession()
        if (token !== generation || disposed) { nextCapture.stop(); await nextOcr.dispose(); return }
        capture = nextCapture; ocr = nextOcr; sourceId = source; batchId = crypto.randomUUID(); sequence = 0
        accepting = true; lastArtifact = ''; startupMs = Math.round(performance.now() - started); publish()
        status('capturing', '已启动，按F8截图；听到捕获提示后可切下一件，不必等待OCR。')
      } catch (error) { nextCapture?.stop(); await nextOcr?.dispose(); status('failed', messageOf(error)); throw error }
    },
    requestCapture: () => request(true), requestPageCapture: input => request(false, input), pauseCapture,
    resumeCapture() { if (capture && !disposed) { accepting = true; publish(); status('capturing', '已恢复截图。') } else status('failed', '来源已关闭，请处理本批后重新选择。') },
    drain, async stop() { pauseCapture(); await drain() },
    setAutoDetect(enabled) { clearInterval(timer); timer = enabled && accepting ? setInterval(() => { if (!capturing && !running && !queue.length && !ocrPaused) request(false) }, 2500) : undefined },
    retryJob(id) { const job = jobs.find(job => job.snapshot.id === id); if (!job || job.snapshot.state !== 'failed' || !resources.get(id)) return; update(job, { state: 'queued', error: undefined }); job.queuedAt = performance.now(); queue.push(job); publish(); void pump() },
    async recoverOcr() {
      if (!ocrPaused || recovering || disposed) return
      recovering = true; const token = generation
      try {
        const previous = ocr; ocr = undefined; await previous?.dispose(); const next = await options.createOcrSession()
        if (token !== generation || disposed) { await next.dispose(); return }
        ocr = next; ocrPaused = false; engineError = ''; publish(); void pump()
      } catch (error) { if (token === generation) { engineError = messageOf(error); status('retry', '引擎恢复失败：' + engineError); publish() } }
      finally { if (token === generation) recovering = false }
    },
    discardJob, discard(id) { const job = jobs.find(job => job.snapshot.item?.draft.draftId === id); if (job) discardJob(job.snapshot.id) },
    cancelBatch, async dispose() { if (disposed) return; await cancelBatch(); disposed = true },
  }
}
