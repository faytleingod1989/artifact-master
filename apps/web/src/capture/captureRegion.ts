export type CaptureRoi = { x: number; y: number; width: number; height: number }
export function validateCaptureRoi(roi: CaptureRoi, width: number, height: number): boolean {
  return [width, height, roi.x, roi.y, roi.width, roi.height].every(Number.isSafeInteger) && width > 0 && height > 0 && roi.x >= 0 && roi.y >= 0 && roi.width > 0 && roi.height > 0 && roi.x + roi.width <= width && roi.y + roi.height <= height
}
export function previewToFrameRoi(roi: CaptureRoi, previewWidth: number, previewHeight: number, frameWidth: number, frameHeight: number): CaptureRoi {
  const scaleX = frameWidth / previewWidth; const scaleY = frameHeight / previewHeight
  return { x: Math.round(roi.x * scaleX), y: Math.round(roi.y * scaleY), width: Math.round(roi.width * scaleX), height: Math.round(roi.height * scaleY) }
}
export async function cropDetailRegion(frame: Blob, roi: CaptureRoi): Promise<Blob> {
  const bitmap = await createImageBitmap(frame)
  try {
    if (!validateCaptureRoi(roi, bitmap.width, bitmap.height)) throw new Error('详情区域越界或无效，请保持完整详情可见后重新识别。')
    const canvas = document.createElement('canvas'); canvas.width = roi.width; canvas.height = roi.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('无法创建详情图像。')
    context.drawImage(bitmap, roi.x, roi.y, roi.width, roi.height, 0, 0, roi.width, roi.height)
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('无法保存详情图像。')), 'image/png'))
  } finally { bitmap.close() }
}
