import { readFile, writeFile, mkdir, readdir, copyFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const LANGUAGE_RESOURCES = {
  repository: 'https://github.com/naptha/tessdata', version: '4.0.0_best_int', commit: '806cd9adc8c6e8abc11c782db1818c990576bebc', license: 'Apache-2.0', upstream: 'https://github.com/tesseract-ocr/tessdata_best',
  files: [
    { name: 'chi_sim.traineddata', sha256: '9784f7c917c546424b690fcde708ce1f604a4393d08bb51ddab146d7d7c794e6', gzip: true, url: 'https://raw.githubusercontent.com/naptha/tessdata/806cd9adc8c6e8abc11c782db1818c990576bebc/4.0.0_best_int/chi_sim.traineddata.gz' },
    { name: 'eng.traineddata', sha256: '5dc5d8d640a212c9d6184921ba103b186f50e0fed9ee716c53e6b312b400d747', gzip: true, url: 'https://raw.githubusercontent.com/naptha/tessdata/806cd9adc8c6e8abc11c782db1818c990576bebc/4.0.0_best_int/eng.traineddata.gz' },
    { name: 'LICENSE', sha256: 'a6cba85bc92e0cff7a450b1d873c0eaa2e9fc96bf472df0247a26bec77bf3ff9', url: 'https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/e2aad9b983032bb1beff9133104a67cdbb87ca4d/LICENSE' },
  ],
}
const hash = data => createHash('sha256').update(data).digest('hex')
export async function validateResourceManifest(manifest, reader) {
  if (!Array.isArray(manifest.files) || !manifest.files.length) throw new Error('本地识别资源清单缺失')
  for (const file of manifest.files) {
    if (!/^(worker|core|lang)\/[\w.-]+$/.test(file.path)) throw new Error('本地资源路径非法')
    if (hash(await reader(file.path)) !== file.sha256) throw new Error(`本地资源哈希不符：${file.path}`)
  }
}
export async function prepareLocalOcr({ download = false } = {}) {
  const cache = path.join(root, '.cache/ocr/best-int-4.0.0'); const target = path.join(root, 'apps/web/public/ocr')
  const modules = path.join(root, 'apps/web/node_modules'); const files = []
  await mkdir(cache, { recursive: true })
  for (const directory of ['worker', 'core', 'lang']) await mkdir(path.join(target, directory), { recursive: true })
  async function copy(source, destination) {
    const data = await readFile(source); await copyFile(source, path.join(target, destination))
    files.push({ path: destination, sha256: hash(data), bytes: data.length })
  }
  for (const entry of LANGUAGE_RESOURCES.files) {
    const source = path.join(cache, entry.name)
    let data
    try { data = await readFile(source) } catch {
      if (!download) throw new Error(`离线缓存缺少 ${entry.name}；首次准备请显式运行 prepare:ocr:download。`)
      const response = await fetch(entry.url, { signal: AbortSignal.timeout(60000), redirect: 'error' })
      if (!response.ok) throw new Error(`上游资源下载失败：${entry.name}`)
      data = Buffer.from(await response.arrayBuffer()); if (entry.gzip) data = gunzipSync(data)
      if (hash(data) !== entry.sha256) throw new Error(`上游语言哈希不符：${entry.name}`)
      await writeFile(source, data)
    }
    if (hash(data) !== entry.sha256) throw new Error(`缓存语言哈希不符：${entry.name}`)
    await copy(source, `lang/${entry.name}`)
  }
  const core = path.join(modules, 'tesseract.js-core')
  for (const name of (await readdir(core)).sort()) if (/^tesseract-core.*\.(js|wasm)$/.test(name) || name === 'LICENSE') await copy(path.join(core, name), `core/${name}`)
  await copy(path.join(modules, 'tesseract.js/dist/worker.min.js'), 'worker/worker.min.js')
  await copy(path.join(modules, 'tesseract.js/dist/worker.min.js.LICENSE.txt'), 'worker/worker.min.js.LICENSE.txt')
  await copy(path.join(modules, 'tesseract.js/LICENSE.md'), 'worker/LICENSE.md')
  const workerVersion = JSON.parse(await readFile(path.join(modules, 'tesseract.js/package.json'), 'utf8')).version
  const coreVersion = JSON.parse(await readFile(path.join(core, 'package.json'), 'utf8')).version
  const manifest = { version: 1, workerVersion, coreVersion, language: LANGUAGE_RESOURCES, files }
  await validateResourceManifest(manifest, file => readFile(path.join(target, file)))
  await writeFile(path.join(target, 'resources.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log(`离线 OCR 资源就绪：${files.length} 个文件，worker ${workerVersion}，core ${coreVersion}，语言 ${LANGUAGE_RESOURCES.version}`)
  return manifest
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await prepareLocalOcr({ download: process.argv.includes('--download') })
