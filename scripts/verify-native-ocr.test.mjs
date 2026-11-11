import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { verifyNativeOcr } from './verify-native-ocr.mjs'
const root = path.resolve(import.meta.dirname, '..'), runtime = path.join(root, 'apps/web/native-ocr/runtime/ArtifactOcrWorker')
test('v2 bundles without a pinned model registry fail before any executable can be accepted', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-registry-gate-'))
  try {
    fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify({ engine: 'PP-OCRv5-server', protocolVersion: 2, files: [{ path: 'ArtifactOcrWorker.exe', bytes: 1, sha256: '0'.repeat(64) }] }))
    await assert.rejects(verifyNativeOcr(tmp), error => error.message === 'Native OCR model registry missing or invalid')
  } finally { assert(path.resolve(tmp).startsWith(path.resolve(os.tmpdir()) + path.sep)); fs.rmSync(tmp, { recursive: true, force: true }) }
})
test('native build gate verifies the real bundled helper and refuses escaping manifests', { skip: !fs.existsSync(path.join(runtime, 'ArtifactOcrWorker.exe')) }, () => {
  const run = dir => spawnSync(process.execPath, [path.join(root, 'scripts/verify-native-ocr.mjs'), dir], { encoding: 'utf8' })
  const valid = run(runtime); assert.equal(valid.status, 0, valid.stderr)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-gate-'))
  try {
    fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify({ engine: 'PP-OCRv5-server', files: [{ path: '../outside.exe', bytes: 1, sha256: '0'.repeat(64) }] }))
    assert.notEqual(run(tmp).status, 0)
  } finally { assert(path.resolve(tmp).startsWith(path.resolve(os.tmpdir()) + path.sep)); fs.rmSync(tmp, { recursive: true, force: true }) }
})
