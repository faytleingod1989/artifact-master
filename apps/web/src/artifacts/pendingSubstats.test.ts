import 'fake-indexeddb/auto'
import { clear } from 'idb-keyval'
import { beforeEach, expect, test } from 'vitest'
import { parseArtifactOcr } from './artifactOcr'
import { ocrToDraft } from '../imports/manualDraft'
import { draftToRecord, fingerprint, recordToDraft, validateDraft } from './artifactDraft'
import { getRecognitionProblems } from '../imports/recognitionCheck'
import { loadLibrary, saveLibrary } from '../storage/libraryRepository'
import { parseLibraryBackup } from '../storage/libraryValidation'
import { scoreArtifact, recommendBuild } from '../scoring'

function fromScreenshot(suffix = '（待激活）', value = '4.1') {
  return ocrToDraft(parseArtifactOcr({ title: '止于荣礼的缎彩\n生之花', stats: `生命值 717\n+0\n暴击率+3.1%\n攻击力+19\n暴击伤害+5.4%\n生命值+${value}%${suffix}`, set: '影中沉凝的幻灭：(4)' }), 'realtime')
}
beforeEach(async () => { await clear() })
test.each(['（待激活）', '(待激活)', '(待激活', '（待 激 活）'])('separates a real dormant fourth line with suffix %s', suffix => {
  const draft = fromScreenshot(suffix)
  expect(draft.subs).toEqual([{ key: 'critRate', value: 3.1 }, { key: 'atkFlat', value: 19 }, { key: 'critDamage', value: 5.4 }])
  expect(draft).toMatchObject({ pendingSubs: [{ key: 'hpPercent', value: 4.1 }] })
  expect(getRecognitionProblems(draft)).toEqual([])
})
test('pending suffix never repairs decimal digits or fills in missing active stats', () => {
  expect(getRecognitionProblems(fromScreenshot('(待激活', '4.19')).length).toBeGreaterThan(0)
  const draft = fromScreenshot()
  expect(getRecognitionProblems({ ...draft, subs: draft.subs.slice(0, 2) }).length).toBeGreaterThan(0)
})
test('pending metadata rejects conflicts, multiple dormant rows and incompatible upgraded structure', () => {
  const draft = fromScreenshot()
  for (const pendingSubs of [[{ key: 'hpFlat', value: 209 }], [{ key: 'critRate', value: 3.1 }], [{ key: 'hpPercent', value: 4.1 }, { key: 'defFlat', value: 16 }]]) {
    expect(validateDraft({ ...draft, pendingSubs } as typeof draft).some(i => i.severity === 'error')).toBe(true)
  }
  expect(getRecognitionProblems({ ...draft, level: 4, main: { key: 'hpFlat', value: 1530 } }).length).toBeGreaterThan(0)
})
test('pending rows are not truncated when extra stat rows would otherwise be hidden', () => {
  const draft = ocrToDraft(parseArtifactOcr({ title: '生之花\n+0', stats: '生命值 717\n暴击率+3.1%\n攻击力+19\n暴击伤害+5.4%\n防御力+16\n生命值+4.1%(待激活)', set: '影中沉凝的幻灭' }), 'realtime')
  expect(getRecognitionProblems(draft).length).toBeGreaterThan(0)
})
test('pending state survives edit conversion, local storage, trash and backup without scoring as active', async () => {
  const record = draftToRecord(fromScreenshot(), 981)
  expect(record).toMatchObject({ subs: ['暴击率 +3.1%', '攻击力 +19', '暴击伤害 +5.4%'], pendingSubs: ['生命值 +4.1%'] })
  expect(recordToDraft(record, 'manual')).toMatchObject({ pendingSubs: [{ key: 'hpPercent', value: 4.1 }] })
  const state = { artifacts: [record], trash: [{ ...record, id: 982 }], queueIds: [981] }
  await saveLibrary(state)
  expect(await loadLibrary()).toEqual(state)
  const restored = parseLibraryBackup(JSON.stringify({ version: 2, ...state }))
  expect(restored.artifacts[0].pendingSubs).toEqual(['生命值 +4.1%'])
  expect(restored.trash[0].pendingSubs).toEqual(['生命值 +4.1%'])
  expect(restored.queueIds).toEqual([981])
  const withNoPending = { ...record, pendingSubs: undefined }
  expect(scoreArtifact(record, '那维莱特')).toBe(scoreArtifact(withNoPending, '那维莱特'))
  expect(recommendBuild([record], '那维莱特').score).toBe(recommendBuild([withNoPending], '那维莱特').score)
})
test('backup validates optional pending metadata but keeps older records compatible', () => {
  const record = { id: 10, name: '旧花', set: '逐影猎人', slot: '生之花', level: 0, main: '生命值 717', subs: [], score: 0, locked: false, hue: 'blue' }
  expect(parseLibraryBackup(JSON.stringify({ artifacts: [record] })).artifacts).toEqual([record])
  for (const pendingSubs of ['生命值 +4.1%', [41], null]) {
    expect(() => parseLibraryBackup(JSON.stringify({ artifacts: [{ ...record, pendingSubs }] }))).toThrow()
  }
})
test('an unreadable pending value is not silently dropped from an otherwise valid three-line draft', () => {
  const draft = ocrToDraft(parseArtifactOcr({ title: '生之花\n+0', stats: '生命值 717\n暴击率+3.1%\n攻击力+19\n暴击伤害+5.4%\n生命值+?.?%(待激活)', set: '影中沉凝的幻灭' }), 'realtime')
  expect(getRecognitionProblems(draft).length).toBeGreaterThan(0)
})
test('different observed dormant stats do not disappear as an automatic duplicate', () => {
  const first = fromScreenshot(), second = fromScreenshot('(待激活)', '4.7')
  expect(fingerprint(first)).not.toBe(fingerprint(second))
})
