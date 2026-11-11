import type { CaptureRoi } from '../capture/captureRegion'
import { OcrImageRejectedError } from './ocrImageRejection'

type Band = { top: number; bottom: number; left: number; right: number }
export function findDetailRegionPixels(pixels: Uint8ClampedArray, width: number, height: number, tile: CaptureRoi = { x: 0, y: 0, width, height }): CaptureRoi | null {
  if (width < 320 || height < 240 || width / height < 1.3 || ![tile.x, tile.y, tile.width, tile.height].every(Number.isSafeInteger) || tile.x < 0 || tile.y < 0 || tile.width < 1 || tile.height < 1 || tile.x + tile.width > width || tile.y + tile.height > height || pixels.length !== tile.width * tile.height * 4) return null
  const bands = (left: number, right: number, top: number, bottom: number, ink: (r: number, g: number, b: number) => boolean) => {
    const groups: Band[] = []
    left = Math.max(left, tile.x); right = Math.min(right, tile.x + tile.width); top = Math.max(top, tile.y); bottom = Math.min(bottom, tile.y + tile.height)
    for (let y = top; y < bottom; y++) {
      let count = 0, start = right, end = left
      for (let x = left; x < right; x++) {
        const i = ((y - tile.y) * tile.width + x - tile.x) * 4
        if (ink(pixels[i], pixels[i + 1], pixels[i + 2])) { count++; start = Math.min(start, x); end = x }
      }
      if (count < Math.max(6, width * .006)) continue
      const last = groups.at(-1)
      if (last && y - last.bottom <= Math.max(3, Math.round(height * .003))) {
        last.bottom = y; last.left = Math.min(last.left, start); last.right = Math.max(last.right, end)
      } else groups.push({ top: y, bottom: y, left: start, right: end })
    }
    return groups.filter(band => band.bottom - band.top + 1 >= Math.max(8, height * .008))
  }
  const green = bands(Math.floor(width * .6), width, Math.floor(height * .05), Math.floor(height * .8), (r, g, b) => g > 170 && g > r * 1.15 && g > b * 1.1)
    .filter(band => band.right - band.left >= width * .05)
  // First sufficiently wide green text line is the set name; later lines can be active set effects.
  for (const set of green) {
    const margin = Math.max(8, Math.round((set.bottom - set.top + 1) * .18))
    const left = Math.max(0, set.left - margin), right = width - margin
    const titleBands = bands(left, right, Math.max(0, Math.floor(set.top - height * .46)), set.top,
      (r, g, b) => Math.min(r, g, b) > 180 && Math.max(r, g, b) - Math.min(r, g, b) < 65)
      .filter(band => band.left <= set.left + (right - left) * .15 && band.right - band.left >= width * .04)
    if (titleBands.length < 3) continue
    const top = Math.max(0, titleBands[0].top - margin), bottom = Math.min(height, set.bottom + margin + 1)
    if (bottom - top < height * .2 || right - left > width * .4) continue
    return { x: left, y: top, width: right - left, height: bottom - top }
  }
  return null
}

export async function detectArtifactDetail(frame: Blob): Promise<{ image: Blob; roi: CaptureRoi; width: number; height: number }> {
  const bitmap = await createImageBitmap(frame)
  try {
    const scale = Math.min(1, 1920 / bitmap.width, 1080 / bitmap.height)
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('无法分析采集画面。')
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const located = findDetailRegionPixels(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)
    if (!located) throw new OcrImageRejectedError('未找到完整的圣遗物详情。请打开详情页并保持游戏窗口可见，再重新采集；不会把整张画面当作详情识别。')
    const sx = bitmap.width / canvas.width, sy = bitmap.height / canvas.height
    const x = Math.max(0, Math.floor(located.x * sx) - (scale < 1 ? Math.ceil(sx * 2) : 0)), y = Math.max(0, Math.floor(located.y * sy) - (scale < 1 ? Math.ceil(sy * 2) : 0))
    const right = scale < 1 ? bitmap.width - 4 : located.x + located.width
    const bottom = Math.min(bitmap.height, Math.ceil((located.y + located.height) * sy) + (scale < 1 ? Math.ceil(sy * 2) : 0))
    let roi = { x, y, width: right - x, height: bottom - y }
    if (scale < 1) {
      const native = document.createElement('canvas'); native.width = bitmap.width; native.height = bitmap.height
      const refine = native.getContext('2d', { willReadFrequently: true })
      if (!refine) throw Error('无法精确分析详情区域。')
      refine.drawImage(bitmap, 0, 0)
      const tileX = Math.max(0, x - 64), tileY = Math.max(0, y - 32)
      const tile = { x: tileX, y: tileY, width: bitmap.width - tileX, height: Math.min(bitmap.height - tileY, roi.height + 128) }
      const exact = findDetailRegionPixels(refine.getImageData(tile.x, tile.y, tile.width, tile.height).data, bitmap.width, bitmap.height, tile)
      const confirmed = exact ?? findDetailRegionPixels(refine.getImageData(0, 0, bitmap.width, bitmap.height).data, bitmap.width, bitmap.height)
      if (!confirmed) throw new OcrImageRejectedError('原图未能确认完整详情区域，请重新采集。')
      roi = confirmed
      native.width = native.height = 1
    }
    const crop = document.createElement('canvas'); crop.width = roi.width; crop.height = roi.height
    const output = crop.getContext('2d')
    if (!output) throw Error('无法创建详情图像。')
    output.drawImage(bitmap, roi.x, roi.y, roi.width, roi.height, 0, 0, roi.width, roi.height)
    const image = await new Promise<Blob>((resolve, reject) => crop.toBlob(blob => blob ? resolve(blob) : reject(Error('无法保存详情图像。')), 'image/png'))
    return { image, roi, width: bitmap.width, height: bitmap.height }
  } finally { bitmap.close() }
}
