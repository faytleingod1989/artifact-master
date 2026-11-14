import { afterEach, expect, test, vi } from 'vitest'
import { createCaptureController } from './captureController'
import { createManualDraft, ocrToDraft } from '../imports/manualDraft'
import { parseArtifactOcr } from '../artifacts/artifactOcr'
import type { DraftReviewItem } from '../imports/ImportReview'
afterEach(() => vi.restoreAllMocks())
function setup(deferred = false, valid = true) {
  let resolve: (() => void) | undefined; let active = 0; let maximum = 0
  const terminate = vi.fn(async () => {}); const stop = vi.fn(); const items: DraftReviewItem[][] = []; const accepted = vi.fn()
  const recognize = vi.fn(async () => { maximum = Math.max(maximum, ++active); if (deferred) await new Promise<void>(r => { resolve = r }); active--; return { draft: valid ? { ...createManualDraft('zhuying-lieren', '生之花'), level: 0, main: { key: 'hpFlat' as const, value: 717 }, subs: [{ key: 'atkFlat' as const, value: 14 }, { key: 'defFlat' as const, value: 16 }, { key: 'elementalMastery' as const, value: 23 }] } : createManualDraft(), rawText: 'same text', confidence: 90 } })
  const controller = createCaptureController({ createCaptureSession: vi.fn(async () => ({ captureFrame: async () => ({ ocrImage: new Blob(['frame']), width: 3840, height: 2160, roi: { x: 3000, y: 0, width: 800, height: 1000 } }), stop })), createOcrSession: vi.fn(async () => ({ recognize, dispose: terminate })), onItems: next => items.push(next), onStatus: vi.fn(), onAccepted: () => accepted() })
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => `blob:${Math.random()}`), revokeObjectURL: vi.fn() })
  return { controller, recognize, terminate, stop, items, accepted, resolve: () => resolve?.(), currentResolver: () => resolve!, maximum: () => maximum }
}
const roi = { x: 3000, y: 0, width: 800, height: 1000 }

test('success notification occurs only after acceptance, never on discard, full batch or stop', async () => {
  const x = setup(); await x.controller.start('window:1')
  try {
    for (let i = 1; i <= 20; i++) { x.controller.requestCapture(); await vi.waitFor(() => expect(x.items.at(-1)).toHaveLength(i)); expect(x.accepted).toHaveBeenCalledTimes(i) }
    x.controller.requestCapture(); expect(x.accepted).toHaveBeenCalledTimes(20)
    x.controller.discard(x.items.at(-1)![0].draft.draftId); expect(x.accepted).toHaveBeenCalledTimes(20)
    await x.controller.stop(); x.controller.requestCapture(); expect(x.accepted).toHaveBeenCalledTimes(20)
  } finally { await x.controller.dispose() }
})
test('failed and cancelled late OCR never emit success', async () => {
  const invalid = setup(false, false); await invalid.controller.start('window:1')
  invalid.controller.requestCapture(); await vi.waitFor(() => expect(invalid.recognize).toHaveBeenCalledTimes(1))
  expect(invalid.accepted).not.toHaveBeenCalled(); await invalid.controller.dispose()
  const late = setup(true); await late.controller.start('window:1'); late.controller.requestCapture()
  await vi.waitFor(() => expect(late.recognize).toHaveBeenCalledTimes(1)); await late.controller.cancelBatch(); late.resolve()
  await new Promise(resolve => setTimeout(resolve, 0)); expect(late.accepted).not.toHaveBeenCalled(); await late.controller.dispose()
})
test('automatic duplicate skipped frames never emit another success and audio errors cannot undo accepted drafts', async () => {
  vi.useFakeTimers(); const x = setup()
  try {
    x.accepted.mockImplementation(() => { throw new Error('audio device unavailable') })
    await x.controller.start('window:1'); x.controller.setAutoDetect(true)
    await vi.advanceTimersByTimeAsync(2500)
    expect(x.items.at(-1)).toHaveLength(1); expect(x.accepted).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2500)
    expect(x.items.at(-1)).toHaveLength(1); expect(x.accepted).toHaveBeenCalledTimes(1)
  } finally { await x.controller.dispose(); vi.useRealTimers() }
})

