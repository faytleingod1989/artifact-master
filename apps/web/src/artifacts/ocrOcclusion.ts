type TextRow = { y: number; height: number }
export function findOccludedSubstats(pixels: Uint8ClampedArray, width: number, height: number, rows: TextRow[]): number[] {
  if (!rows.length || pixels.length !== width * height * 4) return []
  const top = Math.max(0, rows[0].y), bottom = Math.min(height, rows.at(-1)!.y + rows.at(-1)!.height)
  // Text stems fit inside one row. A saturated streak taller than a whole text
  // row plus padding is a foreground effect, not another numeric character.
  const threshold = Math.max(32, ...rows.map(row => row.height + 12))
  const affected = new Set<number>()
  for (let x = 0; x < width * .94; x += 2) {
    let start = -1
    const finish = (end: number) => {
      if (start >= 0 && end - start > threshold) rows.forEach((row, index) => { if (start < row.y + row.height && end > row.y) affected.add(index + 1) })
    }
    for (let y = top; y < bottom; y++) {
      const i = (y * width + x) * 4
      const white = pixels[i] > 248 && pixels[i + 1] > 248 && pixels[i + 2] > 248
      if (white && start < 0) start = y
      if (!white && start >= 0) { finish(y); start = -1 }
    }
    finish(bottom)
  }
  return [...affected].sort((a, b) => a - b)
}
