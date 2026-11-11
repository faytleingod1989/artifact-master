import { test, expect } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'

const imagePath = path.resolve('../../bc截图/ScreenShot_2026-10-01_201009_542.png')
const evidenceRoot = 'C:/Users/Administrator/AppData/Local/Temp/ys-ocr-diagnostic-20261013'
// The pinned legacy traineddata contains eight options unsupported by the current
// LSTM core. Tesseract prints these warnings to stderr (console error); do not
// mistake them for renderer failures, and do not ignore any other error.
const knownOcrWarning = /^Warning: Parameter not found: (language_model_ngram_on|segsearch_max_char_wh_ratio|language_model_ngram_space_delimited_language|language_model_use_sigmoidal_certainty|language_model_ngram_nonmatch_score|classify_integer_matcher_multiplier|assume_fixed_pitch_char_segment|allow_blob_division)$/

test('three frozen F8 images queue behind delayed OCR without recapture, preview stealing or focus change', async ({ page }) => {
  test.setTimeout(60000)
  await page.route('**/__queue_fixture.png', route => route.fulfill({ contentType: 'image/png', path: path.resolve('../../tests/private/ocr/flower-shadow-level20-compare.png') }))
  await page.addInitScript(() => {
    let trigger: (() => void) | undefined, release: (() => void) | undefined, frames = 0, heldBytes = 0
    const seen: number[] = []
    Object.assign(window, { __queueF8: () => trigger?.(), __releaseQueue: () => release?.(), __queueSeen: seen, __queueBytes: () => heldBytes, artifactDesktop: {
      queryShowcase: async () => ({ ok: false }), setRealtimeShortcut: async () => true,
      onRealtimeCapture: (cb: () => void) => { trigger = cb; return () => { trigger = undefined } },
      listCaptureSources: async () => [{ id: 'window:queue:0', name: '队列回放窗口', kind: 'window', thumbnail: '/__queue_fixture.png', appIcon: null }],
      captureWindowFrame: async (sourceId: string) => {
        const image = new Image(); image.src = '/__queue_fixture.png'; await image.decode()
        const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
        const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0)
        // Preserve the original right-hand detail at native resolution; simplify
        // irrelevant scene pixels so this exercises count20, not byte128MiB.
        context.fillStyle = '#123456'; context.fillRect(0, 0, 2800, canvas.height)
        context.fillStyle = 'rgb(' + (200 + ++frames) + ',15,77)'; context.fillRect(3000, 400, 16, 16)
        const encoded = canvas.toDataURL('image/png')
        if (frames > 1) heldBytes += (encoded.length - 22) / 4 * 3 - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0)
        return { sourceId, width: canvas.width, height: canvas.height, image: encoded }
      },
      nativeOcr: { open: async () => 'queue-replay', close: async () => {}, recognize: async (_session: string, data: string) => {
        const image = new Image(); image.src = data; await image.decode()
        const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
        const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0)
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
        let id = 0
        for (let i = 0; i < pixels.length; i += 4) if (pixels[i] >= 201 && pixels[i] <= 240 && pixels[i + 1] === 15 && pixels[i + 2] === 77) { id = pixels[i] - 200; break }
        seen.push(id); if (seen.length === 1) await new Promise<void>(resolve => { release = resolve })
        const text = ['止于荣礼的缎彩', '生之花', '生命值 717', '+0', '暴击率+3.1%', '攻击力+19', '暴击伤害+5.4%', '影中沉凝的幻灭：(4)']
        return { engine: 'PP-OCRv5-server', width: canvas.width, height: canvas.height, elapsedMs: 1, lines: text.map((text, i) => ({ text, score: .99, occluded: false, box: [[5,i*65],[700,i*65],[700,i*65+45],[5,i*65+45]] })) }
      } },
    } })
  })
  await page.goto('/'); await page.getByRole('button', { name: '实时录入', exact: true }).click()
  await page.getByRole('button', { name: '刷新窗口', exact: true }).click(); await page.getByRole('button', { name: /队列回放窗口/ }).click(); await page.getByRole('button', { name: '启动实时采集', exact: true }).click()
  await expect(page.getByText(/已捕获：1 张/)).toBeVisible()
  await expect.poll(() => page.evaluate(() => (window as unknown as { __queueSeen: number[] }).__queueSeen.length)).toBe(1)
  await page.evaluate(() => (window as unknown as { __queueF8: () => void }).__queueF8()); await expect(page.getByText(/已捕获：2 张/)).toBeVisible()
  await page.evaluate(() => (window as unknown as { __queueF8: () => void }).__queueF8()); await expect(page.getByText(/已捕获：3 张/)).toBeVisible()
  await page.locator('.capture-job-select').nth(1).click()
  await expect(page.getByText(/第2张 · 实际捕获/)).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { __queueSeen: number[] }).__queueSeen)).toEqual([2])
  for (let count = 4; count <= 20; count++) {
    await page.evaluate(() => (window as unknown as { __queueF8: () => void }).__queueF8())
    await expect(page.getByText(new RegExp('已捕获：' + count + ' 张'))).toBeVisible()
  }
  await page.evaluate(() => (window as unknown as { __queueF8: () => void }).__queueF8())
  await expect(page.getByRole('status')).toContainText('已满20件')
  console.log('20 frozen-frame memory evidence:', await page.evaluate(() => ({ encodedSourceBytes: (window as unknown as { __queueBytes: () => number }).__queueBytes(), jsHeapBytes: (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize })))
  await page.evaluate(() => (window as unknown as { __releaseQueue: () => void }).__releaseQueue())
  await expect(page.getByText('待确认 20 / 20 件', { exact: true })).toBeVisible({ timeout: 30000 })
  expect(await page.evaluate(() => (window as unknown as { __queueSeen: number[] }).__queueSeen)).toEqual(Array.from({ length: 20 }, (_, i) => i + 2))
  await expect(page.getByText(/第2张 · 实际捕获/)).toBeVisible()
  await page.screenshot({ path: 'C:/Users/Administrator/AppData/Local/Temp/ys-capture-queue.png' })
})