test('max twenty previews; explicit repeated captures are not silently merged; discard frees only its preview', async () => {
  const x = setup(); await x.controller.start('window:1', roi)
  for (let i = 0; i < 21; i++) { x.controller.requestCapture(); await vi.waitFor(() => expect(x.items.at(-1)?.length).toBe(Math.min(i + 1, 20))) }
  expect(x.recognize).toHaveBeenCalledTimes(20); expect(x.items.at(-1)).toHaveLength(20)
  // Each source preview was already replaced by its recognized detail preview.
  x.controller.discard(x.items.at(-1)![0].draft.draftId); expect(URL.revokeObjectURL).toHaveBeenCalledTimes(21)
  await x.controller.dispose(); expect(URL.revokeObjectURL).toHaveBeenCalledTimes(40); expect(x.terminate).toHaveBeenCalledTimes(1)
})
test('unrecognized capture is retryable without publishing an empty manual form or stopping the source', async () => {
  const x = setup(false, false); await x.controller.start('window:1', roi)
  x.controller.requestCapture()
  await vi.waitFor(() => expect(x.recognize).toHaveBeenCalledTimes(1))
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(x.items.flat()).toHaveLength(0)
  await x.controller.dispose()
})

test('automatic capture ignores background changes for the same artifact but explicit capture and changed details are retained', async () => {
  vi.useFakeTimers()
  let frameNumber = 0
  vi.stubGlobal('createImageBitmap', async () => ({ width: 3840, height: 2160, close: () => {} }))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: () => {}, getImageData: () => ({ data: new Uint8ClampedArray([++frameNumber, 0, 0, 255]) }) } as unknown as CanvasRenderingContext2D)
  const x = setup()
  try {
    await x.controller.start('window:1')
    x.controller.setAutoDetect(true)
    await vi.advanceTimersByTimeAsync(2500)
    expect(x.items.at(-1)).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(2500)
    expect(x.items.at(-1)).toHaveLength(1)
    x.controller.requestCapture()
    await vi.advanceTimersByTimeAsync(0)
    expect(x.items.at(-1)).toHaveLength(2)
    x.recognize.mockResolvedValueOnce({ draft: { ...createManualDraft('zhuying-lieren', '生之花'), level: 0, main: { key: 'hpFlat', value: 717 }, subs: [{ key: 'atkFlat', value: 16 }, { key: 'defFlat', value: 16 }, { key: 'elementalMastery', value: 23 }] }, rawText: 'changed details', confidence: 90 })
    await vi.advanceTimersByTimeAsync(2500)
    expect(x.items.at(-1)).toHaveLength(3)
  } finally { await x.controller.dispose(); vi.useRealTimers() }
})

