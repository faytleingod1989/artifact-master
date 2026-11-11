import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSnapshot } from './build-artifact-game-data.mjs'

test('joins UI text hashes rather than silently producing invented names', () => {
  const result = buildSnapshot({
    catalog: [['test-set', '测试套装']], text: { 10: '测试套装', 20: '核实之花' },
    sets: [{ setId: 1, equipAffixId: 2, containsList: [3] }],
    effects: [{ id: 2, nameTextMapHash: 10 }], pieces: [{ id: 3, setId: 1, nameTextMapHash: 20, equipType: 'EQUIP_BRACER', rankLevel: 5 }],
    levels: [{ rank: 5, level: 1, addProps: [{ propType: 'FIGHT_PROP_HP', value: 717 }] }],
    affixes: [{ depotId: 501, propType: 'FIGHT_PROP_CRITICAL', propValue: 0.0389 }], avatars: [],
    sourceCommit: 'fixture', sourceHashes: {},
  })
  assert.deepEqual(result.pieceHashes['20'], { setKey: 'test-set', slot: '生之花', name: '核实之花' })
  assert.equal(result.mainGrowth.hpFlat[0], 717)
  assert.equal(result.subBounds.critRate.min, 3.9)
})
test('rejects conflicting or missing canonical names', () => {
  assert.throws(() => buildSnapshot({ catalog: [['test', '无匹配']], text: {}, sets: [], effects: [], pieces: [], levels: [], affixes: [], avatars: [], sourceCommit: 'fixture', sourceHashes: {} }))
})
