import { expect, test } from 'vitest'
import { findArtifactFieldLayoutPixels } from './artifactFieldLayout'

function panel(card = false, subCount = 4) {
  const width = 500, height = 700, pixels = new Uint8ClampedArray(width * height * 4)
  function rect(x: number, y: number, w: number, h: number, color: number[]) {
    for (let row = y; row < y + h; row++) for (let col = x; col < x + w; col++) pixels.set([...color, 255], (row * width + col) * 4)
  }
  rect(0, 0, width, height, card ? [80, 65, 55] : [32, 90, 150])
  if (card) rect(0, 270, width, height - 270, [230, 225, 210])
  const bright = [230, 235, 235], dark = [60, 65, 75]
  for (const y of [15, 75, 140]) rect(15, y, 180, 20, bright)
  if (card) rect(15, 200, 100, 30, bright)
  else rect(350, 135, 120, 35, bright)
  rect(15, 290, 65, 20, card ? dark : bright)
  for (let index = 0; index < subCount; index++) rect(15, 355 + index * 60, index === 3 ? 430 : 280, 20, card ? dark : bright)
  rect(15, 630, 300, 20, [120, 230, 110])
  return { pixels, width, height }
}
test.each([false, true])('classifies original pixel fields without clipping main numbers or dormant annotation (card=%s)', card => {
  const { pixels, width, height } = panel(card)
  const layout = findArtifactFieldLayoutPixels(pixels, width, height)
  expect(layout?.layoutId).toBe(card ? 'inventory-card' : 'equipment-panel')
  expect(layout?.fields.map(field => field.field)).toEqual(['name', 'slot', 'mainName', 'mainValue', 'level', 'sub0', 'sub1', 'sub2', 'sub3', 'set'])
  const last = layout!.fields.find(field => field.field === 'sub3')!
  expect(last.x + last.width).toBeGreaterThanOrEqual(445)
  expect(layout!.fields.every(field => field.x >= 0 && field.y >= 0 && field.x + field.width <= width && field.y + field.height <= height)).toBe(true)
})
test('three active rows do not invent a fourth row from set effects', () => {
  const { pixels, width, height } = panel(false, 3)
  const result = findArtifactFieldLayoutPixels(pixels, width, height)
  expect(result?.fields.filter(field => field.field.startsWith('sub'))).toHaveLength(3)
})
test('rejects incomplete layout and mismatched dimensions rather than guessing', () => {
  expect(findArtifactFieldLayoutPixels(new Uint8ClampedArray(100), 500, 700)).toBeNull()
  const { pixels, width, height } = panel()
  for (let y = 620; y < height; y++) pixels.fill(0, y * width * 4, (y + 1) * width * 4)
  expect(findArtifactFieldLayoutPixels(pixels, width, height)).toBeNull()
})
test('inventory card tolerates an extra star/divider band in header or body without dropping fixed-layout slicing', () => {
  const { pixels, width, height } = panel(true, 4)
  const rect = (x: number, y: number, w: number, h: number, color: number[]) => {
    for (let row = y; row < y + h; row++) for (let col = x; col < x + w; col++) pixels.set([...color, 255], (row * width + col) * 4)
  }
  rect(15, 240, 120, 14, [230, 235, 235])
  rect(15, 575, 160, 14, [60, 65, 75])
  const layout = findArtifactFieldLayoutPixels(pixels, width, height)
  expect(layout?.layoutId).toBe('inventory-card')
  expect(layout?.fields.filter(f => f.field.startsWith('sub'))).toHaveLength(4)
})
