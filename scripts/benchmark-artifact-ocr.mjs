import { readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const app = path.join(root, 'apps/web'); const require = createRequire(path.join(app, 'package.json'))
const { chromium } = require('@playwright/test'); const { createServer } = await import(pathToFileURL(path.join(app, 'node_modules/vite/dist/node/index.js')).href)
const manifestPath = path.join(root, 'tests/private/ocr/manifest.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const automatic = process.argv.includes('--auto')
if (manifest.cases.length < 10 || new Set(manifest.cases.map(item => item.expected.slot)).size !== 5) throw new Error('真实基准必须至少10件且覆盖五部位。')
const inputs = new Map()
for (const item of manifest.cases) {
  if (!/^[a-z0-9-]+$/.test(item.id) || inputs.has(item.id)) throw new Error('样本编号重复或非法')
  const source = path.resolve(path.dirname(manifestPath), item.file)
  if (!source.startsWith(root + path.sep) || !source.endsWith('.png')) throw new Error('私有图片路径越界')
  inputs.set(item.id, await readFile(source))
}
const server = await createServer({ root: app, configFile: path.join(app, 'vite.config.ts'), server: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'private-ocr-benchmark', configureServer(server) {
  server.middlewares.use((request, response, next) => {
    if (request.url === '/__ocr_benchmark') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Private local OCR benchmark</title>'); return }
    if (request.url?.startsWith('/__ocr_sample/')) {
      const data = inputs.get(request.url.slice('/__ocr_sample/'.length)); if (!data) { response.statusCode = 404; response.end(); return }
      response.setHeader('Content-Type', 'image/png'); response.setHeader('Cache-Control', 'no-store'); response.end(data); return
    }
    next()
  })
} }] })
let browser
try {
  await server.listen(); const address = server.httpServer.address(); const origin = `http://127.0.0.1:${address.port}`
  browser = await chromium.launch({ headless: true }); const page = await browser.newPage()
  await page.route('**/*', route => route.request().url().startsWith(origin + '/') || route.request().url().startsWith('blob:') ? route.continue() : route.abort())
  page.on('console', message => { if (message.type() === 'error') console.error(message.text()) })
  await page.goto(origin + '/__ocr_benchmark')
  if (process.env.OCR_DEBUG === '1') {
    const prepared = await page.evaluate(async item => {
      const { cropDetailRegion } = await import('/src/capture/captureRegion.ts')
      const { prepareDetailOcrImages } = await import('/src/artifacts/artifactOcrImage.ts')
      const frame = await (await fetch('/__ocr_sample/' + item.id)).blob()
      const regions = await prepareDetailOcrImages(await cropDetailRegion(frame, item.roi))
      return Promise.all(regions.map(async region => ({ id: region.id, bytes: Array.from(new Uint8Array(await region.image.arrayBuffer())) })))
    }, manifest.cases[0])
    for (const [index, region] of prepared.entries()) await writeFile(path.join(root, `tests/private/ocr/debug-${index}-${region.id}.png`), Buffer.from(region.bytes))
  }
  const started = Date.now()
  const report = await page.evaluate(async ({ cases, automatic }) => {
    const { createOcrSession } = await import('/src/artifacts/ocrService.ts')
    const { runOcrBenchmark } = await import('/src/artifacts/ocrBenchmark.ts')
    const session = await createOcrSession(); const reports = []; const details = []
    try {
      for (const item of cases) {
        const image = await (await fetch('/__ocr_sample/' + item.id)).blob()
        // Capture raw diagnostics from the actual worker, not a mocked recognition result.
        const result = await session.recognize(image, automatic ? undefined : item.roi); details.push({ id: item.id, draft: result.draft, rawText: result.rawText, confidence: result.confidence, detectedRoi: result.detailRoi })
        const comparison = await runOcrBenchmark([{ ...item, image }], { recognize: async () => result, dispose: async () => {} }); reports.push(comparison)
      }
      return { total: reports.length, exact: reports.reduce((sum, item) => sum + item.exact, 0), failures: reports.flatMap(item => item.failures), details }
    } finally { await session.dispose() }
  }, { cases: manifest.cases, automatic })
  report.elapsedMs = Date.now() - started; report.sampleManifest = 'tests/private/ocr/manifest.json'; report.automatic = automatic
  const output = path.join(root, 'tests/private/ocr', automatic ? 'automatic-report.json' : 'latest-report.json'); await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ total: report.total, exact: report.exact, rate: report.exact / report.total, elapsedMs: report.elapsedMs, failures: report.failures }, null, 2))
  if (report.exact / report.total < .9) process.exitCode = 1
} finally { await browser?.close(); await server.close() }