test.beforeEach(async ({ page }) => {
  const runtimeErrors: string[] = []
  page.on('pageerror', error => runtimeErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error' && !knownOcrWarning.test(message.text())) runtimeErrors.push(message.text()) })
  Object.assign(page, { captureRuntimeErrors: runtimeErrors })
})
test.afterEach(async ({ page }) => {
  await expect(page).toHaveURL('http://127.0.0.1:4178/')
  await expect(page).toHaveTitle('圣遗物管理大师')
  await expect(page.getByRole('navigation', { name: '主导航', exact: true })).toBeVisible()
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect((page as unknown as { captureRuntimeErrors: string[] }).captureRuntimeErrors).toEqual([])
})
test('real offline screenshot OCR auto-crops and opens a populated summary without coordinates', async ({ page }) => {
  test.setTimeout(90000)
  await page.setViewportSize({ width: 1440, height: 920 })
  await page.goto('/')
  await expect(page.getByRole('button', { name: '手动录入', exact: true })).toBeEnabled()
  await page.getByText('更多录入', { exact: true }).click()
  await page.getByRole('button', { name: '识别截图', exact: true }).click()
  await page.getByLabel('选择圣遗物截图').setInputFiles(imagePath)
  const review = page.getByRole('dialog', { name: '确认入库', exact: true })
  await expect(review).toBeVisible({ timeout: 60000 })
  await expect(review.getByLabel('自动识别信息', { exact: true })).toContainText('生命值 4780')
  await expect(page.getByLabel('区域X', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('主词条数值', { exact: true })).toHaveCount(0)
  const image = review.getByRole('img', { name: '来源截图预览1', exact: true })
  expect(await image.evaluate(img => (img as HTMLImageElement).naturalWidth / (img as HTMLImageElement).naturalHeight)).toBeLessThan(1.3)
  await fs.mkdir(evidenceRoot, { recursive: true })
  await page.screenshot({ path: path.join(evidenceRoot, 'automatic-summary-ui.png'), fullPage: false })
  await review.getByRole('button', { name: '确认并入库', exact: true }).click()
  await expect(review.getByRole('status')).toContainText('新增 1 件')
  await review.getByRole('button', { name: '完成', exact: true }).click()
  await expect(page.getByText('共 1 件 / 库存 1 件', { exact: true })).toBeVisible()
})

test('a simulated capture video exercises real automatic OCR and the F8 event reception counter', async ({ page }) => {
  test.setTimeout(90000)
  await page.setViewportSize({ width: 1440, height: 920 })
  await page.route('**/__capture_fixture.png', route => route.fulfill({ contentType: 'image/png', path: imagePath }))
  await page.addInitScript(() => {
    let trigger: (() => void) | undefined
    Object.assign(window, { __triggerF8: () => trigger?.(), artifactDesktop: {
      queryShowcase: async () => ({ ok: false }),
      listCaptureSources: async () => [{ id: 'window:fixture:0', name: '测试游戏窗口', kind: 'window', thumbnail: '/__capture_fixture.png', appIcon: null }],
      setRealtimeShortcut: async () => true,
      onRealtimeCapture: (listener: () => void) => { trigger = listener; return () => { trigger = undefined } },
    } })
    navigator.mediaDevices.getUserMedia = async () => {
      const image = new Image(); image.src = '/__capture_fixture.png'; await image.decode()
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
      canvas.getContext('2d')!.drawImage(image, 0, 0)
      return canvas.captureStream(2)
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: '实时录入', exact: true }).click()
  await page.getByRole('button', { name: '刷新窗口', exact: true }).click()
  await page.getByRole('button', { name: /测试游戏窗口/ }).click()
  await page.getByRole('button', { name: '启动实时采集', exact: true }).click()
  await expect(page.getByText(/F8 已启用/)).toBeVisible()
  await expect(page.getByRole('img', { name: '待确认详情1', exact: true })).toBeVisible({ timeout: 60000 })
  await page.evaluate(() => (window as unknown as { __triggerF8: () => void }).__triggerF8())
  await expect(page.getByText(/已收到 F8：1 次/)).toBeVisible()
  await expect(page.getByRole('img', { name: '待确认详情2', exact: true })).toBeVisible({ timeout: 60000 })
  await page.locator('.realtime-modal').evaluate(element => { element.scrollTop = 0 })
  await page.screenshot({ path: path.join(evidenceRoot, 'realtime-f8-enabled-ui.png'), fullPage: false })
  await page.getByRole('button', { name: '停止采集', exact: true }).click()
  await expect(page.getByText(/F8 未启用/)).toBeVisible()
  await expect(page.getByRole('button', { name: '启动实时采集', exact: true })).toBeEnabled()
  await page.screenshot({ path: path.join(evidenceRoot, 'realtime-f8-ui.png'), fullPage: false })
})

test('native window snapshots feed real OCR even when renderer video-source startup is unavailable', async ({ page }) => {
  test.setTimeout(90000)
  await page.route('**/__capture_fixture.png', route => route.fulfill({ contentType: 'image/png', path: imagePath }))
  await page.addInitScript(() => {
    Object.assign(window, { artifactDesktop: {
      queryShowcase: async () => ({ ok: false }),
      listCaptureSources: async () => [{ id: 'window:456:0', name: '本地窗口样图', kind: 'window', thumbnail: '/__capture_fixture.png', appIcon: null }],
      setRealtimeShortcut: async () => true,
      onRealtimeCapture: () => () => {},
      captureWindowFrame: async (sourceId: string) => {
        const blob = await (await fetch('/__capture_fixture.png')).blob()
        const bitmap = await createImageBitmap(blob); const width = bitmap.width, height = bitmap.height; bitmap.close()
        const image = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob) })
        return { sourceId, width, height, image }
      },
    } })
    navigator.mediaDevices.getUserMedia = async () => { throw new Error('Could not start video source') }
  })
  await page.goto('/')
  await page.getByRole('button', { name: '实时录入', exact: true }).click()
  await page.getByRole('button', { name: '刷新窗口', exact: true }).click()
  await page.getByRole('button', { name: /本地窗口样图/ }).click()
  await page.getByRole('button', { name: '启动实时采集', exact: true }).click()
  await expect(page.getByRole('img', { name: '待确认详情1', exact: true })).toBeVisible({ timeout: 60000 })
  await expect(page.getByText(/F8 已启用/)).toBeVisible()
  await page.getByRole('button', { name: '停止并核对批次', exact: true }).click()
  await expect(page.getByLabel('自动识别信息', { exact: true })).toContainText('生命值 4780')
})

