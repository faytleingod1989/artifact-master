import { getArtifactOcrRegions, type ArtifactOcrText } from './artifactOcr'
import { findTextBands } from './ocrTextBands'
import { prepareCardDetailImages } from './cardDetailOcr'
import { findOccludedSubstats } from './ocrOcclusion'

export type PreparedArtifactOcrImages = {
  mode: 'regional' | 'full'
  regions: Array<{ id: 'title' | 'stats' | 'set' | 'full'; image: Blob }>
}

type SourceImage = {
  image: HTMLImageElement
  width: number
  height: number
}

function decodeImage(url: string): Promise<SourceImage> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const width = image.naturalWidth
      const height = image.naturalHeight
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        reject(new Error('Unable to decode artifact image: invalid dimensions'))
        return
      }
      resolve({ image, width, height })
    }
    image.onerror = () => reject(new Error('Unable to decode artifact image'))
    image.src = url
  })
}

function scaledDimensions(width: number, height: number): { width: number; height: number } {
  const longest = Math.max(width, height)
  const targetLongest = Math.max(longest, Math.min(1600, longest * 2.5))
  const scale = targetLongest / longest
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

function encodeCrop(source: SourceImage, crop: { x: number; y: number; width: number; height: number }, fullImage = false): Promise<Blob> {
  const dimensions = scaledDimensions(crop.width, crop.height)
  const canvas = document.createElement('canvas')
  canvas.width = dimensions.width
  canvas.height = dimensions.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Unable to preprocess artifact image: canvas unavailable')

  context.filter = 'grayscale(1)'
  if (fullImage) context.drawImage(source.image, 0, 0, dimensions.width, dimensions.height)
  else context.drawImage(source.image, crop.x, crop.y, crop.width, crop.height, 0, 0, dimensions.width, dimensions.height)
  const pixels = context.getImageData(0, 0, dimensions.width, dimensions.height)
  for (let index = 0; index < pixels.data.length; index += 4) {
    const luminance = 0.299 * pixels.data[index] + 0.587 * pixels.data[index + 1] + 0.114 * pixels.data[index + 2]
    const grayscale = Math.round(luminance)
    const contrasted = Math.round((grayscale - 128) * 1.8 + 128)
    const value = contrasted >= 155 ? 255 : 0
    pixels.data[index] = value
    pixels.data[index + 1] = value
    pixels.data[index + 2] = value
  }
  context.putImageData(pixels, 0, 0)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Unable to preprocess artifact image: PNG encoding failed')), 'image/png')
  })
}

