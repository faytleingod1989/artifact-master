import { test, expect } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs/promises'

const knownOcrWarning = /^Warning: Parameter not found: (language_model_ngram_on|segsearch_max_char_wh_ratio|language_model_ngram_space_delimited_language|language_model_use_sigmoidal_certainty|language_model_ngram_nonmatch_score|classify_integer_matcher_multiplier|assume_fixed_pitch_char_segment|allow_blob_division)$/
test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error' && !knownOcrWarning.test(message.text())) errors.push(message.text()) })
  Object.assign(page, { effectRuntimeErrors: errors })
})
test.afterEach(async ({ page }) => {
  await expect(page).toHaveURL('http://127.0.0.1:4178/')
  await expect(page).toHaveTitle('圣遗物管理大师')
  await expect(page.getByRole('navigation', { name: '主导航', exact: true })).toBeVisible()
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect((page as unknown as { effectRuntimeErrors: string[] }).effectRuntimeErrors).toEqual([])
})

test('realtime effect replay retains its frozen image and retries OCR without a fresh supplementary capture', async ({ page }) => {
  test.setTimeout(90000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.route('**/__effect.png', route => route.fulfill({ contentType: 'image/png', path: path.resolve('../../tests/private/ocr/flower-shadow-level20-effects.png') }))
  await page.addInitScript(() => {
    let captures = 0, shortcut = false
    Object.assign(window, { __captureState: () => ({ captures, shortcut }), artifactDesktop: {
      queryShowcase: async () => ({ ok: false }),
      listCaptureSources: async () => [{ id: 'window:458:0', name: '特效原图回放', kind: 'window', thumbnail: '/__effect.png', appIcon: null }],
      setRealtimeShortcut: async (enabled: boolean) => { shortcut = enabled; return enabled },
      onRealtimeCapture: () => () => {},
      captureWindowFrame: async (sourceId: string) => {
        captures++
        const blob = await (await fetch('/__effect.png')).blob()
        const bitmap = await createImageBitmap(blob), width = bitmap.width, height = bitmap.height; bitmap.close()
        const image = await new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(blob) })
        return { sourceId, width, height, image }
      },
    } })
    navigator.mediaDevices.getUserMedia = async () => { throw new Error('video must not be used') }
  })
  await page.goto('/')
  await page.getByRole('button', { name: '实时录入', exact: true }).click()
  await page.getByRole('button', { name: '刷新窗口', exact: true }).click()
  await page.getByRole('button', { name: /特效原图回放/ }).click()
  await page.getByRole('button', { name: '启动实时采集', exact: true }).click()
  const panel = page.getByRole('dialog', { name: '实时录入助手' })
  await expect(panel.getByRole('status')).toContainText('本图需重试', { timeout: 60000 })
  await expect(panel.getByRole('status')).toContainText('第3条副词条被亮光或特效遮挡')
  await expect(panel.getByRole('heading', { name: '待确认 0 / 20 件' })).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { __captureState: () => { captures: number } }).__captureState().captures)).toBe(2)
  await fs.mkdir('C:/Users/Administrator/AppData/Local/Temp/ys-ocr-20261016', { recursive: true })
  await panel.getByRole('status').scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'C:/Users/Administrator/AppData/Local/Temp/ys-ocr-20261016/occlusion-failure.png' })
  await panel.getByText('查看本次 OCR 原文与耗时').click()
  await expect(panel.getByRole('heading', { name: '第1张 · 识别第1次' })).toBeVisible()
  await expect(panel.locator('pre').last()).toContainText('6.5%')
  await expect(panel.locator('.capture-ocr-diagnostics')).toContainText('预处理')
  await panel.getByRole('button', { name: '重新识别此图', exact: true }).click()
  await expect(panel.getByRole('heading', { name: '第1张 · 识别第2次' })).toBeVisible({ timeout: 60000 })
  expect(await page.evaluate(() => (window as unknown as { __captureState: () => { captures: number } }).__captureState().captures)).toBe(2)
  await panel.getByRole('button', { name: '停止采集', exact: true }).click()
  expect(await page.evaluate(() => (window as unknown as { __captureState: () => { shortcut: boolean } }).__captureState().shortcut)).toBe(false)
  await panel.locator('.capture-ocr-diagnostics').scrollIntoViewIfNeeded()
  await fs.mkdir('C:/Users/Administrator/AppData/Local/Temp/ys-ocr-20261016', { recursive: true })
  await page.screenshot({ path: 'C:/Users/Administrator/AppData/Local/Temp/ys-ocr-20261016/occlusion-diagnostics.png' })
  await expect(page).toHaveTitle('圣遗物管理大师')
  await expect(page.getByRole('navigation', { name: '主导航', exact: true })).toBeVisible()
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})

test('new effect-covered original preserves charge 6.5 and identifies occluded substat rows without inventing values', async ({ page }) => {
  test.setTimeout(60000)
  await page.route('**/__effect.png', route => route.fulfill({ contentType: 'image/png', path: path.resolve('../../tests/private/ocr/flower-shadow-level20-effects.png') }))
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const { createOcrSession } = await import('/src/artifacts/ocrService.ts')
    const { getRecognitionProblems } = await import('/src/imports/recognitionCheck.ts')
    const session = await createOcrSession()
    try {
      const result = await session.recognize(await (await fetch('/__effect.png')).blob())
      return { ...result, problems: getRecognitionProblems(result.draft), detailImage: undefined }
    } finally { await session.dispose() }
  })
  expect(result.draft.subs).toContainEqual({ key: 'energyRecharge', value: 6.5 })
  expect(result.identityEvidence).toEqual(expect.arrayContaining([{ key: 'atkPercent', value: 9.9 }, { key: 'energyRecharge', value: 6.5 }]))
  expect(result.retryHint).toBe('occluded')
  expect(result.problems.join(' ')).toMatch(/第[34]条.*遮挡/)
  expect(result.problems.join(' ')).not.toContain('元素充能效率数值精度异常')
})
