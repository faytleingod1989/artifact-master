import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ArtifactOcrText } from './artifactOcr'
import { formatArtifactOcrText, prepareArtifactOcrImages } from './artifactOcrImage'

type CanvasProbe = {
  canvas: HTMLCanvasElement
  context: { filter: string; drawImage: ReturnType<typeof vi.fn>; getImageData: ReturnType<typeof vi.fn>; putImageData: ReturnType<typeof vi.fn> }
  blob: Blob
}

function installImageCanvas(width: number, height: number, pixelValues = [220, 100, 30, 255], encode = true): CanvasProbe {
  const pixels = new Uint8ClampedArray(pixelValues)
  const context = {
    filter: '',
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data: pixels, width: 1, height: 1 })),
    putImageData: vi.fn(),
  }
  const blob = new Blob(['png'], { type: 'image/png' })
  const canvas = { width: 0, height: 0, getContext: vi.fn(() => context), toBlob: vi.fn((callback: BlobCallback) => callback(encode ? blob : null)) } as unknown as HTMLCanvasElement
  class FakeImage {
    naturalWidth = width
    naturalHeight = height
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    set src(_value: string) { queueMicrotask(() => this.onload?.()) }
  }
  vi.stubGlobal('Image', FakeImage)
  vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => tagName === 'canvas' ? canvas : document.createElement(tagName))
  return { canvas, context, blob }
}

afterEach(() => vi.restoreAllMocks())

describe('formatArtifactOcrText', () => {
  it('uses the exact labelled three-region form', () => {
    const text: ArtifactOcrText = { title: '名称', stats: '属性', set: '套装' }
    expect(formatArtifactOcrText(text)).toBe('【名称与部位】\n名称\n\n【属性】\n属性\n\n【套装】\n套装')
  })
})

describe('prepareArtifactOcrImages', () => {
  it('returns landscape regions in title, stats, set order and applies OCR preprocessing', async () => {
    const probe = installImageCanvas(2000, 1000)
    const createObjectURL = vi.fn(() => 'blob:test')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })

    const result = await prepareArtifactOcrImages(new Blob(['image']))

    expect(result.mode).toBe('regional')
    expect(result.regions.map(({ id }) => id)).toEqual(['title', 'stats', 'set'])
    expect(result.regions).toHaveLength(3)
    expect(result.regions.every(({ image }) => image.type === 'image/png')).toBe(true)
    expect(probe.canvas.width).toBeGreaterThanOrEqual(1600)
    expect(probe.context.filter).toBe('grayscale(1)')
    expect(probe.context.putImageData).toHaveBeenCalled()
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test')
  })

  it('applies the 155 threshold boundary exactly once after explicit contrast', async () => {
    const probe = installImageCanvas(1000, 1000, [143, 143, 143, 255])
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:threshold'), revokeObjectURL: vi.fn() })

    await prepareArtifactOcrImages(new Blob(['image']))

    const written = probe.context.putImageData.mock.calls[0][0] as ImageData
    expect(Array.from(written.data.slice(0, 4))).toEqual([255, 255, 255, 255])
  })

  it('rejects PNG encoding failures and revokes the object URL', async () => {
    installImageCanvas(1000, 1000, undefined, false)
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:png-fail'), revokeObjectURL })

    await expect(prepareArtifactOcrImages(new Blob(['image']))).rejects.toThrow('PNG encoding failed')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:png-fail')
  })

  it('returns a full image for non-landscape input without cropping', async () => {
    const probe = installImageCanvas(1000, 1000)
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:square'), revokeObjectURL: vi.fn() })

    const result = await prepareArtifactOcrImages(new Blob(['image']))

    expect(result).toEqual({ mode: 'full', regions: [{ id: 'full', image: probe.blob }] })
    expect(probe.context.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 1600)
  })

  it('rejects decode failures with a readable error and still revokes the object URL', async () => {
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:bad'), revokeObjectURL })
    class BrokenImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) { queueMicrotask(() => this.onerror?.()) }
    }
    vi.stubGlobal('Image', BrokenImage)

    await expect(prepareArtifactOcrImages(new Blob(['bad']))).rejects.toThrow('Unable to decode artifact image')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:bad')
  })
})
