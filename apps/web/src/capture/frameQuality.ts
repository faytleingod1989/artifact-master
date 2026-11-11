export async function isUsableFrame(image: Blob): Promise<boolean> {
  try {
    const bitmap = await createImageBitmap(image)
    try {
      if (!bitmap.width || !bitmap.height) return false
      const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) return false
      context.drawImage(bitmap, 0, 0, 32, 32)
      const { data } = context.getImageData(0, 0, 32, 32)
      let minimum = 255; let maximum = 0; let sum = 0; let count = 0
      for (let i = 0; i < data.length; i += 4) { const value = (data[i] + data[i + 1] + data[i + 2]) / 3; minimum = Math.min(minimum, value); maximum = Math.max(maximum, value); sum += value; count++ }
      return count > 0 && sum / count > 4 && maximum - minimum > 8
    } finally { bitmap.close() }
  } catch { return false }
}
