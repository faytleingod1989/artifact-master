import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildEnhancementRules, readPinnedEnhancementRules } from './build-enhancement-rules.mjs'
const read = file => JSON.parse(readFileSync(new URL('../' + file, import.meta.url), 'utf8'))
const fixture = () => ({ affixes: read('_audit_AnimeGameData/ExcelBinOutput/ReliquaryAffixExcelConfigData.json'), pieces: read('_audit_AnimeGameData/ExcelBinOutput/ReliquaryExcelConfigData.json'), definitions: read('apps/web/src/artifacts/statDefinitions.json'), sourceCommit: 'fixture', sourceHashes: {} })
test('five-star real tiers convert fractions into exact integer percentage-points and exclude other depots', () => {
  const snapshot = buildEnhancementRules(fixture())
  assert.equal(Object.keys(snapshot.tiers).length, 10)
  assert.deepEqual(snapshot.tiers.energyRecharge, [45300, 51800, 58300, 64800])
  assert.deepEqual(snapshot.tiers.hpFlat, [2091300, 2390000, 2688800, 2987500])
  assert.deepEqual(snapshot.events, [4, 8, 12, 16, 20])
})
test('missing tiers or inconsistent five-star internal level nodes fail instead of guessing', () => {
  const incomplete = fixture(); incomplete.affixes = incomplete.affixes.filter(row => row.id !== 501234)
  assert.throws(() => buildEnhancementRules(incomplete), /档位/)
  const bad = fixture(); bad.pieces = bad.pieces.map(row => row.rankLevel === 5 ? { ...row, addPropLevels: [4, 8] } : row)
  assert.throws(() => buildEnhancementRules(bad), /节点/)
})
test('local pinned snapshot verifies both source hashes and is reproducible', () => {
  const a = readPinnedEnhancementRules(); assert.deepEqual(a, readPinnedEnhancementRules())
  assert.equal(a.sourceHashes['ExcelBinOutput/ReliquaryAffixExcelConfigData.json'], 'b8a6f780ed01667694d4be0c43ae09a0aa8f6d06e3b686d4c3a211a1d8a25b52')
})
