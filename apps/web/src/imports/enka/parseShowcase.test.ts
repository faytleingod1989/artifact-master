import { expect, test } from 'vitest'
import fixture from './fixtures/showcase.json'
import { parseShowcase } from './parseShowcase'
import { validateDraft, draftToRecord } from '../../artifacts/artifactDraft'
test('five slots, units and levels map correctly; weapon/lower rarity and unknown are isolated', () => {
  const result = parseShowcase(fixture, 1000)
  expect(result.drafts.map(draft => draft.slot)).toEqual(['生之花', '死之羽', '时之沙', '空之杯', '理之冠'])
  expect(result.drafts.map(draft => draft.level)).toEqual([0, 20, 20, 20, 20])
  expect(result.drafts[4].main?.value).toBe(62.2)
  expect(result.drafts[4].subs[0].value).toBe(22.7)
  expect(result.skipped).toEqual({ weapons: 1, lowerRarity: 1 })
  expect(result.unknown).toHaveLength(1)
  for (const draft of result.drafts) {
    expect(validateDraft(draft).filter(issue => issue.severity === 'error')).toEqual([])
    expect(draftToRecord(draft, 1)).toMatchObject({ locked: false, source: { kind: 'uid', characterId: 10000002, fetchedAt: 1000 } })
    expect(JSON.stringify(draft)).not.toMatch(/signature|uid":|owner/)
  }
})
test.each([0, 22, NaN])('invalid API level %s cannot be saved', level => {
  const data = structuredClone(fixture); data.avatarInfoList[0].equipList[0].reliquary!.level = level
  expect(validateDraft(parseShowcase(data, 1000).drafts[0]).some(issue => issue.field === 'level' && issue.severity === 'error')).toBe(true)
})
test('unknown main property and nonfinite number are errors, hash conflicts are unknown', () => {
  const data = structuredClone(fixture)
  data.avatarInfoList[0].equipList[0].flat.reliquaryMainstat!.mainPropId = 'FIGHT_PROP_UNKNOWN'
  data.avatarInfoList[0].equipList[1].flat.reliquaryMainstat!.propValue = Infinity
  data.avatarInfoList[0].equipList[2].flat.nameTextMapHash = '128392692'
  const result = parseShowcase(data, 1000)
  expect(validateDraft(result.drafts[0]).some(issue => issue.severity === 'error')).toBe(true)
  expect(validateDraft(result.drafts[1]).some(issue => issue.severity === 'error')).toBe(true)
  expect(result.unknown).toHaveLength(2)
})
test('closed/empty is distinct from a malformed response', () => {
  expect(parseShowcase({}, 1).empty).toBe(true)
  expect(parseShowcase({ avatarInfoList: [] }, 1).empty).toBe(true)
  expect(() => parseShowcase({ avatarInfoList: 'bad' }, 1)).toThrow()
  expect(() => parseShowcase(null, 1)).toThrow()
})
