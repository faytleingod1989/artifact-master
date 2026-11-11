import 'fake-indexeddb/auto'
import { clear, get, setMany } from 'idb-keyval'
import { beforeEach, expect, test } from 'vitest'
import { loadLibrary, saveLibrary } from './libraryRepository'

beforeEach(async () => { await clear() })
test('missing and explicitly empty warehouses remain empty', async () => {
  expect(await loadLibrary()).toEqual({ artifacts: [], trash: [], queueIds: [] })
  await saveLibrary({ artifacts: [], trash: [], queueIds: [] })
  expect((await loadLibrary()).artifacts).toEqual([])
})
test('round-trips legacy records and all three storage keys', async () => {
  const record = { id: 99, name: '旧名称', set: '逐影猎人', slot: '死之羽' as const, main: '攻击力 311', subs: ['旧词条'], locked: true, level: 20, score: 2, hue: 'blue' }
  await saveLibrary({ artifacts: [record], trash: [{ ...record, id: 100 }], queueIds: [99] })
  expect((await loadLibrary()).artifacts[0]).toEqual(record)
  expect(await get('artifact-master:queue')).toEqual([99])
  expect((await loadLibrary()).trash[0].id).toBe(100)
})
test('failed transaction does not partially replace warehouse and queue', async () => {
  await saveLibrary({ artifacts: [], trash: [], queueIds: [7], assets: { 'character:test': 'data:image/png;base64,original' } })
  const unclonable = { id: 1, name: '合法结构', set: '旧套装', slot: '死之羽' as const, main: '旧主词条', subs: ['旧词条'], locked: true, level: 20, score: 2, hue: 'blue', bad: () => 1 }
  await expect(saveLibrary({ artifacts: [unclonable], trash: [], queueIds: [8], assets: { 'character:test': 'data:image/png;base64,replacement' } })).rejects.toThrow()
  expect(await get('artifact-master:queue')).toEqual([7])
  expect(await get('artifact-master:artifacts')).toEqual([])
  expect(await get('artifact-master:trash')).toEqual([])
  expect(await get('artifact-master:assets')).toEqual({ 'character:test': 'data:image/png;base64,original' })
})
test('rejects corrupt stored data without replacing it', async () => {
  await setMany([['artifact-master:artifacts', 'corrupt'], ['artifact-master:queue', [1]]])
  await expect(loadLibrary()).rejects.toThrow()
  expect(await get('artifact-master:artifacts')).toBe('corrupt')
})

test('rejects duplicate IDs across live records and trash without modifying storage', async () => {
  const record = { id: 42, name: '遗留名称', set: '未知套装', slot: '死之羽' as const, main: '旧主词条', subs: ['旧词条'], locked: true, level: 20, score: 2, hue: 'blue' }
  await setMany([['artifact-master:artifacts', [record]], ['artifact-master:trash', [record]]])
  await expect(loadLibrary()).rejects.toThrow(/回收站.*42/)
  expect(await get('artifact-master:trash')).toEqual([record])
})

test('round-trips character assets in the same warehouse transaction', async () => {
  const state = { artifacts: [], trash: [], queueIds: [], assets: { 'character:芙宁娜': 'data:image/png;base64,backup' } }
  await saveLibrary(state)
  expect(await loadLibrary()).toEqual(state)
})
