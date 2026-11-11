import { expect, test } from 'vitest'
import { runOcrBenchmark, type OcrBenchmarkCase } from './ocrBenchmark'
import { createManualDraft } from '../imports/manualDraft'
test('a worker failure is not credited as a successful negative-image rejection',async()=>{
  const report=await runOcrBenchmark([{id:'negative',image:new Blob(),roi:{x:0,y:0,width:1,height:1},shouldReject:true}],{recognize:async()=>{throw Object.assign(Error('worker exited'),{kind:'engine-unavailable'})},dispose:async()=>{}})
  expect(report.negativePassed).toBe(0);expect(report.failures[0]?.fields[0]).toMatch(/worker exited/)
})
test('a 3.9 to 9.9 substitution fails the entire item; order alone does not', async () => {
  const expected: OcrBenchmarkCase['expected'] = { setKey: 'emblem-of-severed-fate', slot: '理之冠', level: 20, main: { key: 'critDamage', value: 62.2 }, subs: [{ key: 'critRate', value: 3.9 }, { key: 'defFlat', value: 16 }, { key: 'atkFlat', value: 19 }, { key: 'energyRecharge', value: 6.5 }] }
  const item: OcrBenchmarkCase = { id: 'numeric-error', image: new Blob(), roi: { x: 0, y: 0, width: 1, height: 1 }, expected }
  const draft = { ...createManualDraft(), ...expected, subs: [{ key: 'defFlat' as const, value: 16 }, { key: 'critRate' as const, value: 9.9 }, { key: 'atkFlat' as const, value: 19 }, { key: 'energyRecharge' as const, value: 6.5 }] }
  const session = { recognize: async () => ({ draft, rawText: '', confidence: 90 }), dispose: async () => {} }
  const report = await runOcrBenchmark([item], session)
  expect(report.exact).toBe(0); expect(report.failures[0].fields).toContain('subs.critRate')
  draft.subs[1].value = 3.9; expect((await runOcrBenchmark([item], session)).exact).toBe(1)
})
test('a plausible but wrong accepted number is counted as false acceptance', async () => {
  const expected: OcrBenchmarkCase['expected'] = { setKey: 'emblem-of-severed-fate', slot: '生之花', level: 20, main: { key: 'hpFlat', value: 4780 }, subs: [{ key: 'critRate', value: 3.9 }, { key: 'defFlat', value: 16 }, { key: 'atkFlat', value: 19 }, { key: 'energyRecharge', value: 6.5 }] }
  const draft = { ...createManualDraft(), ...expected, subs: expected.subs.map(sub => sub.key === 'critRate' ? { ...sub, value: 9.9 } : sub) }
  const report = await runOcrBenchmark([{ id: 'wrong-valid-number', image: new Blob(), roi: { x: 0, y: 0, width: 1, height: 1 }, expected }], { recognize: async () => ({ draft, rawText: '', confidence: 99 }), dispose: async () => {} })
  expect(report).toMatchObject({ total: 1, exact: 0, accepted: 1, rejected: 0, falseAccepted: 1 })
})
test('dormant stat mismatch fails the item even when active stats match', async () => {
  const expected: OcrBenchmarkCase['expected'] = { setKey: 'emblem-of-severed-fate', slot: '生之花', level: 0, main: { key: 'hpFlat', value: 717 }, subs: [{ key: 'critRate', value: 3.1 }, { key: 'atkFlat', value: 19 }, { key: 'critDamage', value: 5.4 }], pendingSubs: [{ key: 'hpPercent', value: 4.1 }] }
  const draft = { ...createManualDraft(), ...expected, pendingSubs: [{ key: 'hpPercent' as const, value: 4.7 }] }
  const report = await runOcrBenchmark([{ id: 'pending', image: new Blob(), roi: { x: 0, y: 0, width: 1, height: 1 }, expected }], { recognize: async () => ({ draft, rawText: '', confidence: 99 }), dispose: async () => {} })
  expect(report.exact).toBe(0)
  expect(report.failures[0].fields).toContain('pendingSubs')
})
test('rejects an occluded negative fixture and never counts it as a correct readable artifact', async () => {
  const draft = { ...createManualDraft(), issues: [{ field: 'source', code: 'occluded', severity: 'error' as const, message: '遮挡' }] }
  const report = await runOcrBenchmark([{ id: 'occluded', image: new Blob(), roi: { x: 0, y: 0, width: 1, height: 1 }, shouldReject: true }], { recognize: async () => ({ draft, rawText: '', confidence: 0 }), dispose: async () => {} })
  expect(report).toMatchObject({ total: 1, readable: 0, exact: 0, rejected: 1, falseAccepted: 0, negativePassed: 1 })
})
test('an incorrect piece name is not hidden by correct numeric fields', async () => {
  const expected = { setKey: 'emblem-of-severed-fate' as const, slot: '生之花' as const, name: '明威之镡', level: 20, main: { key: 'hpFlat' as const, value: 4780 }, subs: [{ key: 'critRate' as const, value: 3.9 }, { key: 'defFlat' as const, value: 16 }, { key: 'atkFlat' as const, value: 19 }, { key: 'energyRecharge' as const, value: 6.5 }] }
  const draft = { ...createManualDraft(), ...expected, name: '错误名称' }
  const report = await runOcrBenchmark([{ id: 'piece-name', image: new Blob(), roi: { x: 0, y: 0, width: 1, height: 1 }, expected }], { recognize: async () => ({ draft, rawText: '', confidence: 99 }), dispose: async () => {} })
  expect(report.failures[0]?.fields).toContain('name')
})
