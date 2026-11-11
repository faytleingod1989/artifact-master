import { expect, test } from 'vitest'
import { getRollHistories } from './rollHistory'
import { displayUnits, getRollSums } from './enhancementRules'
import type { ArtifactRecord } from '../artifacts/types'
export const flower: ArtifactRecord = { id: 1, name: 'test', set: '逐影猎人', setKey: 'zhuying-lieren', slot: '生之花', level: 0, main: '生命值 717', subs: ['暴击率 3.1%', '攻击力 19', '暴击伤害 5.4%'], locked: false, hue: 'blue', score: 88 }
test('real integer tiers display ER 6.48 as 6.5 and flat HP 209.13 as 209', () => {
  expect(displayUnits('energyRecharge', 64800)).toBe(6.5)
  expect(displayUnits('hpFlat', 2091300)).toBe(209)
  expect(getRollSums('critRate', 2)).toContain(62200)
})
test('initial three and four rows are legal; a visible pending row has a fixed type and raw tier', () => {
  const result = getRollHistories({ ...flower, pendingSubs: ['生命值 4.1%'] })
  expect(result.status).toBe('ready')
  if (result.status === 'ready') {
    expect(result.histories.every(h => h.initialCount === 3 && h.active.reduce((n, s) => n + s.rolls, 0) === 3)).toBe(true)
    expect(result.histories.map(h => h.pending)).toEqual([{ key: 'hpPercent', units: 40800 }])
  }
  expect(getRollHistories({ ...flower, subs: [...flower.subs, '元素充能效率 6.5%'] }).status).toBe('ready')
})
test('rounded totals retain every feasible underlying sum instead of adding already-rounded rolls', () => {
  const result = getRollHistories({ ...flower, level: 20, main: '生命值 4780', subs: ['暴击率 6.2%', '暴击伤害 28.0%', '攻击力 9.9%', '元素充能效率 6.5%'] })
  expect(result.status).toBe('ready')
  if (result.status === 'ready') {
    const sums = new Set(result.histories.map(h => h.active.find(s => s.key === 'critRate')!.units))
    expect(sums).toContain(62200)
    expect(new Set(result.histories.map(h => h.active.find(s => s.key === 'critDamage')!.units)).size).toBeGreaterThan(1)
    expect(result.histories.every(h => h.active.reduce((n, s) => n + s.rolls, 0) === h.initialCount + 5)).toBe(true)
  }
})
test.each([
  { ...flower, level: 4 },
  { ...flower, subs: ['暴击率 6.59%', '攻击力 19', '暴击伤害 5.4%'] },
  { ...flower, pendingSubs: ['暴击率 3.1%'] },
  { ...flower, subs: ['暴击率 3.1%', '暴击率 3.5%', '暴击伤害 5.4%'] },
  { ...flower, subs: ['生命值 299', '攻击力 19', '暴击伤害 5.4%'] },
  { ...flower, subs: ['暴击率 20%', '攻击力 19', '暴击伤害 5.4%'] },
])('impossible or malformed records are preserved but cannot produce potential: %#', record => {
  const original = JSON.stringify(record)
  expect(getRollHistories(record).status).toBe('needs-verification'); expect(JSON.stringify(record)).toBe(original)
})
