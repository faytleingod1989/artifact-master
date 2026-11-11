import { afterEach, expect, test, vi } from 'vitest'
import { isUsableFrame } from './frameQuality'
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
test.each([[0, false], [255, false], [128, false]])('uniform frame %s is not an artifact capture', async (color, usable) => {
  const bitmap = { width: 100, height: 100, close: vi.fn() }; vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap))
  vi.spyOn(document, 'createElement').mockReturnValue({ getContext: () => ({ drawImage: vi.fn(), getImageData: () => ({ data: new Uint8ClampedArray([color, color, color, 255, color, color, color, 255]) }) }) } as unknown as HTMLCanvasElement)
  expect(await isUsableFrame(new Blob(['frame']))).toBe(usable)
  expect(bitmap.close).toHaveBeenCalledOnce()
})
