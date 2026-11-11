import { expect, test } from 'vitest'
import type { ArtifactRecord } from '../artifacts/types'
import { compareArtifacts, DEFAULT_FILTERS, filterAndSort } from './warehouseModel'

export const records: ArtifactRecord[] = [
  { id: 1, name: '甲', set: '逐影猎人', setKey: 'zhuying-lieren', slot: '理之冠', level: 20, main: '暴击伤害 62.2%', subs: ['暴击率 +3.9%', '元素充能效率 +22.7%'], locked: true, hue: 'blue', score: 0 },
  { id: 2, name: '乙', set: '逐影猎人', setKey: 'zhuying-lieren', slot: '理之冠', level: 0, main: '暴击率 4.7%', subs: ['暴击伤害 +7.8%', '元素充能效率 +5.2%'], locked: false, hue: 'blue', score: 0 },
  { id: 3, name: '丙', set: '黑曜秘典', setKey: 'heiyao-midian', slot: '生之花', level: 4, main: '生命值 1530', subs: ['未知'], locked: false, hue: 'blue', score: 0 },
]

test('filters set slot main level and lock, and does not mutate the input', () => {
  expect(filterAndSort(records, { ...DEFAULT_FILTERS, main: 'critRate', locked: 'unlocked', minLevel: 0, maxLevel: 4 }, 'level').map(a => a.id)).toEqual([2])
  expect(filterAndSort(records, { ...DEFAULT_FILTERS, setKey: 'heiyao-midian', slot: '生之花' }, 'level').map(a => a.id)).toEqual([3])
  expect(filterAndSort(records, { ...DEFAULT_FILTERS, search: '充能' }, 'recharge').map(a => a.id)).toEqual([1, 2])
  expect(records.map(a => a.id)).toEqual([1, 2, 3])
})
test('CV only uses subs with stable ID ties and unknown stats last', () => {
  expect(filterAndSort([...records].reverse(), DEFAULT_FILTERS, 'cv').map(a => a.id)).toEqual([1, 2, 3])
})
test('cross slot cannot be treated as a replacement and percent delta means points', () => {
  expect(compareArtifacts(records[0], records[2]).comparable).toBe(false)
  const result = compareArtifacts(records[0], records[1])
  expect(result.comparable).toBe(true)
  expect(result.rows.find(row => row.label === '元素充能效率')?.delta).toBe('-17.5 百分点')
  expect(result.rows.find(row => row.label === '主词条')?.delta).toBeNull()
})

test('CV sorting parses each accepted record once', () => {
  let reads = 0
  const input = Array.from({ length: 40 }, (_, index) => ({
    ...records[0], id: index + 1,
    get subs() { reads++; return ['暴击率 +3.9%', '暴击伤害 +7.8%'] },
  }))
  expect(filterAndSort(input, DEFAULT_FILTERS, 'cv').map(record => record.id)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1))
  // One read for searchable text, one for the precomputed metric.
  expect(reads).toBe(80)
})

test('all sort modes retain source references, unknown ordering and tied ID order', () => {
  const empty = { ...records[0], id: 8, subs: [] }
  const unknown = { ...records[0], id: 6, subs: ['未知', '暴击率 +30%'] }
  const unknown2 = { ...unknown, id: 4 }
  const input = [unknown, empty, records[1], unknown2, records[0]]
  for (const sort of ['cv', 'recharge'] as const) {
    const result = filterAndSort(input, DEFAULT_FILTERS, sort)
    expect(result.map(record => record.id)).toEqual([1, 2, 8, 4, 6])
    expect(result.every(record => input.includes(record))).toBe(true)
  }
  expect(filterAndSort(input, DEFAULT_FILTERS, 'level').map(record => record.id)).toEqual([1, 4, 6, 8, 2])
  expect(input.map(record => record.id)).toEqual([6, 8, 2, 4, 1])
})
