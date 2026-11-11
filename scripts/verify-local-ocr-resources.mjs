import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('..', import.meta.url))
export function verifyLocalOcrResources(outputRoot) {
  const directory = join(resolve(outputRoot), 'ocr'); const manifestPath = join(directory, 'resources.json')
  if (!existsSync(manifestPath)) throw new Error('离线OCR资源清单缺失。')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (!Array.isArray(manifest.files) || manifest.files.some(file => !/^(worker|core|lang)\/[\w.-]+$/.test(file.path))) throw new Error('离线OCR资源路径非法。')
  const required = ['worker/worker.min.js', 'worker/worker.min.js.LICENSE.txt', 'worker/LICENSE.md', 'core/LICENSE', ...['', '-lstm', '-simd', '-simd-lstm', '-relaxedsimd', '-relaxedsimd-lstm'].flatMap(suffix => ['js', 'wasm', 'wasm.js'].map(ext => `core/tesseract-core${suffix}.${ext}`)), 'lang/chi_sim.traineddata', 'lang/eng.traineddata', 'lang/LICENSE']
  const listed = manifest.files.map(file => file.path)
  if (new Set(listed).size !== listed.length || required.some(file => !listed.includes(file)) || manifest.workerVersion !== '7.0.0' || manifest.coreVersion !== '7.0.0') throw new Error('离线OCR资源清单不完整或版本不符。')
  for (const file of manifest.files) {
    const source = join(directory, file.path)
    if (!existsSync(source)) throw new Error(`离线OCR文件缺失：${file.path}`)
    const bytes = readFileSync(source)
    if (createHash('sha256').update(bytes).digest('hex') !== file.sha256 || bytes.length !== file.bytes) throw new Error(`离线OCR哈希或字节不符：${file.path}`)
  }
  return { checked: manifest.files.length }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(`离线OCR资源哈希通过：${verifyLocalOcrResources(process.argv[2] ?? join(root, 'apps/web/dist-local')).checked} 个文件。`)
