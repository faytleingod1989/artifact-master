import { expect, test, vi } from 'vitest'
import { allocateLocalId, applyImportDecisions, buildDuplicateIndex, createDraftReviewEvaluator, draftToRecord, findDuplicateIds, recordToDraft, validateDraft, type ArtifactDraft } from './artifactDraft'

const valid: ArtifactDraft = {
  draftId: 'case-one', setKey: 'silken-moons-serenade', slot: '理之冠', rarity: 5, level: 20,
  main: { key: 'critDamage', value: 62.2 },
  subs: [{ key: 'elementalMastery', value: 40 }, { key: 'defFlat', value: 16 }, { key: 'critRate', value: 3.9 }, { key: 'energyRecharge', value: 22.7 }],
  source: 'manual', issues: [],
}

test('accepts the manually verified problem-image stats and official piece name', () => {
  expect(validateDraft(valid).filter(i => i.severity === 'error')).toEqual([])
  expect(draftToRecord(valid, 9)).toMatchObject({ id: 9, name: '司信者的圣冕', main: '暴击伤害 62.2%', locked: false })
})
test.each([
  { level: 21 }, { level: 1.5 }, { level: NaN }, { level: undefined }, { setKey: undefined },
  { main: { key: 'critDamage', value: Infinity } }, { main: { key: 'critDamage', value: 9.3 } },
  { slot: '生之花' }, { subs: [{ key: 'critRate', value: 3.9 }, { key: 'critRate', value: 7.8 }] },
  { subs: [{ key: 'critDamage', value: 7.8 }] }, { subs: [{ key: 'healingBonus', value: 5 }] },
  { subs: [{ key: 'critRate', value: 100 }] }, { subs: [...valid.subs, { key: 'atkFlat', value: 16 }] },
])('blocks malformed new draft %#', patch => {
  const draft = { ...valid, ...patch } as ArtifactDraft
  expect(validateDraft(draft).some(i => i.severity === 'error')).toBe(true)
  expect(() => draftToRecord(draft, 9)).toThrow()
})
test('accepts three substats at level zero', () => {
  expect(validateDraft({ ...valid, level: 0, main: { key: 'critDamage', value: 9.3 }, subs: [{ key: 'critRate', value: 3.9 }, { key: 'atkFlat', value: 16 }, { key: 'defFlat', value: 16 }] }).filter(i => i.severity === 'error')).toEqual([])
})
test('allocates unique IDs in the same millisecond and reserves trash IDs', () => {
  const ids = [1000, 1002]
  for (let i = 0; i < 20; i++) ids.push(allocateLocalId(ids, 1000))
  expect(new Set(ids).size).toBe(22)
  expect(ids[2]).toBe(1003)
})
test('detects reordered substats without forcing physical-item merging', () => {
  const old = { ...draftToRecord(valid, 9), locked: true }
  expect(findDuplicateIds({ ...valid, subs: valid.subs.toReversed() }, [old])).toEqual([9])
  const result = applyImportDecisions([old], [{ draft: valid, action: 'add' }, { draft: valid, action: 'skip' }], [Date.now() + 10000])
  expect(result.artifacts).toHaveLength(2)
  expect(result.artifacts[0]).toEqual(old)
  expect(result).toMatchObject({ added: 1, updated: 0, skipped: 1 })
  expect(new Set(result.artifacts.map(a => a.id)).size).toBe(2)
})
test('updates only explicit target and retains local lock', () => {
  const old = { ...draftToRecord(valid, 9), locked: true }
  expect(() => applyImportDecisions([old], [{ draft: valid, action: 'update' }])).toThrow()
  expect(applyImportDecisions([old], [{ draft: { ...valid, source: 'uid' }, action: 'update', targetId: 9 }]).artifacts[0].locked).toBe(true)
})
test('unknown equipped-character OCR preserves prior character and timestamp during explicit update',()=>{
  const old={...draftToRecord(valid,9),source:{kind:'uid' as const,characterId:10000133,fetchedAt:1000}}
  const result=applyImportDecisions([old],[{draft:{...valid,source:'realtime'},action:'update',targetId:9}]).artifacts[0]
  expect(result.source).toEqual({kind:'realtime',characterId:10000133,fetchedAt:1000})
  const known=applyImportDecisions([old],[{draft:{...valid,source:'realtime',sourceCharacterId:10000052},action:'update',targetId:9}]).artifacts[0]
  expect(known.source?.characterId).toBe(10000052)
})
test('a positively observed game lock can seed a new local record but never overwrite an existing local lock choice', () => {
  expect(draftToRecord({ ...valid, observedGameLocked: true }, 10).locked).toBe(true)
  const old = { ...draftToRecord(valid, 9), locked: false }
  expect(applyImportDecisions([old], [{ draft: { ...valid, observedGameLocked: true }, action: 'update', targetId: 9 }]).artifacts[0].locked).toBe(false)
})
test('does not mutate old records or silently rename a legacy item', () => {
  const old = { ...draftToRecord(valid, 9), name: '旧名称', main: '无法解析旧词条' }
  const copy = JSON.stringify(old)
  const draft = recordToDraft(old, 'manual')
  expect(draft.name).toBe('旧名称')
  expect(draft.issues.some(i => i.field === 'main')).toBe(true)
  expect(JSON.stringify(old)).toBe(copy)
})