test('new level17 original fills realtime review without asking for manual fields', async ({ page }) => {
  test.setTimeout(60000)
  await page.setViewportSize({ width: 1440, height: 920 })
  await page.route('**/__level17_fixture.png', route => route.fulfill({ contentType: 'image/png', path: path.resolve('../../bc截图/微信图片_2026-10-15_193653_568.png') }))
  await page.addInitScript(() => {
    Object.assign(window, { artifactDesktop: {
      queryShowcase: async () => ({ ok: false }),
      listCaptureSources: async () => [{ id: 'window:457:0', name: '用户提供的 +17 原图回放', kind: 'window', thumbnail: '/__level17_fixture.png', appIcon: null }],
      setRealtimeShortcut: async () => true,
      onRealtimeCapture: () => () => {},
      captureWindowFrame: async (sourceId: string) => {
        const blob = await (await fetch('/__level17_fixture.png')).blob()
        const bitmap = await createImageBitmap(blob), width = bitmap.width, height = bitmap.height; bitmap.close()
        const image = await new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(blob) })
        return { sourceId, width, height, image }
      },
    } })
    navigator.mediaDevices.getUserMedia = async () => { throw new Error('Could not start video source') }
  })
  await page.goto('/')
  await page.getByRole('button', { name: '实时录入', exact: true }).click()
  await page.getByRole('button', { name: '刷新窗口', exact: true }).click()
  await page.getByRole('button', { name: /用户提供的 \+17 原图回放/ }).click()
  await page.getByRole('button', { name: '启动实时采集', exact: true }).click()
  await expect(page.getByRole('img', { name: '待确认详情1', exact: true })).toBeVisible({ timeout: 30000 })
  await page.getByRole('button', { name: '停止并核对批次', exact: true }).click()
  const summary = page.getByLabel('自动识别信息', { exact: true })
  for (const text of ['影中沉凝的幻灭', '+17', '生命值 4171', '暴击伤害 6.2%', '攻击力 27', '暴击率 3.5%', '元素精通 63']) await expect(summary).toContainText(text)
  await expect(page.getByLabel('主词条数值', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('区域X', { exact: true })).toHaveCount(0)
  await fs.mkdir('C:/Users/Administrator/AppData/Local/Temp/ys-ocr-20261015', { recursive: true })
  await page.screenshot({ path: 'C:/Users/Administrator/AppData/Local/Temp/ys-ocr-20261015/level17-review.png', fullPage: false })
})
