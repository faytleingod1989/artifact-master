import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { validateSourceMap, expectedPairKeys, inspect, assertWritableTarget } from './sync-private-five-star-artwork.mjs'

const catalogKeys = ['alpha', 'beta']
const slots = ['flower', 'plume', 'sands', 'goblet', 'circlet']
const contract = { sets: { alpha: 'alfa', beta: 'beta' }, slots: { flower: 'fwol', plume: 'pmod', sands: 'sdoe', goblet: 'gboe', circlet: 'ccol' } }

assert.deepEqual(expectedPairKeys(catalogKeys, slots), [
  'alpha/flower', 'alpha/plume', 'alpha/sands', 'alpha/goblet', 'alpha/circlet',
  'beta/flower', 'beta/plume', 'beta/sands', 'beta/goblet', 'beta/circlet',
])

assert.throws(
  () => validateSourceMap({ snapshot: '2026-08-15', entries: {} }, catalogKeys, slots, contract),
  /missing source-map entries/i,
)

const mirrorSlots = { flower: 'fwol', plume: 'pmod', sands: 'sdoe', goblet: 'gboe', circlet: 'ccol' }
const entries = Object.fromEntries(expectedPairKeys(catalogKeys, slots).map((key, index) => {
  const [catalogKey, slot] = key.split('/')
  const mirrorSetKey = catalogKey === 'alpha' ? 'alfa' : 'beta'
  const mirrorSlotKey = mirrorSlots[slot]
  return [key, {
    url: `https://raw.githubusercontent.com/gridhead/gi-loadouts/e12211c914dbaf91f5e23b7986b3d9dea4e8e85d/assets/imgs/arti/${mirrorSetKey}/${mirrorSlotKey}.webp`, mirrorSetKey, mirrorSlotKey,
  }]
}))
assert.doesNotThrow(() => validateSourceMap({ snapshot: '2026-08-15', entries }, catalogKeys, slots, contract))
const check = (changed, pattern) => assert.throws(() => validateSourceMap({ snapshot: '2026-08-15', entries: { ...entries, 'alpha/flower': { ...entries['alpha/flower'], ...changed } } }, catalogKeys, slots, contract), pattern)
check({ url: 'https://github.com/gridhead/gi-loadouts/blob/main/x' }, /fixed commit/i)
check({ mirrorSetKey: 'wrong' }, /mirror set/i)
check({ mirrorSlotKey: 'pmod' }, /mirror slot/i)
check({ url: entries['alpha/plume'].url, mirrorSlotKey: 'pmod' }, /duplicate source URL|audited mirror identity/i)
check({ url: 42 }, /string/i)
check({ mirrorSetKey: null }, /string/i)
check({ url: entries['beta/flower'].url, mirrorSetKey: entries['beta/flower'].mirrorSetKey, mirrorSlotKey: entries['beta/flower'].mirrorSlotKey }, /duplicate mirror identity|audited mirror identity/i)
assert.throws(() => validateSourceMap({ snapshot: '2026-08-15', entries: { ...entries, 'alpha/flower': { ...entries['alpha/flower'], url: entries['beta/flower'].url, mirrorSetKey: 'beta', mirrorSlotKey: 'fwol' } } }, catalogKeys, slots, contract), /audited mirror identity|duplicate/i)

const png = Buffer.alloc(33); Buffer.from([137,80,78,71,13,10,26,10]).copy(png); png.writeUInt32BE(13, 8); png.write('IHDR', 12); png.writeUInt32BE(64, 16); png.writeUInt32BE(64, 20); png[24] = 8; png[25] = 2
assert.equal(inspect(png).hasAlpha, false)
const alphaPng = Buffer.from(png); alphaPng[25] = 6
assert.equal(inspect(alphaPng).hasAlpha, true)
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'artwork-'))
await fs.writeFile(path.join(temp, 'flower.png'), Buffer.from('existing'))
await assert.rejects(() => assertWritableTarget(temp, 'flower', 'webp', Buffer.from('new')), /conflicting existing/i)
await fs.writeFile(path.join(temp, 'flower.webp'), Buffer.from('other'))
await assert.rejects(() => assertWritableTarget(temp, 'flower', 'webp', Buffer.from('new')), /ambiguous/i)
await fs.rm(temp, { recursive: true, force: true })

console.log('sync source-map validation tests passed')