test('streaming page auto-commit saves valid 5-star items, frees blobs immediately, and routes duplicates/anomalies to manual review', async () => {
  const validDraft = () => ({ ...createManualDraft('zhuying-lieren', '生之花'), level: 0, main: { key: 'hpFlat' as const, value: 717 }, subs: [{ key: 'atkFlat' as const, value: 14 }, { key: 'defFlat' as const, value: 16 }, { key: 'elementalMastery' as const, value: 23 }] })
  const committed: Array<{ batchId: string; draftId: string }> = []
  let queueSnap: import('./captureQueueTypes').CaptureQueueSnapshot | undefined
  let items: DraftReviewItem[] = []
  let mode: 'commit' | 'dup' | 'warning' = 'commit'
  const recognize = vi.fn(async () => {
    const draft = validDraft()
    if (mode === 'warning') draft.issues.push({ field: 'subs', code: 'ocr-conflict', severity: 'warning', message: '副词条疑似遮挡' })
    return { draft, rawText: 'ocr ok', confidence: 95 }
  })
  const controller = createCaptureController({
    createCaptureSession: vi.fn(async () => ({ captureFrame: async () => ({ ocrImage: new Blob(['frame']), width: 1920, height: 1080, roi }), stop: vi.fn() })),
    createOcrSession: vi.fn(async () => ({ recognize, dispose: vi.fn(async () => {}) })),
    onItems: next => { items = next },
    onQueue: next => { queueSnap = next },
    onStatus: vi.fn(),
    canAutoCommit: () => true,
    onAutoCommit: (draft, batchId) => {
      if (mode === 'dup') return { committed: false, duplicateIds: [12] }
      committed.push({ batchId, draftId: draft.draftId })
      return { committed: true }
    },
  })
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => `blob:${Math.random()}`), revokeObjectURL: vi.fn() })
  try {
    await controller.start('window:1')
    expect(controller.requestPageCapture({ pageId: 'page-1', cellId: 'r0c0', frame: { ocrImage: new Blob(['f1']), width: 1920, height: 1080, roi } })).toBe('started')
    await controller.drain()
    expect(committed).toHaveLength(1)
    expect(committed[0].batchId).toBe(queueSnap?.batchId)
    expect(queueSnap?.autoCommittedCount).toBe(1)
    expect(queueSnap?.heldSourceBytes).toBe(0)
    expect(queueSnap?.jobs).toHaveLength(0)
    expect(items).toHaveLength(0)

    mode = 'dup'
    expect(controller.requestPageCapture({ pageId: 'page-1', cellId: 'r0c1', frame: { ocrImage: new Blob(['f2']), width: 1920, height: 1080, roi } })).toBe('started')
    await controller.drain()
    expect(committed).toHaveLength(1)
    expect(items).toHaveLength(1)
    expect(items[0].draft.issues.some(i => i.code === 'inventory-duplicate' && i.message.includes('#12'))).toBe(true)

    mode = 'warning'
    expect(controller.requestPageCapture({ pageId: 'page-1', cellId: 'r0c2', frame: { ocrImage: new Blob(['f3']), width: 1920, height: 1080, roi } })).toBe('started')
    await controller.drain()
    expect(committed).toHaveLength(1)
    expect(items).toHaveLength(2)
    expect(queueSnap?.heldSourceBytes).toBe(0)
  } finally { await controller.dispose() }
})

