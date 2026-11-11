import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateResourceManifest, LANGUAGE_RESOURCES } from './prepare-local-ocr.mjs'
test('language provenance is pinned, and tampered or missing local files fail validation', async () => {
  assert.match(LANGUAGE_RESOURCES.commit, /^[a-f0-9]{40}$/)
  assert.equal(LANGUAGE_RESOURCES.files.length, 3)
  await assert.rejects(validateResourceManifest({ files: [{ path: 'lang/eng.traineddata', sha256: '0'.repeat(64) }] }, () => Buffer.from('tampered')), /哈希/)
  await assert.rejects(validateResourceManifest({ files: [{ path: '../secret', sha256: '0'.repeat(64) }] }, () => Buffer.alloc(0)), /路径/)
})
