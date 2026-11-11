import { test, expect } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { createNativeOcrClient } = require('../electron/nativeOcrClient.cjs')

test('optional same-frame footer OCR identifies the real equipped character without guessing a role', async ({ page }) => {
  test.setTimeout(60000)
  const client = createNativeOcrClient(path.resolve('native-ocr/runtime/ArtifactOcrWorker'))
  await page.route('**/__metadata.png', route => route.fulfill({ contentType: 'image/png', path: path.resolve('../../tests/private/ocr/flower-shadow-level20-compare.png') }))
  await page.exposeFunction('__metadataRecognize', async (_id: string, image: string, request: unknown) => client.recognize(image, request))
  try {
    await client.start(); await page.goto('/')
    const result = await page.evaluate(async () => {
      const { createNativeOcrSession } = await import('/src/artifacts/nativeOcrService.ts')
      const session = await createNativeOcrSession({ open: async () => 'metadata-session', close: async () => {}, recognize: (window as unknown as { __metadataRecognize: (id: string, image: string, request: unknown) => Promise<never> }).__metadataRecognize }, { captureMetadata: true })
      try { return (await session.recognize(await (await fetch('/__metadata.png')).blob())).draft.sourceCharacterId }
      finally { await session.dispose() }
    })
    expect(result).toBe(10000133)
  } finally { client.dispose() }
})

test('real original fields remain in original coordinates and are reviewable without manual crop', async ({ page }) => {
  await page.route('**/__native_layout.png', route => route.fulfill({ contentType: 'image/png', path: path.resolve('../../bc截图/ScreenShot_2026-10-01_200932_297.png') }))
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const { detectArtifactDetail } = await import('/src/artifacts/detailDetection.ts')
    const { detectArtifactFieldLayout } = await import('/src/artifacts/artifactFieldLayout.ts')
    const detail = await detectArtifactDetail(await (await fetch('/__native_layout.png')).blob())
    const layout = await detectArtifactFieldLayout(detail.image)
    if (!layout) return null
    const bitmap = await createImageBitmap(detail.image)
    document.body.replaceChildren(); document.body.style.cssText = 'background:#101b2e;color:white;display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:16px'
    for (const field of layout.fields) {
      const article = document.createElement('article'), label = document.createElement('p'), canvas = document.createElement('canvas')
      label.textContent = JSON.stringify(field); canvas.width = field.width; canvas.height = field.height
      canvas.style.cssText = 'max-width:100%;height:auto;border:1px solid gold'
      canvas.getContext('2d')!.drawImage(bitmap, field.x, field.y, field.width, field.height, 0, 0, field.width, field.height)
      article.append(label, canvas); document.body.append(article)
    }
    bitmap.close(); return { ...layout, roi: detail.roi }
  })
  expect(result?.fields.map(field => field.field)).toEqual(['name', 'slot', 'mainName', 'mainValue', 'level', 'sub0', 'sub1', 'sub2', 'sub3', 'set'])
  const directory = 'C:/Users/Administrator/AppData/Local/Temp/ys-yas-optimization'
  await fs.mkdir(directory, { recursive: true })
  await fs.writeFile(path.join(directory, 'field-layout.json'), JSON.stringify(result, null, 2))
  await page.screenshot({ path: path.join(directory, 'field-layout.png'), fullPage: true })
})
