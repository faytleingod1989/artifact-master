import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
export async function verifyNativeOcr(dir) {
  const root = path.resolve(dir), manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'))
  if (manifest.engine !== 'PP-OCRv5-server' || !Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > 5000) throw Error('Invalid native OCR manifest')
  const required = { 'models/ch_PP-OCRv5_det_mobile.onnx': '4d97c44a20d30a81aad087d6a396b08f786c4635742afc391f6621f5c6ae78ae', 'models/ch_PP-OCRv5_rec_server.onnx': 'e09385400eaaaef34ceff54aeb7c4f0f1fe014c27fa8b9905d4709b65746562a' }
  if (manifest.protocolVersion !== undefined && manifest.protocolVersion !== 2) throw Error('Unsupported native OCR protocol')
  if (manifest.protocolVersion === 2) {
    if (!/^[a-f0-9]{64}$/.test(manifest.modelRegistrySha256 ?? '') || !/^[a-f0-9]{64}$/.test(manifest.routerSourceSha256 ?? '') || !manifest.files.some(file => file.path === 'model_registry.json') || !manifest.files.some(file => file.path === 'recognition_router.py')) throw Error('Native OCR model registry missing or invalid')
    required['model_registry.json'] = manifest.modelRegistrySha256
    required['recognition_router.py'] = manifest.routerSourceSha256
  }
  const seen = new Set()
  for (const item of manifest.files) {
    if (typeof item.path !== 'string' || item.path.includes('\\') || item.path.split('/').some(part => !part || part === '..' || part === '.') || path.isAbsolute(item.path) || seen.has(item.path) || !/^[a-f0-9]{64}$/.test(item.sha256)) throw Error('Unsafe native OCR manifest path')
    const file = path.resolve(root, item.path)
    if (!file.startsWith(root + path.sep) || (await fs.lstat(file)).isSymbolicLink()) throw Error('Escaping native OCR file')
    const bytes = await fs.readFile(file), hash = crypto.createHash('sha256').update(bytes).digest('hex')
    if (bytes.length !== item.bytes || hash !== item.sha256 || (required[item.path] && hash !== required[item.path])) throw Error('Native OCR hash mismatch: ' + item.path)
    seen.add(item.path)
  }
  for (const name of ['ArtifactOcrWorker.exe', 'licenses/MODEL_NOTICE.md', 'licenses/PaddleOCR-LICENSE.txt', ...Object.keys(required)]) if (!seen.has(name)) throw Error('Missing native OCR component: ' + name)
  if (![...seen].some(name => name.startsWith('licenses/rapidocr/')) || ![...seen].some(name => name.startsWith('licenses/onnxruntime/'))) throw Error('Native OCR license notices missing')
  return { files: seen.size, engine: manifest.engine }
}
if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  try { console.log(JSON.stringify(await verifyNativeOcr(process.argv[2] ?? path.resolve(import.meta.dirname, '../apps/web/native-ocr/runtime/ArtifactOcrWorker')))) }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
