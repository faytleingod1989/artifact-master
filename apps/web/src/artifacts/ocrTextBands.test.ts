import { expect, test } from 'vitest'
import { findTextBands } from './ocrTextBands'
test('splits text rows while joining small glyph gaps and rejecting isolated sparkles', () => {
  const pixels = new Uint8ClampedArray(200 * 150 * 4).fill(255)
  for (const [start, end] of [[10, 29], [55, 75], [110, 132]]) for (let y = start; y <= end; y++) for (let x = 10; x < 150; x++) pixels[(y * 200 + x) * 4] = 0
  pixels[(90 * 200 + 3) * 4] = 0
  expect(findTextBands(pixels, 200, 150).map(({ y, height }) => [y, height])).toEqual([[6, 28], [51, 29], [106, 31]])
})
test('left-label scan separates neighboring stats despite a large bright effect in the number column', () => {
  const width = 400, height = 160, pixels = new Uint8ClampedArray(width * height * 4).fill(255)
  for (const [top, bottom] of [[30, 50], [90, 110]]) for (let y = top; y <= bottom; y++) for (let x = 10; x < 80; x++) pixels[(y * width + x) * 4] = 0
  for (let y = 20; y <= 130; y++) for (let x = 180; x < 230; x++) pixels[(y * width + x) * 4] = 0
  expect(findTextBands(pixels, width, height, .28).map(row => [row.y, row.height])).toEqual([[26, 29], [86, 29]])
})
