import { expect, test } from 'vitest'
import { getRecognitionProblems } from './recognitionCheck'
import type { ArtifactDraft } from '../artifacts/artifactDraft'
const draft: ArtifactDraft = { draftId: 'checked', setKey: 'zhuying-lieren', rarity: 5, slot: '生之花', level: 0, main: { key: 'hpFlat', value: 717 }, subs: [{ key: 'atkFlat', value: 14 }, { key: 'defFlat', value: 16 }, { key: 'elementalMastery', value: 23 }], source: 'realtime', issues: [] }
test('valid automatically populated fields need no manual information', () => expect(getRecognitionProblems(draft)).toEqual([]))
test('missing substat lines or mismatched main cannot pass just because text was returned', () => {
  expect(getRecognitionProblems({ ...draft, subs: [] }).length).toBeGreaterThan(0)
  expect(getRecognitionProblems({ ...draft, main: { key: 'hpFlat', value: 71 } }).length).toBeGreaterThan(0)
})
test('impossible game display precision is blocked even if legacy range validation rounds it into bounds', () => {
  expect(getRecognitionProblems({ ...draft, main: { key: 'hpFlat', value: 717.1 } }).length).toBeGreaterThan(0)
  expect(getRecognitionProblems({ ...draft, subs: [{ key: 'atkFlat', value: 14.5 }, ...draft.subs.slice(1)] }).length).toBeGreaterThan(0)
  expect(getRecognitionProblems({ ...draft, subs: [{ key: 'critRate', value: 3.59 }, ...draft.subs.slice(1)] }).length).toBeGreaterThan(0)
})
test('precision failure states the actual OCR value rather than blaming the original image text', () => {
  const errors = getRecognitionProblems({ ...draft, subs: [{ key: 'energyRecharge', value: 6.54 }, ...draft.subs.slice(1)] })
  expect(errors.join(' ')).toContain('6.54%')
  expect(errors.join(' ')).toContain('一位小数')
  expect(getRecognitionProblems({ ...draft, subs: [{ key: 'energyRecharge', value: 6.5 }, ...draft.subs.slice(1)] })).toEqual([])
})
