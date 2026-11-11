import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { verifyLocalOcrResources } from './verify-local-ocr-resources.mjs'
test('missing, incomplete, escaping or corrupted OCR resources cannot pass', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ocr-local-')); mkdirSync(join(directory, 'ocr/lang'), { recursive: true })
  assert.throws(() => verifyLocalOcrResources(directory), /清单/)
  writeFileSync(join(directory, 'ocr/resources.json'), JSON.stringify({ files: [{ path: '../secret', sha256: '0'.repeat(64) }] }))
  assert.throws(() => verifyLocalOcrResources(directory), /路径|完整/)
  const required = ['worker/worker.min.js', 'worker/worker.min.js.LICENSE.txt', 'worker/LICENSE.md', 'core/LICENSE', ...['', '-lstm', '-simd', '-simd-lstm', '-relaxedsimd', '-relaxedsimd-lstm'].flatMap(suffix => ['js', 'wasm', 'wasm.js'].map(ext => `core/tesseract-core${suffix}.${ext}`)), 'lang/chi_sim.traineddata', 'lang/eng.traineddata', 'lang/LICENSE']
  const data = Buffer.from('resource'); const sha256 = createHash('sha256').update(data).digest('hex')
  for (const file of required) { mkdirSync(join(directory, 'ocr', file.split('/')[0]), { recursive: true }); writeFileSync(join(directory, 'ocr', file), data) }
  writeFileSync(join(directory, 'ocr/resources.json'), JSON.stringify({ workerVersion: '7.0.0', coreVersion: '7.0.0', files: required.map(path => ({ path, sha256, bytes: data.length })) }))
  assert.equal(verifyLocalOcrResources(directory).checked, required.length)
  writeFileSync(join(directory, 'ocr/lang/eng.traineddata'), 'corrupted')
  assert.throws(() => verifyLocalOcrResources(directory), /哈希|字节/)
})
