import { afterEach, expect, test, vi } from 'vitest'
import { createCaptureController } from './captureController'
import { createManualDraft } from '../imports/manualDraft'
import type { OcrDraftResult } from '../artifacts/ocrService'
import type { CaptureQueueSnapshot } from './captureQueueTypes'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })
function gate<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
function result(name = 'test'): OcrDraftResult {
  return { draft: { ...createManualDraft('zhuying-lieren', '生之花'), name, level: 0, main: { key: 'hpFlat', value: 717 }, subs: [{ key: 'atkFlat', value: 14 }, { key: 'defFlat', value: 16 }, { key: 'elementalMastery', value: 23 }] }, confidence: 95, rawText: name }
}
function harness() {
  const frames = [new Blob(['A']), new Blob(['B']), new Blob(['C'])]
  let index = 0
  const captureFrame = vi.fn(async () => ({ ocrImage: frames[index++ % 3], width: 3840, height: 2160, roi: { x: 0, y: 0, width: 3840, height: 2160 } }))
  const seen: Blob[] = [], accepted = vi.fn(), captured = vi.fn(), stop = vi.fn(), dispose = vi.fn(async () => {})
  const recognize = vi.fn(async (image: Blob) => { seen.push(image); return result() })
  let snapshot!: CaptureQueueSnapshot
  const controller = createCaptureController({ createCaptureSession: async () => ({ captureFrame, stop }), createOcrSession: async () => ({ recognize, dispose }), onQueue: next => { snapshot = next }, onItems: vi.fn(), onStatus: vi.fn(), onAccepted: accepted, onCaptured: captured })
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => `blob:${Math.random()}`), revokeObjectURL: vi.fn() })
  return { controller, frames, captureFrame, recognize, seen, accepted, captured, stop, dispose, snap: () => snapshot }
}
test('freezes B and C while A OCR is blocked, then recognizes their exact saved images in order', async () => {
  const x = harness(), held = gate<OcrDraftResult>()
  x.recognize.mockImplementationOnce(async image => { x.seen.push(image); return held.promise })
  await x.controller.start('window:1'); x.controller.requestCapture()
  await vi.waitFor(() => expect(x.snap().jobs[0].state).toBe('recognizing'))
  x.controller.requestCapture(); await vi.waitFor(() => expect(x.captured).toHaveBeenCalledTimes(2))
  x.controller.requestCapture(); await vi.waitFor(() => expect(x.captured).toHaveBeenCalledTimes(3))
  expect(x.recognize).toHaveBeenCalledTimes(1)
  expect(x.snap().jobs.map(job => job.state)).toEqual(['recognizing', 'queued', 'queued'])
  held.resolve(result('A')); await x.controller.drain()
  expect(x.seen).toEqual(x.frames)
  expect(x.snap().jobs.map(job => job.sequence)).toEqual([1, 2, 3])
  expect(new Set(x.snap().jobs.map(job => job.diagnostic?.jobId)).size).toBe(3)
  expect(x.accepted).toHaveBeenCalledTimes(3); await x.controller.dispose()
})
test('page frames enter the same immutable FIFO without taking another live screenshot or merging identical items', async () => {
  const x = harness(); await x.controller.start('window:1')
  expect(x.controller.requestPageCapture).toBeTypeOf('function')
  for (const cellId of ['r0c0','r0c1']) {
    expect(x.controller.requestPageCapture({ pageId: 'page-one', cellId, frame: { ocrImage: x.frames[0], width: 3840, height: 2160, roi: { x: 0, y: 0, width: 3840, height: 2160 }, captureMs: 75 } })).toBe('started')
    await x.controller.drain()
  }
  expect(x.captureFrame).not.toHaveBeenCalled()
  expect(x.snap().jobs.map(job => job.cellId)).toEqual(['r0c0','r0c1'])
  expect(x.snap().jobs.map(job => job.state)).toEqual(['pending','pending'])
  expect(x.snap().jobs[0].diagnostic?.captureMs).toBe(75)
  await x.controller.dispose()
})
test('one 32-cell page can remain pending without stopping at the manual 20-item limit', async () => {
  const x = harness(); await x.controller.start('window:1')
  for (let i = 0; i < 32; i++) {
    const cellId = `r${Math.floor(i / 8)}c${i % 8}`
    expect(x.controller.requestPageCapture({ pageId: 'page-one', cellId, frame: { ocrImage: x.frames[0], width: 3840, height: 2160, roi: { x: 0, y: 0, width: 3840, height: 2160 } } })).toBe('started')
    await x.controller.drain()
  }
  expect(x.snap().jobs).toHaveLength(32)
  expect(x.snap().jobs.every(job => job.state === 'pending')).toBe(true)
  expect(x.snap().jobs.at(-1)?.cellId).toBe('r3c7')
  await x.controller.dispose()
})
test('page batch keeps the 60-item ceiling and never drops pending work', async () => {
  const x = harness(); await x.controller.start('window:1')
  const frame = { ocrImage: x.frames[0], width: 3840, height: 2160, roi: { x: 0, y: 0, width: 3840, height: 2160 } }
  for (let i = 0; i < 60; i++) {
    expect(x.controller.requestPageCapture({ pageId: 'page-one', cellId: `r${Math.floor(i / 8)}c${i % 8}`, frame })).toBe('started')
    await x.controller.drain()
  }
  expect(x.controller.requestPageCapture({ pageId: 'page-one', cellId: 'r7c4', frame })).toBe('capacity')
  expect(x.snap().jobs).toHaveLength(60)
  expect(x.snap().jobs.every(job => job.state === 'pending')).toBe(true)
  await x.controller.dispose()
})
test('a trigger during actual frame acquisition is rejected, never deferred or coalesced', async () => {
  const x = harness(), held = gate<Awaited<ReturnType<typeof x.captureFrame>>>()
  x.captureFrame.mockImplementationOnce(() => held.promise)
  await x.controller.start('window:1')
  expect(x.controller.requestCapture()).toBe('started')
  expect(x.controller.requestCapture()).toBe('capture-busy')
  held.resolve({ ocrImage: x.frames[0], width: 3840, height: 2160, roi: { x: 0, y: 0, width: 3840, height: 2160 } })
  await x.controller.drain(); expect(x.captureFrame).toHaveBeenCalledTimes(1); await x.controller.dispose()
})
test('ordinary failure preserves the original for retry and does not block the next image or auto-recapture', async () => {
  const x = harness(); x.recognize.mockRejectedValueOnce(new Error('bad image'))
  await x.controller.start('window:1'); x.controller.requestCapture(); await x.controller.drain()
  const failed = x.snap().jobs[0]; expect(failed.state).toBe('failed'); expect(x.captureFrame).toHaveBeenCalledTimes(1)
  x.controller.requestCapture(); await x.controller.drain()
  x.controller.retryJob(failed.id); await x.controller.drain()
  expect(x.seen.at(-1)).toBe(x.frames[0]); expect(x.captureFrame).toHaveBeenCalledTimes(2)
  expect(x.snap().jobs.every(j => j.state === 'pending')).toBe(true); await x.controller.dispose()
})
test('capacity counts failures and success together; discarding frees a slot without reusing sequence', async () => {
  const x = harness(); await x.controller.start('window:1')
  x.recognize.mockRejectedValueOnce(new Error('bad'))
  for (let i = 0; i < 20; i++) { expect(x.controller.requestCapture()).toBe('started'); await x.controller.drain() }
  expect(x.controller.requestCapture()).toBe('capacity'); expect(x.snap().jobs).toHaveLength(20)
  x.controller.discardJob(x.snap().jobs[0].id)
  expect(x.controller.requestCapture()).toBe('started'); await x.controller.drain()
  expect(x.snap().jobs.at(-1)?.sequence).toBe(21); await x.controller.dispose()
})
test('pause drains frozen frames and resume does not replace the batch', async () => {
  const x = harness(), held = gate<OcrDraftResult>(); x.recognize.mockImplementationOnce(() => held.promise)
  await x.controller.start('window:1'); x.controller.requestCapture(); await vi.waitFor(() => expect(x.captured).toHaveBeenCalledOnce())
  x.controller.pauseCapture(); expect(x.controller.requestCapture()).toBe('inactive')
  const batch = x.snap().batchId; held.resolve(result()); await x.controller.drain()
  expect(x.snap().jobs[0].state).toBe('pending'); x.controller.resumeCapture(); expect(x.snap().batchId).toBe(batch)
  await expect(x.controller.start('window:2')).rejects.toThrow(/本批|任务|核对/)
  await x.controller.dispose()
})
test('discarding active OCR and cancelling a batch ignore late results and release all resources', async () => {
  const x = harness(), held = gate<OcrDraftResult>(); x.recognize.mockImplementationOnce(() => held.promise)
  await x.controller.start('window:1'); x.controller.requestCapture(); await vi.waitFor(() => expect(x.recognize).toHaveBeenCalledOnce())
  x.controller.discardJob(x.snap().jobs[0].id)
  const draining = x.controller.drain(); await x.controller.cancelBatch()
  await expect(draining).rejects.toMatchObject({ name: 'AbortError' })
  held.resolve(result()); await Promise.resolve(); await Promise.resolve()
  expect(x.accepted).not.toHaveBeenCalled(); expect(x.snap().jobs).toHaveLength(0); expect(x.snap().heldSourceBytes).toBe(0)
  await x.controller.dispose()
})
test('source loss stops new capture without cancelling the frozen OCR queue', async () => {
  const x = harness(), held = gate<OcrDraftResult>(); x.recognize.mockImplementationOnce(() => held.promise)
  await x.controller.start('window:1'); x.controller.requestCapture(); await vi.waitFor(() => expect(x.captured).toHaveBeenCalledOnce())
  x.captureFrame.mockRejectedValueOnce(new Error('source closed')); x.controller.requestCapture()
  await vi.waitFor(() => expect(x.snap().accepting).toBe(false)); held.resolve(result()); await x.controller.drain()
  expect(x.snap().jobs[0].state).toBe('pending'); expect(x.accepted).toHaveBeenCalledOnce(); await x.controller.dispose()
})
test('engine failure pauses preserved images until explicit recovery rather than auto restart', async () => {
  const x = harness(); x.recognize.mockRejectedValueOnce(Object.assign(new Error('engine exited'), { kind: 'engine-unavailable' }))
  await x.controller.start('window:1'); x.controller.requestCapture()
  await vi.waitFor(() => expect(x.snap().ocrPaused).toBe(true))
  await expect(x.controller.drain()).rejects.toThrow(/engine exited/)
  expect(x.controller.requestCapture()).toBe('engine-paused')
  await x.controller.recoverOcr(); await x.controller.drain()
  expect(x.snap().jobs[0].state).toBe('pending'); expect(x.captureFrame).toHaveBeenCalledOnce(); await x.controller.dispose()
})