test('duplicate comparison preserves ID order and unknown fields without allocating draft UUIDs', () => {
  const old = draftToRecord(valid, 9)
  const uuid = vi.spyOn(crypto, 'randomUUID')
  try {
    expect(findDuplicateIds({ ...valid, subs: valid.subs.toReversed() }, [
      { ...old, id: 15 }, { ...old, id: 3 }, { ...old, id: 15 },
      { ...old, id: 20, main: '未知主词条' }, { ...old, id: 21, subs: [...old.subs, '未知'] },
    ])).toEqual([15, 3, 15])
    expect(uuid).not.toHaveBeenCalled()
  } finally { uuid.mockRestore() }
})

test('index keeps parseable legacy values and set-key precedence, and lookup results cannot mutate it', () => {
  const record = { ...draftToRecord(valid, 12), main: '暴击伤害 1%', set: '未知套装名称' }
  const legacy = { ...valid, main: { key: 'critDamage' as const, value: 1 } }
  expect(validateDraft(legacy).some(issue => issue.severity === 'error')).toBe(true)
  const index = buildDuplicateIndex([record, { ...record, id: 2 }])
  const ids = findDuplicateIds(legacy, index)
  expect(ids).toEqual([12, 2])
  ids.push(99)
  expect(findDuplicateIds(legacy, index)).toEqual([12, 2])
  expect(recordToDraft(record, 'manual').draftId).not.toBe('')
})

test('review evaluation reuses unchanged drafts, recomputes edited identity and rebuilds with inventory', () => {
  let reads = 0
  const counted = { ...valid, get subs() { reads++; return valid.subs } }
  const evaluate = createDraftReviewEvaluator(buildDuplicateIndex([draftToRecord(valid, 9)]))
  expect(evaluate(counted).duplicateIds).toEqual([9])
  const firstReads = reads
  const result = evaluate(counted)
  expect(reads).toBe(firstReads)
  expect(evaluate(counted)).toBe(result)
  const changed = { ...valid, level: 0 }
  expect(evaluate(changed).issues.some(issue => issue.severity === 'error')).toBe(true)
  expect(evaluate(changed).duplicateIds).toEqual([])
  expect(createDraftReviewEvaluator(buildDuplicateIndex([]))(counted).duplicateIds).toEqual([])
})

test('draftToRecord persists optional batchId for batch rollback and recordToDraft restores it', () => {
  const withBatch = { ...valid, batchId: 'batch-20261113' }
  const record = draftToRecord(withBatch, 101)
  expect(record.source?.batchId).toBe('batch-20261113')
  expect(recordToDraft(record, 'realtime').batchId).toBe('batch-20261113')
  const legacyRecord = draftToRecord(valid, 102)
  expect('batchId' in (legacyRecord.source ?? {})).toBe(false)
})

test('blocks substats whose roll tiers or cumulative upgrades exceed the artifact level', () => {
  const zeroWithTwentyCrit = {
    ...valid,
    slot: '生之花' as const,
    level: 0,
    main: { key: 'hpFlat' as const, value: 717 },
    subs: [{ key: 'critRate' as const, value: 20 }, { key: 'atkFlat' as const, value: 19 }, { key: 'defFlat' as const, value: 16 }],
  }
  expect(validateDraft(zeroWithTwentyCrit).some(i => i.severity === 'error' && i.field === 'subs.0')).toBe(true)

  const plusFourOverBudget = {
    ...valid,
    slot: '生之花' as const,
    level: 4,
    main: { key: 'hpFlat' as const, value: 1530 },
    subs: [{ key: 'critRate' as const, value: 7.8 }, { key: 'critDamage' as const, value: 15.5 }, { key: 'atkFlat' as const, value: 19 }, { key: 'defFlat' as const, value: 16 }],
  }
  expect(validateDraft(plusFourOverBudget).some(i => i.severity === 'error' && i.field === 'subs')).toBe(true)
})
