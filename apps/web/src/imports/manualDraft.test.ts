import { expect, test } from 'vitest'
import { createManualDraft } from './manualDraft'
test('continuous entry retains only identity categories and has no carried numbers', () => {
  const previous = createManualDraft('zhuying-lieren', '生之花')
  const next = createManualDraft(previous.setKey, previous.slot)
  expect(next.main).toBeUndefined()
  expect(next.level).toBeUndefined()
  expect(next.subs).toEqual([])
  expect(next.draftId).not.toBe(previous.draftId)
})
