import { afterEach, expect, test, vi } from 'vitest'
import { cropDetailRegion, previewToFrameRoi, validateCaptureRoi } from './captureRegion'
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
test('ROI must be finite integers wholly inside the captured pixel frame', () => {
  expect(validateCaptureRoi({ x: 3000, y: 100, width: 800, height: 1000 }, 3840, 2160)).toBe(true)
  for (const roi of [{ x: -1, y: 0, width: 10, height: 10 }, { x: 0, y: 0, width: 0, height: 10 }, { x: 3700, y: 0, width: 800, height: 100 }, { x: NaN, y: 0, width: 10, height: 10 }]) expect(validateCaptureRoi(roi, 3840, 2160)).toBe(false)
})
test('preview coordinates map back into the actual frame pixels', () => {
  expect(previewToFrameRoi({ x: 750, y: 25, width: 200, height: 250 }, 960, 540, 3840, 2160)).toEqual({ x: 3000, y: 100, width: 800, height: 1000 })
})
test('4K is cropped before any resize, as a lossless 800x1000 PNG', async () => {
  const bitmap = { width: 3840, height: 2160, close: vi.fn() }; vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap))
  const drawImage = vi.fn(); const toBlob = vi.fn((callback: BlobCallback) => callback(new Blob(['png'], { type: 'image/png' })))
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage }), toBlob } as unknown as HTMLCanvasElement
  vi.spyOn(document, 'createElement').mockReturnValue(canvas)
  const roi = { x: 3000, y: 100, width: 800, height: 1000 }
  await cropDetailRegion(new Blob(['frame']), roi)
  expect([canvas.width, canvas.height]).toEqual([800, 1000])
  expect(drawImage).toHaveBeenCalledWith(bitmap, 3000, 100, 800, 1000, 0, 0, 800, 1000)
  expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png')
  expect(bitmap.close).toHaveBeenCalledOnce()
})