test('real parseArtifactOcr + ocrToDraft clean draft auto-commits despite ocr-review warning, while dictionary warnings stay pending and invalid stats fail cleanly', async () => {
  const committed: string[] = []
  let items: DraftReviewItem[] = []
  let queueSnap: import('./captureQueueTypes').CaptureQueueSnapshot | undefined
  let sample: 'clean' | 'dictionary' | 'invalid-main' = 'clean'
  const buildDraft = () => {
    if (sample === 'clean') {
      return ocrToDraft(parseArtifactOcr({
        title: '生之花\n+0',
        stats: '生命值 717\n暴击率+3.1%\n攻击力+19\n暴击伤害+5.4%\n防御力+16',
        set: '影中沉凝的幻灭',
      }), 'realtime')
    }
    if (sample === 'dictionary') {
      return ocrToDraft(parseArtifactOcr({
        title: '献与月的银蝎\n理之完',
        stats: '暴击伤害 62.2%\n+20\n暴击率+10.1%\n元素苑能效率+22.7%\n攻击力+19\n生命值+299',
        set: '晨星与月的晓歌',
      }), 'realtime')
    }
    return ocrToDraft(parseArtifactOcr({
      title: '生之花\n+20',
      stats: '生命值 4781\n暴击率+3.9%\n攻击力+19\n暴击伤害+5.4%\n防御力+16',
      set: '深廊终曲',
    }), 'realtime')
  }
  const controller = createCaptureController({
    createCaptureSession: vi.fn(async () => ({ captureFrame: async () => ({ ocrImage: new Blob(['frame']), width: 1920, height: 1080, roi }), stop: vi.fn() })),
    createOcrSession: vi.fn(async () => ({ recognize: vi.fn(async () => ({ draft: buildDraft(), rawText: sample, confidence: 95 })), dispose: vi.fn(async () => {}) })),
    onItems: next => { items = next },
    onQueue: next => { queueSnap = next },
    onStatus: vi.fn(),
    canAutoCommit: () => true,
    onAutoCommit: draft => { committed.push(draft.draftId); return { committed: true } },
  })
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => `blob:${Math.random()}`), revokeObjectURL: vi.fn() })
  try {
    await controller.start('window:1')
    expect(buildDraft().issues.some(issue => issue.code === 'ocr-review')).toBe(true)

    expect(controller.requestPageCapture({ pageId: 'page-1', cellId: 'r0c0', frame: { ocrImage: new Blob(['c1']), width: 1920, height: 1080, roi } })).toBe('started')
    await controller.drain()
    expect(committed).toHaveLength(1)
    expect(items).toHaveLength(0)

    sample = 'dictionary'
    expect(controller.requestPageCapture({ pageId: 'page-1', cellId: 'r0c1', frame: { ocrImage: new Blob(['c2']), width: 1920, height: 1080, roi } })).toBe('started')
    await controller.drain()
    expect(committed).toHaveLength(1)
    expect(items).toHaveLength(1)
    expect(items[0].draft.issues.some(issue => issue.code === 'dictionary-match')).toBe(true)

    sample = 'invalid-main'
    expect(controller.requestPageCapture({ pageId: 'page-1', cellId: 'r1c0', frame: { ocrImage: new Blob(['c3']), width: 1920, height: 1080, roi } })).toBe('started')
    await controller.drain()
    expect(committed).toHaveLength(1)
    expect(items).toHaveLength(1)
    expect(queueSnap?.jobs.find(job => job.cellId === 'r1c0')?.state).toBe('failed')
  } finally { await controller.dispose() }
})

test('blocks auto-commit for +0 artifact with impossible upgraded substat such as critRate 20%', async () => {
  const committed: string[] = []
  let queueSnap: import('./captureQueueTypes').CaptureQueueSnapshot | undefined
  let items: DraftReviewItem[] = []
  const draft = ocrToDraft(parseArtifactOcr({
    title: '生之花\n+0',
    stats: '生命值 717\n暴击率+20.0%\n攻击力+19\n暴击伤害+5.4%\n防御力+16',
    set: '深廊终曲',
  }), 'realtime')
  const controller = createCaptureController({
    createCaptureSession: vi.fn(async () => ({ captureFrame: async () => ({ ocrImage: new Blob(['frame']), width: 1920, height: 1080, roi }), stop: vi.fn() })),
    createOcrSession: vi.fn(async () => ({ recognize: vi.fn(async () => ({ draft, rawText: 'bad-sub-tier', confidence: 95 })), dispose: vi.fn(async () => {}) })),
    onItems: next => { items = next },
    onQueue: next => { queueSnap = next },
    onStatus: vi.fn(),
    canAutoCommit: () => true,
    onAutoCommit: d => { committed.push(d.draftId); return { committed: true } },
  })
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => `blob:${Math.random()}`), revokeObjectURL: vi.fn() })
  try {
    await controller.start('window:1')
    expect(controller.requestPageCapture({ pageId: 'page-1', cellId: 'r0c0', frame: { ocrImage: new Blob(['c1']), width: 1920, height: 1080, roi } })).toBe('started')
    await controller.drain()
    expect(committed).toHaveLength(0)
    expect(items).toHaveLength(0)
    expect(queueSnap?.jobs.find(job => job.cellId === 'r0c0')?.state).toBe('failed')
  } finally { await controller.dispose() }
})
