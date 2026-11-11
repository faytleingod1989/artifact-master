export function findTextBands(pixels: Uint8ClampedArray, width: number, height: number, scanRatio = .6) {
  const rows: number[] = []
  for (let y = 0; y < height; y++) {
    let count = 0
    // Locate rows from the text's left column, not distant stars/particles on the right.
    for (let x = 0; x < width * scanRatio; x++) if (pixels[(y * width + x) * 4] < 128) count++
    if (count >= Math.max(6, width * .012)) rows.push(y)
  }
  const groups: Array<{ start: number; end: number }> = []
  for (const y of rows) { const last = groups.at(-1); if (last && y - last.end <= 8) last.end = y; else groups.push({ start: y, end: y }) }
  return groups.filter(group => group.end - group.start >= 10).map(group => ({ y: Math.max(0, group.start - 4), height: Math.min(height - Math.max(0, group.start - 4), group.end - group.start + 9) }))
}
