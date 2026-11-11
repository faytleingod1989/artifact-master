import { expect, test, vi } from 'vitest'
import { createCaptureFrameSession } from './captureFrameSession'
const frame = (frameSequence = 1) => ({ sourceId: 'window:123:0', width: 3840, height: 2160, image: 'data:image/png;base64,AA==', frameSequence })
test('rejects stale sequence, wrong source and giant frames without replacing a saved source', async () => {
  const read = vi.fn().mockResolvedValueOnce(frame()).mockResolvedValueOnce(frame()).mockResolvedValueOnce({ ...frame(2), sourceId: 'window:456:0' }).mockResolvedValueOnce({ ...frame(3), width: 9000 })
  const session = createCaptureFrameSession('window:123:0', read)
  expect((await session.read()).frameSequence).toBe(1)
  await expect(session.read()).rejects.toThrow(/过期|新帧/)
  await expect(session.read()).rejects.toThrow(/来源|窗口/)
  await expect(session.read()).rejects.toThrow(/尺寸|窗口/)
})
test('stop releases the persistent reader once and rejects an in-flight late response', async () => {
  let finish!: (value: ReturnType<typeof frame>) => void
  const close = vi.fn(), session = createCaptureFrameSession('window:123:0', () => new Promise(resolve => { finish = resolve }), close)
  const old = session.read()
  session.stop(); session.stop(); finish(frame())
  await expect(old).rejects.toThrow(/停止/)
  expect(close).toHaveBeenCalledTimes(1)
})
