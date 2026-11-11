import { test, expect } from '@playwright/test'
import path from 'node:path'

test('right-aligned main value retains both ones in the original 311 plume', async ({ page }) => {
  test.setTimeout(60000)
  await page.route('**/__plume.png', route => route.fulfill({ contentType: 'image/png', path: path.resolve('../../bc截图/ScreenShot_2026-10-01_200932_297.png') }))
  await page.goto('/')
  const main = await page.evaluate(async () => {
    const { createOcrSession } = await import('/src/artifacts/ocrService.ts')
    const session = await createOcrSession()
    try { return (await session.recognize(await (await fetch('/__plume.png')).blob())).draft.main }
    finally { await session.dispose() }
  })
  expect(main).toEqual({ key: 'atkFlat', value: 311 })
})

for (const automatic of [false, true]) test(`dark-on-light card preview preserves level, left-aligned main and all four substats (${automatic ? 'automatic location replay' : 'detail preprocessing'})`, async ({ page }) => {
  test.setTimeout(60000)
  // This is an explicitly low-resolution replay of the supplied UI preview,
  // not an original-game screenshot or a claim of native 4K acceptance.
  await page.route('**/__card_preview.png', route => route.fulfill({ contentType: 'image/png', path: path.resolve('../../docs/ocr/2026-10-14-实时录入识别失败.png') }))
  await page.goto('/')
  const result = await page.evaluate(async automatic => {
    const { createOcrSession } = await import('/src/artifacts/ocrService.ts')
    const input = await (await fetch('/__card_preview.png')).blob()
    const bitmap = await createImageBitmap(input), canvas = document.createElement('canvas')
    canvas.width = 648; canvas.height = 738
    canvas.getContext('2d')!.drawImage(bitmap, 57, 75, 216, 246, 0, 0, 648, 738); bitmap.close()
    const full = document.createElement('canvas'); full.width = 3840; full.height = 2160
    const context = full.getContext('2d')!; context.fillStyle = '#183149'; context.fillRect(0, 0, full.width, full.height)
    context.drawImage(canvas, 0, 0, 648, 738, 2666, 272, 936, 1066)
    const image = await new Promise<Blob>(resolve => (automatic ? full : canvas).toBlob(blob => resolve(blob!), 'image/png'))
    const session = await createOcrSession()
    try { return (await session.recognize(image, automatic ? undefined : { x: 0, y: 0, width: 648, height: 738 })).draft }
    finally { await session.dispose() }
  }, automatic)
  expect(result.level).toBe(17)
  expect(result.main).toEqual({ key: 'hpFlat', value: 4171 })
  expect(result.subs).toEqual([{ key: 'critDamage', value: 6.2 }, { key: 'atkFlat', value: 27 }, { key: 'critRate', value: 3.5 }, { key: 'elementalMastery', value: 63 }])
})
