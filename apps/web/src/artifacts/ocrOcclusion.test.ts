import { expect, test } from 'vitest'
import { findOccludedSubstats } from './ocrOcclusion'

test('ordinary white text stems do not trigger an occlusion retry', () => {
  const pixels = new Uint8ClampedArray(100 * 180 * 4)
  const rows = [10, 50, 90, 130].map(y => ({ y, height: 24 }))
  for (const row of rows) for (let y = row.y; y < row.y + 20; y++) pixels.fill(255, (y * 100 + 40) * 4, (y * 100 + 42) * 4)
  expect(findOccludedSubstats(pixels, 100, 180, rows)).toEqual([])
})
test('a tall saturated streak marks only the substat rows it crosses', () => {
  const pixels = new Uint8ClampedArray(100 * 180 * 4)
  const rows = [10, 50, 90, 130].map(y => ({ y, height: 24 }))
  for (let y = 90; y < 154; y++) pixels.fill(255, (y * 100 + 60) * 4, (y * 100 + 62) * 4)
  expect(findOccludedSubstats(pixels, 100, 180, rows)).toEqual([3, 4])
})
