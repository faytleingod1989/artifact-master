import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
const root = path.resolve(import.meta.dirname, '..')
const app = path.join(root, 'apps/web')
export function parseOptions(argv) {
  const options = { route: 'current', rounds: 5, output: undefined }
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '')
    if (!['route', 'rounds', 'output', 'case'].includes(key) || !argv[i + 1]) throw Error('Unknown/missing benchmark option')
    options[key] = key === 'rounds' ? Number(argv[i + 1]) : argv[i + 1]
  }
  if (!['current', 'candidate'].includes(options.route)) throw Error('Invalid route')
  if (!Number.isInteger(options.rounds) || options.rounds < 1 || options.rounds > 20) throw Error('Invalid rounds: 1..20')
  return options
}
export function validateManifest(manifest, manifestPath, workspace) {
  if (!Array.isArray(manifest.cases) || !manifest.cases.length) throw Error('基准样本为空')
  const seen = new Set()
  return manifest.cases.map(item => {
    if (!/^[a-z0-9-]+$/.test(item.id) || seen.has(item.id)) throw Error('样本编号重复或非法')
    seen.add(item.id)
    if (!item.expected && item.shouldReject !== true) throw Error('基准样本缺少期望字段或拒识声明')
    if (typeof item.file !== 'string') throw Error('样本路径非法')
    const source = path.resolve(path.dirname(manifestPath), item.file)
    if (!source.startsWith(path.resolve(workspace) + path.sep) || !source.toLowerCase().endsWith('.png')) throw Error('私有图片路径越界')
    return { ...item, source }
  })
}
export function percentile(values, quantile) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)]
}
export async function benchmarkNative(options) {
  const require = createRequire(path.join(app, 'package.json'))
  const { chromium } = require('@playwright/test')
  const { createNativeOcrClient } = require('./electron/nativeOcrClient.cjs')
  const { createServer } = await import(pathToFileURL(path.join(app, 'node_modules/vite/dist/node/index.js')).href)
  const privateRoot = path.join(root, 'tests/private/ocr')
  const manifestPath = path.join(privateRoot, 'manifest.json')
  const baseManifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  const regressionPath = path.join(privateRoot, 'yas-regressions.json')
  const regression = await fs.readFile(regressionPath, 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return { cases: [] }; throw error })
  const combined = { cases: [...baseManifest.cases.map(item => ({ ...item, expected: { ...item.expected, ...(regression.expectedNames?.[item.id] ? { name: regression.expectedNames[item.id] } : {}) } })), ...regression.cases] }
  const cases = validateManifest(combined, manifestPath, root).filter(item => !options.case || item.id === options.case)
  if (!cases.length) throw Error('No matching benchmark cases')
  const output = path.resolve(root, options.output ?? path.join(privateRoot, 'yas-optimization', options.route + '.json'))
  if (!output.startsWith(privateRoot + path.sep) || !output.endsWith('.json')) throw Error('基准报告必须存入私有 OCR 目录')
  const inputs = new Map(), sampleHashes = []
  for (const item of cases) {
    const real = await fs.realpath(item.source)
    if (!real.startsWith(root + path.sep)) throw Error('私有图片真实路径越界')
    const data = await fs.readFile(real); inputs.set(item.id, data)
    sampleHashes.push({ id: item.id, sha256: crypto.createHash('sha256').update(data).digest('hex'), kind: item.kind ?? 'original' })
  }
  const runtimeDir = path.join(app, 'native-ocr/runtime/ArtifactOcrWorker')
  const modelManifest = JSON.parse(await fs.readFile(path.join(runtimeDir, 'manifest.json'), 'utf8'))
  const client = createNativeOcrClient(runtimeDir)
  const server = await createServer({ root: app, configFile: path.join(app, 'vite.config.ts'), server: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'native-ocr-benchmark', configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url === '/__native_benchmark') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Native OCR benchmark</title>'); return }
      if (req.url?.startsWith('/__native_sample/')) {
        const data = inputs.get(req.url.slice('/__native_sample/'.length)); if (!data) { res.statusCode = 404; res.end(); return }
        res.setHeader('Content-Type', 'image/png'); res.setHeader('Cache-Control', 'no-store'); res.end(data); return
      }
      next()
    })
  } }] })
  let browser
  const coldStarted = performance.now()
  try {
    await client.start()
    const coldStartMs = performance.now() - coldStarted
    await server.listen()
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    await page.route('**/*', route => route.request().url().startsWith(origin + '/') || route.request().url().startsWith('blob:') ? route.continue() : route.abort())
    await page.exposeFunction('__nativeRecognize', async (_id, image, request) => {
      const result = await client.recognize(image, { ...request, mode: options.route === 'current' ? 'general' : 'auto' })
      if (result.engine !== 'PP-OCRv5-server') throw Error('Unexpected native engine')
      return result
    })
    await page.goto(origin + '/__native_benchmark')
    const measured = await page.evaluate(async ({ cases, rounds, route }) => {
      const { createNativeOcrSession } = await import('/src/artifacts/nativeOcrService.ts')
      const { runOcrBenchmark } = await import('/src/artifacts/ocrBenchmark.ts')
      const { isOcrImageRejection } = await import('/src/artifacts/ocrImageRejection.ts')
      const session = await createNativeOcrSession({ open: async () => 'real-native-benchmark', recognize: window.__nativeRecognize, close: async () => {} }, { mode: route === 'current' ? 'general' : 'auto' })
      const rows = []
      try {
        for (let round = -1; round < rounds; round++) for (const item of cases) {
          let image = await (await fetch('/__native_sample/' + item.id)).blob()
          if (item.replay) {
            const bitmap = await createImageBitmap(image), r = item.replay
            if (![r.x, r.y, r.width, r.height, r.targetWidth, r.targetHeight].every(Number.isSafeInteger) || r.x < 0 || r.y < 0 || r.width < 1 || r.height < 1 || r.x + r.width > bitmap.width || r.y + r.height > bitmap.height || r.targetWidth > 3840 || r.targetHeight > 2160) throw Error('Invalid UI replay crop')
            const canvas = document.createElement('canvas'); canvas.width = 3840; canvas.height = 2160
            const ctx = canvas.getContext('2d'); ctx.fillStyle = '#183149'; ctx.fillRect(0, 0, canvas.width, canvas.height)
            ctx.drawImage(bitmap, r.x, r.y, r.width, r.height, item.roi.x, item.roi.y, r.targetWidth, r.targetHeight); bitmap.close()
            image = await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('UI replay encode failed')), 'image/png'))
          }
          const started = performance.now()
          try {
            const result = await session.recognize(image)
            const comparison = await runOcrBenchmark([{ ...item, image }], { recognize: async () => result, dispose: async () => {} })
            if (round >= 0) rows.push({ id: item.id, round, elapsedMs: performance.now() - started, engine: result.engine, route: result.route ?? 'general', fallbackReason: result.fallbackReason, timings: result.timings, comparison, draft: result.draft, rawText: result.rawText })
          } catch (error) {
            if (round >= 0) rows.push({ id: item.id, round, elapsedMs: performance.now() - started, error: String(error), comparison: { exact: 0, falseAccepted: 0, rejected: 1, negativePassed: item.shouldReject && isOcrImageRejection(error) ? 1 : 0 } })
          }
        }
      } finally { await session.dispose() }
      return rows
    }, { cases: cases.map(({ source: _source, ...item }) => item), rounds: options.rounds, route: options.route })
    const readableIds = new Set(cases.filter(item => !item.shouldReject).map(item => item.id)), times = measured.filter(row => readableIds.has(row.id)).map(row => row.elapsedMs)
    const report = { recordedAt: new Date().toISOString(), route: options.route, rounds: options.rounds, engine: 'PP-OCRv5-server', coldStartMs, hardware: { cpu: os.cpus()[0]?.model, platform: os.platform(), release: os.release(), memory: os.totalmem() }, modelManifest, sampleHashes,
      summary: { originalCount: sampleHashes.filter(item => item.kind === 'original').length, total: measured.length, readableTotal: readableIds.size * options.rounds, negativeTotal: (cases.length - readableIds.size) * options.rounds, negativePassed: measured.reduce((n, row) => n + (row.comparison.negativePassed ?? 0), 0), exact: measured.reduce((n, row) => n + row.comparison.exact, 0), falseAccepted: measured.reduce((n, row) => n + row.comparison.falseAccepted, 0), rejected: measured.reduce((n, row) => n + row.comparison.rejected, 0), medianMs: percentile(times, .5), p95Ms: percentile(times, .95), fallbackCount: measured.filter(row => row.fallbackReason).length }, rows: measured,
      limitations: '固定私有截图自动定位与原生 OCR 回放；不包含真实窗口截图、排队或游戏输入耗时。样本不等于泛化准确率。' }
    await fs.mkdir(path.dirname(output), { recursive: true }); await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n')
    console.log(JSON.stringify({ output, ...report.summary }))
    return report
  } finally { client.dispose(); await browser?.close(); await server.close() }
}
if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  try { const report = await benchmarkNative(parseOptions(process.argv.slice(2))); if (report.summary.falseAccepted || report.summary.negativePassed !== report.summary.negativeTotal || report.summary.readableTotal && report.summary.exact / report.summary.readableTotal < .95) process.exitCode = 1 }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
