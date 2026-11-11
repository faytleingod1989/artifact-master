import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createCaptureSession } from './realtimeCapture'
const quality = vi.hoisted(() => ({ usable: true }))
vi.mock('./capture/frameQuality', () => ({ isUsableFrame: vi.fn(async () => quality.usable) }))
function surfaces(failPlay = false) {
  const stop = vi.fn(); const track = { stop, readyState: 'live' }
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] }
  const getUserMedia = vi.fn(async () => stream)
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
  const video = { muted: false, playsInline: false, srcObject: null, readyState: 1, videoWidth: 3840, videoHeight: 2160, play: vi.fn(async () => { if (failPlay) throw new Error('play failed') }), pause: vi.fn() }
  const drawImage = vi.fn(); const canvas = { width: 0, height: 0, getContext: () => ({ drawImage }), toBlob: (callback: BlobCallback) => callback(new Blob(['frame'], { type: 'image/png' })) }
  vi.spyOn(document, 'createElement').mockImplementation((tag) => (tag === 'video' ? video : canvas) as unknown as HTMLElement)
  return { stop, getUserMedia, video, canvas, drawImage }
}
beforeEach(() => { quality.usable = true })
afterEach(() => { vi.restoreAllMocks(); delete window.artifactDesktop })
test('captures native detail pixels without the previous 1920 cap or 1280 resize', async () => {
  const s = surfaces(); const roi = { x: 3000, y: 100, width: 800, height: 1000 }
  const session = await createCaptureSession('window:1:0', roi)
  const frame = await session.captureFrame()
  expect(frame).toMatchObject({ width: 3840, height: 2160, roi })
  expect(frame.ocrImage.type).toBe('image/png')
  expect([s.canvas.width, s.canvas.height]).toEqual([800, 1000])
  expect(s.drawImage).toHaveBeenCalledWith(s.video, 3000, 100, 800, 1000, 0, 0, 800, 1000)
  expect(JSON.stringify(s.getUserMedia.mock.calls)).not.toContain('1920')
  session.stop(); session.stop(); expect(s.stop).toHaveBeenCalledOnce()
})
test('initialization failure stops tracks and does not leave a source running', async () => {
  const s = surfaces(true)
  await expect(createCaptureSession('window:1:0')).rejects.toThrow()
  expect(s.stop).toHaveBeenCalledOnce()
})
test('blank frames and changed resolution require user action instead of a draft', async () => {
  const s = surfaces(); const session = await createCaptureSession('window:1:0', { x: 100, y: 0, width: 800, height: 1000 })
  quality.usable = false; await expect(session.captureFrame()).rejects.toThrow(/黑屏|空白/)
  quality.usable = true; s.video.videoWidth = 4096
  await expect(session.captureFrame()).rejects.toThrow(/尺寸.*重新选择来源/)
  session.stop()
})

test('window capture uses fresh native-window frames when the legacy video source cannot start', async () => {
  const s = surfaces()
  s.getUserMedia.mockRejectedValue(new Error('Could not start video source'))
  let index = 0
  Object.assign(window, { artifactDesktop: { captureWindowFrame: async (sourceId: string) => ({ sourceId, width: 3840, height: 2160, image: 'data:image/png;base64,' + btoa(`native-frame-${++index}`) }) } })
  const session = await createCaptureSession('window:456:0')
  const first = await session.captureFrame(), second = await session.captureFrame()
  expect(first).toMatchObject({ width: 3840, height: 2160, roi: { x: 0, y: 0, width: 3840, height: 2160 } })
  expect(await first.ocrImage.text()).toBe('native-frame-2')
  expect(await second.ocrImage.text()).toBe('native-frame-3')
  expect(s.getUserMedia).not.toHaveBeenCalled()
  session.stop()
  await expect(session.captureFrame()).rejects.toThrow(/停止/)
})

test('native window capture rejects wrong-window and nonlocal frames instead of opening a screen or URL', async () => {
  const s = surfaces()
  const fetchSpy = vi.spyOn(globalThis, 'fetch')
  Object.assign(window, { artifactDesktop: { captureWindowFrame: async () => ({ sourceId: 'window:999:0', width: 3840, height: 2160, image: 'https://outside.invalid/image.png' }) } })
  await expect(createCaptureSession('window:456:0')).rejects.toThrow(/窗口帧无效/)
  expect(fetchSpy).not.toHaveBeenCalled()
  expect(s.getUserMedia).not.toHaveBeenCalled()
})

test('stopping a native window session rejects a late snapshot and black frames cannot start it', async () => {
  surfaces()
  let finish!: () => void, count = 0
  Object.assign(window, { artifactDesktop: { captureWindowFrame: async (sourceId: string) => { if (++count > 1) await new Promise<void>(resolve => { finish = resolve }); return { sourceId, width: 3840, height: 2160, image: 'data:image/png;base64,' + btoa('frame') } } } })
  const session = await createCaptureSession('window:456:0')
  const late = session.captureFrame(); session.stop(); finish()
  await expect(late).rejects.toThrow(/停止/)
  quality.usable = false
  Object.assign(window, { artifactDesktop: { captureWindowFrame: async (sourceId: string) => ({ sourceId, width: 3840, height: 2160, image: 'data:image/png;base64,' + btoa('black') }) } })
  await expect(createCaptureSession('window:456:0')).rejects.toThrow(/黑屏|空白/)
})
