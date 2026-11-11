import { test, expect } from '@playwright/test'
import { createRequire } from 'node:module'
import path from 'node:path'
import fs from 'node:fs/promises'
const require = createRequire(import.meta.url)
const { createNativeOcrClient } = require('../electron/nativeOcrClient.cjs')
// Headless Chromium emulates every tab as focused/visible; use a real window
// for the background-playback check rather than faking document.hasFocus().
test.use({ headless: false })

test('realtime replay uses the actual offline V5 helper and opens a complete confirmation summary', async ({ page }) => {
  test.setTimeout(60000)
  const client = createNativeOcrClient(path.resolve('native-ocr/runtime/ArtifactOcrWorker'))
  let releaseRecognition!: () => void
  const recognitionGate = new Promise<void>(resolve => { releaseRecognition = resolve })
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.route('**/__v5.png', route => route.fulfill({ contentType: 'image/png', path: path.resolve('../../tests/private/ocr/flower-shadow-level20-compare.png') }))
  await page.exposeFunction('__nativeOpen', async () => { await client.start(); return 'ui-native-session' })
  await page.exposeFunction('__nativeRecognize', async (_session: string, image: string) => { await recognitionGate; return client.recognize(image) })
  await page.exposeFunction('__nativeClose', async () => { client.cancel() })
  await page.addInitScript(() => {
    const audioEvidence: { kind: string; focused: boolean; state: string }[] = []
    const NativeAudioContext = window.AudioContext
    Object.assign(window, { __audioEvidence: audioEvidence, AudioContext: class extends NativeAudioContext {
      createOscillator() { const oscillator = super.createOscillator(); oscillator.addEventListener('ended', () => audioEvidence.push({ kind: oscillator.frequency.value > 600 ? 'recognized' : 'captured', focused: document.hasFocus(), state: this.state })); return oscillator }
    } })
    const bridge = window as unknown as { __nativeOpen: () => Promise<string>; __nativeRecognize: (session: string, image: string) => Promise<unknown>; __nativeClose: () => Promise<void> }
    let f8: (() => void) | undefined
    Object.assign(window, { __backgroundF8: () => f8?.(), artifactDesktop: {
      nativeOcr: { open: bridge.__nativeOpen, recognize: bridge.__nativeRecognize, close: bridge.__nativeClose },
      queryShowcase: async () => ({ ok: false }),
      listCaptureSources: async () => [{ id: 'window:459:0', name: 'V5 真实 OCR 原图回放', kind: 'window', thumbnail: '/__v5.png', appIcon: null }],
      setRealtimeShortcut: async () => true, onRealtimeCapture: (listener: () => void) => { f8 = listener; return () => { f8 = undefined } },
      captureWindowFrame: async (sourceId: string) => {
        const blob = await (await fetch('/__v5.png')).blob(), bitmap = await createImageBitmap(blob), width = bitmap.width, height = bitmap.height; bitmap.close()
        const image = await new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(blob) })
        return { sourceId, width, height, image }
      },
    } })
  })
  try {
    await page.goto('/')
    await page.getByRole('button', { name: '实时录入', exact: true }).click()
    await page.getByRole('button', { name: '刷新窗口', exact: true }).click()
    await page.getByRole('button', { name: /V5 真实 OCR 原图回放/ }).click()
    await page.getByRole('button', { name: '启动实时采集', exact: true }).click()
    const other = await page.context().newPage()
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false })
    await other.goto('about:blank'); await other.bringToFront()
    await expect.poll(() => page.evaluate(() => document.hasFocus())).toBe(false)
    releaseRecognition()
    await expect.poll(() => page.evaluate(() => (window as unknown as { __audioEvidence: Array<{kind: string}> }).__audioEvidence.filter(item => item.kind === 'recognized')), { timeout: 30000 }).toEqual([{ kind: 'recognized', focused: false, state: 'running' }])
    await page.evaluate(() => (window as unknown as { __backgroundF8: () => void }).__backgroundF8())
    await expect.poll(() => page.evaluate(() => (window as unknown as { __audioEvidence: Array<{kind: string}> }).__audioEvidence.filter(item => item.kind === 'recognized').length), { timeout: 30000 }).toBe(2)
    const backgroundCapture = await page.evaluate(() => (window as unknown as { __audioEvidence: Array<{kind: string; focused: boolean; state: string}> }).__audioEvidence.filter(item => item.kind === 'captured').at(-1))
    expect(backgroundCapture).toEqual({ kind: 'captured', focused: false, state: 'running' })
    expect(await page.evaluate(() => document.hasFocus())).toBe(false)
    await other.close(); await page.bringToFront()
    await expect(page.getByRole('img', { name: '待确认详情1', exact: true })).toBeVisible({ timeout: 30000 })
    await page.getByRole('button', { name: '停止并核对批次', exact: true }).click()
    const summary = page.getByLabel('自动识别信息', { exact: true }).first()
    for (const text of ['影中沉凝的幻灭', '+20', '生命值 4780', '攻击力 9.9%', '元素充能效率 6.5%', '暴击伤害 28%', '暴击率 6.2%']) await expect(summary).toContainText(text)
    await page.getByText('查看 OCR 原文', { exact: true }).first().click()
    await expect(page.locator('.review-preview pre').first()).toContainText('PP-OCRv5-server')
    await expect(page.getByLabel('主词条数值', { exact: true })).toHaveCount(0)
    await fs.mkdir('C:/Users/Administrator/AppData/Local/Temp/ys-rapidocr-20261017', { recursive: true })
    await page.screenshot({ path: 'C:/Users/Administrator/AppData/Local/Temp/ys-rapidocr-20261017/v5-realtime-review.png' })
    await expect(page).toHaveURL('http://127.0.0.1:4178/')
    await expect(page).toHaveTitle('圣遗物管理大师')
    await expect(page.getByRole('navigation', { name: '主导航', exact: true })).toBeVisible()
    await expect(page.locator('vite-error-overlay')).toHaveCount(0)
    expect(errors).toEqual([])
  } finally { client.dispose() }
})