export async function prepareArtifactOcrImages(file: Blob): Promise<PreparedArtifactOcrImages> {
  const objectUrl = URL.createObjectURL(file)
  try {
    const source = await decodeImage(objectUrl)
    const regions = getArtifactOcrRegions(source.width, source.height)
    if (!regions) {
      const image = await encodeCrop(source, { x: 0, y: 0, width: source.width, height: source.height }, true)
      return { mode: 'full', regions: [{ id: 'full', image }] }
    }
    const prepared = []
    for (const region of regions) prepared.push({ id: region.id, image: await encodeCrop(source, region) })
    return { mode: 'regional', regions: prepared }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Unable to')) throw error
    throw new Error(`Unable to preprocess artifact image: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export function formatArtifactOcrText(text: ArtifactOcrText): string {
  return `【名称与部位】\n${text.title}\n\n【属性】\n${text.stats}\n\n【套装】\n${text.set}`
}

// Input is a confirmed detail crop, from the title to the set-name line, not the whole screen.
export type DetailOcrImage = { id: 'title' | 'stats' | 'set'; image: Blob; rawImage?: Blob; width?: number; height?: number; numeric?: boolean; join?: boolean; subIndex?: number; occluded?: boolean }

function tightNumericCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const context = source.getContext('2d')
  if (!context) throw Error('无法准备数字图像。')
  const pixels = context.getImageData(0, 0, source.width, source.height).data
  let left = source.width, right = -1, top = source.height, bottom = -1
  for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) if (pixels[(y * source.width + x) * 4] < 128) {
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y)
  }
  if (right < left || bottom < top) return source
  const pad = 24, width = right - left + 1, height = bottom - top + 1
  const canvas = document.createElement('canvas'); canvas.width = width + pad * 2; canvas.height = height + pad * 2
  const target = canvas.getContext('2d'); if (!target) throw Error('无法准备数字边距。')
  target.fillStyle = '#fff'; target.fillRect(0, 0, canvas.width, canvas.height)
  // Keep every ink pixel at its original scale; this only removes excess white
  // space. Wide empty margins made the recognizer merge the two ones in 311.
  target.drawImage(source, left, top, width, height, pad, pad, width, height)
  return canvas
}

export async function prepareDetailOcrImages(file: Blob): Promise<DetailOcrImage[]> {
  const url = URL.createObjectURL(file)
  try {
    const source = await decodeImage(url)
    const card = await prepareCardDetailImages(source.image, source.width, source.height)
    if (card) return card
    const regions = [['title', 0, .24], ['stats', .22, .72], ['set', .91, .09]] as const
    const prepared: DetailOcrImage[] = []
    for (const [id, top, height] of regions) {
      const y = Math.floor(source.height * top)
      const crop = { x: 0, y, width: source.width, height: Math.min(Math.ceil(source.height * height), source.height - y) }
      // Preserve native color and resolution; increase only small text crops. Never shrink before cropping.
      const size = scaledDimensions(crop.width, crop.height)
      const canvas = document.createElement('canvas'); canvas.width = size.width; canvas.height = size.height
      const context = canvas.getContext('2d'); if (!context) throw new Error('无法准备本地识别图像。')
      context.drawImage(source.image, crop.x, crop.y, crop.width, crop.height, 0, 0, size.width, size.height)
      const native = document.createElement('canvas'); native.width = size.width; native.height = size.height
      native.getContext('2d')!.drawImage(canvas, 0, 0)
      // Game detail text is pale neutral (title/stats) or green (set). Convert those
      // colors to dark ink, rather than letting background sparkles become letters.
      const pixels = context.getImageData(0, 0, size.width, size.height)
      const colorPixels = id === 'stats' ? new Uint8ClampedArray(pixels.data) : undefined
      for (let i = 0; i < pixels.data.length; i += 4) {
        const r = pixels.data[i], g = pixels.data[i + 1], b = pixels.data[i + 2]
        const ink = id === 'set' ? g > 175 && g > r * 1.15 && g > b * 1.1 : Math.min(r, g, b) > 180 && Math.max(r, g, b) - Math.min(r, g, b) < 65
        const value = ink ? 0 : 255
        pixels.data[i] = value; pixels.data[i + 1] = value; pixels.data[i + 2] = value; pixels.data[i + 3] = 255
      }
      context.putImageData(pixels, 0, 0)
      const bands = findTextBands(pixels.data, size.width, size.height, id === 'stats' ? .28 : .6)
      const occludedRows = colorPixels ? findOccludedSubstats(colorPixels, size.width, size.height, bands.slice(2)) : []
      for (const [index, band] of (bands.length ? bands : [{ y: 0, height: size.height }]).entries()) {
        // The main value font is taller than its left-hand label. Left-column bands alone clip digits.
        const pad = id === 'stats' && index === 0 ? Math.ceil(band.height * .6) : 0
        const lineTop = Math.max(0, band.y - pad), lineHeight = Math.min(size.height - lineTop, band.height + pad * 2)
        // The second stats band is +level. Recognize it as digits, not Chinese (+0 was read as +0O).
        const parts = id === 'stats' && index === 0 ? [{ x: 0, width: Math.round(size.width * .6), numeric: false, join: false }, { x: Math.round(size.width * .6), width: size.width - Math.round(size.width * .6), numeric: true, join: true }] : [{ x: 0, width: size.width, numeric: id === 'stats' && index === 1, join: false }]
        for (const part of parts) {
        const line = document.createElement('canvas'); line.width = part.width + 24; line.height = lineHeight + 24
        const lineContext = line.getContext('2d'); if (!lineContext) throw new Error('无法准备文字行。')
        lineContext.fillStyle = '#fff'; lineContext.fillRect(0, 0, line.width, line.height)
        lineContext.drawImage(canvas, part.x, lineTop, part.width, lineHeight, 12, 12, part.width, lineHeight)
        const ocrLine = part.numeric && part.join ? tightNumericCanvas(line) : line
        const image = await new Promise<Blob>((resolve, reject) => ocrLine.toBlob(blob => blob ? resolve(blob) : reject(new Error('无法编码详情图像。')), 'image/png'))
        lineContext.fillStyle = '#fff'; lineContext.fillRect(0, 0, line.width, line.height)
        lineContext.drawImage(native, part.x, lineTop, part.width, lineHeight, 12, 12, part.width, lineHeight)
        const rawImage = await new Promise<Blob>((resolve, reject) => line.toBlob(blob => blob ? resolve(blob) : reject(new Error('无法编码数字复核图像。')), 'image/png'))
        prepared.push({ id, image, rawImage, width: ocrLine.width, height: ocrLine.height, numeric: part.numeric, join: part.join, ...(id === 'stats' && index >= 2 ? { subIndex: index - 1, occluded: occludedRows.includes(index - 1) } : {}) })
        }
      }
    }
    return prepared
  } finally { URL.revokeObjectURL(url) }
}
