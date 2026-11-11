import { afterEach, expect, test, vi } from 'vitest'
import { detectArtifactDetail, findDetailRegionPixels } from './detailDetection'
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

function image(shift = 0) {
  const data = new Uint8ClampedArray(1000 * 600 * 4)
  const fill = (x: number, y: number, width: number, height: number, color: number[]) => {
    for (let row = y; row < y + height; row++) for (let col = x; col < x + width; col++) data.set([...color, 255], (row * 1000 + col) * 4)
  }
  // Left inventory and top right button must not become a title.
  fill(20, 30, 150, 20, [240, 240, 240]); fill(850, 15, 100, 20, [240, 240, 240])
  fill(750, 100 + shift, 160, 20, [240, 240, 240])
  fill(750, 145 + shift, 80, 12, [240, 240, 240])
  fill(750, 180 + shift, 80, 14, [240, 240, 240])
  fill(920, 180 + shift, 45, 14, [240, 240, 240])
  fill(750, 220 + shift, 40, 12, [240, 240, 240])
  fill(750, 250 + shift, 120, 14, [240, 240, 240])
  fill(750, 330 + shift, 180, 18, [160, 235, 130])
  fill(750, 365 + shift, 210, 18, [160, 235, 130])
  return data
}
test.each([0, 60])('automatic ROI follows a vertically shifted detail panel, not inventory or set description (%s)', shift => {
  const roi = findDetailRegionPixels(image(shift), 1000, 600)
  expect(roi).toEqual({ x: 742, y: 92 + shift, width: 250, height: 264 })
})
test('missing green set/title layout is rejected, never falls back to the whole frame', () => {
  expect(findDetailRegionPixels(new Uint8ClampedArray(1000 * 600 * 4), 1000, 600)).toBeNull()
})
test('original-resolution refinement returns the same ROI from a bounded pixel tile', () => {
  const original = image(), tile = { x: 700, y: 60, width: 300, height: 400 }, pixels = new Uint8ClampedArray(tile.width * tile.height * 4)
  for (let y = 0; y < tile.height; y++) pixels.set(original.subarray(((y + tile.y) * 1000 + tile.x) * 4, ((y + tile.y) * 1000 + tile.x + tile.width) * 4), y * tile.width * 4)
  expect(findDetailRegionPixels(pixels, 1000, 600, tile)).toEqual({ x: 742, y: 92, width: 250, height: 264 })
})
function installBitmapCanvases(emptyRefinement = false) {
  const close = vi.fn(), decode = vi.fn(async () => ({ width: 3840, height: 2160, close }))
  vi.stubGlobal('createImageBitmap', decode)
  const canvases: HTMLCanvasElement[] = []
  vi.spyOn(document, 'createElement').mockImplementation(() => {
    const canvas = { width: 0, height: 0, toBlob: (done: BlobCallback) => done(new Blob(['native pixels'])) } as unknown as HTMLCanvasElement
    const context = { drawImage: vi.fn(), getImageData: (left: number, top: number, width: number, height: number) => {
      const data = new Uint8ClampedArray(width * height * 4), sx = canvas.width / 1000, sy = canvas.height / 600
      const fixture = emptyRefinement && canvas.width > 1920 ? new Uint8ClampedArray(1000 * 600 * 4) : image()
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const source = (Math.floor((y + top) / sy) * 1000 + Math.floor((x + left) / sx)) * 4; data.set(fixture.subarray(source, source + 4), (y * width + x) * 4) }
      return { data }
    } }
    canvas.getContext = (() => context) as unknown as typeof canvas.getContext
    canvases.push(canvas); return canvas
  })
  return { canvases, close, decode }
}
test('4K location reads bounded preview pixels but crops the already-decoded original exactly once', async () => {
  const { canvases, close, decode } = installBitmapCanvases()
  const detail = await detectArtifactDetail(new Blob(['4K frame']))
  expect(canvases[0].width).toBeLessThanOrEqual(1920)
  expect(decode).toHaveBeenCalledTimes(1)
  expect(detail.roi.width).toBeGreaterThan(800)
  expect(detail.width).toBe(3840)
  expect(canvases.at(-1)!.width).toBe(detail.roi.width)
  expect(close).toHaveBeenCalledTimes(1)
})
test('a plausible coarse preview cannot authorize a crop when original pixels do not confirm it', async () => {
  installBitmapCanvases(true)
  await expect(detectArtifactDetail(new Blob(['inconsistent source']))).rejects.toThrow(/原图|详情/)
})
