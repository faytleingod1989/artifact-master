import { afterEach, expect, test, vi } from 'vitest'
import { createCaptureController } from './captureController'
import { createManualDraft } from '../imports/manualDraft'
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
