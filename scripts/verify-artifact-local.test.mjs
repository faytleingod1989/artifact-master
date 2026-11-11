import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { verifyLocalArtwork } from './verify-artifact-local.mjs'
test('local output must contain each audited hash and a reachable bundled URL', () => {
  const directory = mkdtempSync(join(tmpdir(), 'artifact-local-')); mkdirSync(join(directory, 'assets'))
  const bytes = Buffer.from('private-image'); const hash = createHash('sha256').update(bytes).digest('hex')
  const register = { entries: [{ setKey: 'one', slot: 'flower', sha256: hash }] }
  assert.throws(() => verifyLocalArtwork(directory, register), /缺少/)
  writeFileSync(join(directory, 'assets', 'flower.webp'), bytes)
  assert.throws(() => verifyLocalArtwork(directory, register), /可达/)
  writeFileSync(join(directory, 'assets', 'index.js'), 'const source="./flower.webp";')
  assert.equal(verifyLocalArtwork(directory, register).checked, 1)
})
