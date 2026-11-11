import { test } from 'node:test'
import assert from 'node:assert/strict'
test('native benchmark rejects duplicate IDs, missing expected fields and escaping private inputs', async () => {
  const module = await import('./benchmark-native-artifact-ocr.mjs')
  const base = { id: 'one', file: '../../../bc截图/a.png', expected: { slot: '生之花' }, roi: { x: 0, y: 0, width: 1, height: 1 } }
  assert.throws(() => module.validateManifest({ cases: [base, base] }, 'E:/AI Project/YS/tests/private/ocr/manifest.json', 'E:/AI Project/YS'), /重复/)
  assert.throws(() => module.validateManifest({ cases: [{ ...base, expected: undefined }] }, 'E:/AI Project/YS/tests/private/ocr/manifest.json', 'E:/AI Project/YS'), /期望/)
  assert.throws(() => module.validateManifest({ cases: [{ ...base, file: '../../../../../outside.png' }] }, 'E:/AI Project/YS/tests/private/ocr/manifest.json', 'E:/AI Project/YS'), /越界/)
})
test('percentiles retain slow samples and argument validation bounds repetitions', async () => {
  const { percentile, parseOptions } = await import('./benchmark-native-artifact-ocr.mjs')
  assert.equal(percentile([1, 2, 3, 4, 100], .95), 100)
  assert.equal(parseOptions(['--route', 'current', '--rounds', '5']).rounds, 5)
  assert.throws(() => parseOptions(['--rounds', '0']), /rounds/)
  assert.throws(() => parseOptions(['--route', 'online']), /route/)
})
