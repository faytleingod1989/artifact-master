import { test, expect } from '@playwright/test'
import path from 'node:path'

test('real Web Audio tone has finite nonzero signal and a quiet tail', async ({ page }) => {
  await page.goto('/')
  const signal = await page.evaluate(async () => {
    // Vite serves the actual production module, not a reimplementation of the tone.
    const module = await import('/src/capture/captureSuccessSound.ts')
    const context = new OfflineAudioContext(1, 24000, 48000)
    module.scheduleCaptureSuccessTone(context)
    const samples = (await context.startRendering()).getChannelData(0)
    return { peak: Math.max(...samples.map(Math.abs)), finite: samples.every(Number.isFinite), tail: samples.slice(12000).every(n => Math.abs(n) < 1e-6) }
  })
  expect(signal.finite).toBe(true); expect(signal.peak).toBeGreaterThan(.02); expect(signal.peak).toBeLessThan(.1); expect(signal.tail).toBe(true)
})

test('pending OCR text replay remains dormant through confirmation, edit, reload and backup', async ({ page }) => {
  await page.route('**/__pending.png', route => route.fulfill({ contentType: 'image/png', path: path.resolve('../../tests/private/ocr/flower-shadow-level20-compare.png') }))
  await page.addInitScript(() => {
    const lines = ['止于荣礼的缎彩', '生之花', '生命值 717', '+0', '暴击率+3.1%', '攻击力+19', '暴击伤害+5.4%', '生命值+4.1%(待激活', '影中沉凝的幻灭：(4)'].map((text, i) => ({ text, score: .98, occluded: false, box: [[5, i * 65], [700, i * 65], [700, i * 65 + 45], [5, i * 65 + 45]] }))
    Object.assign(window, { artifactDesktop: {
      nativeOcr: { open: async () => 'pending-text-replay', close: async () => {}, recognize: async () => ({ engine: 'PP-OCRv5-server', width: 911, height: 798, elapsedMs: 10, lines }) },
      queryShowcase: async () => ({ ok: false }), listCaptureSources: async () => [{ id: 'window:459:0', name: '待激活原文回放', kind: 'window', thumbnail: '/__pending.png', appIcon: null }],
      setRealtimeShortcut: async () => true, onRealtimeCapture: () => () => {},
      captureWindowFrame: async (sourceId: string) => { const blob = await (await fetch('/__pending.png')).blob(); const image = await new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(blob) }); return { sourceId, width: 3840, height: 2160, image } },
    } })
  })
  await page.goto('/')
  await page.getByRole('button', { name: '实时录入', exact: true }).click()
  await expect(page.getByLabel('成功识别提示音', { exact: true })).toBeChecked()
  await page.getByLabel('成功识别提示音', { exact: true }).uncheck()
  await page.getByRole('button', { name: '刷新窗口', exact: true }).click()
  await page.getByRole('button', { name: /待激活原文回放/ }).click()
  await page.getByRole('button', { name: '启动实时采集', exact: true }).click()
  await expect(page.getByRole('img', { name: '待确认详情1', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '停止并核对批次', exact: true }).click()
  await expect(page.getByLabel('自动识别信息', { exact: true })).toContainText('生命值 4.1%（待激活，不计入当前评分）')
  await page.getByRole('button', { name: '确认并入库', exact: true }).click()
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await page.reload()
  const details = page.getByLabel('圣遗物详情', { exact: true })
  await expect(details).toContainText('生命值 +4.1%（待激活）')
  await page.getByRole('button', { name: '编辑当前圣遗物', exact: true }).click()
  await expect(page.getByLabel('待激活副词条1数值', { exact: true })).toHaveValue('4.1')
  await page.getByRole('button', { name: '保存圣遗物', exact: true }).click()
  await page.getByRole('button', { name: '确认并入库', exact: true }).click()
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await page.getByText('仓库备份', { exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出 JSON', exact: true }).click()
  const download = await downloading, stream = await download.createReadStream(), chunks = []
  for await (const chunk of stream!) chunks.push(chunk)
  const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  expect(payload.artifacts).toHaveLength(1)
  expect(payload.artifacts[0].subs).toEqual(['暴击率 +3.1%', '攻击力 +19', '暴击伤害 +5.4%'])
  expect(payload.artifacts[0].pendingSubs).toEqual(['生命值 +4.1%'])
  await page.getByRole('button', { name: '实时录入', exact: true }).click()
  await expect(page.getByLabel('成功识别提示音', { exact: true })).not.toBeChecked()
  await page.screenshot({ path: 'C:/Users/Administrator/AppData/Local/Temp/ys-rapidocr-20261017/success-sound-setting.png' })
})
