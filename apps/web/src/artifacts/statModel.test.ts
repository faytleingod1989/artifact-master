import { expect, test } from 'vitest'
import { formatStat, getCritValue, getExpectedMain, getLegalMainStats, parseStat } from './statModel'

test.each([
  ['生命值 4,780', { key: 'hpFlat', value: 4780 }],
  ['攻击力 +9.9%', { key: 'atkPercent', value: 9.9 }],
  ['暴击率 +3.9％', { key: 'critRate', value: 3.9 }],
  ['元素充能效率 +22.7%', { key: 'energyRecharge', value: 22.7 }],
  ['攻击力 9%', { key: 'atkPercent', value: 9 }],
])('parses game units without mixing flat and percent: %s', (text, expected) => {
  expect(parseStat(text)).toEqual(expected)
})
test.each(['暴击率 NaN%', '攻击力 1e3', '生命值 -10', '待补充副词条', '暴击率 3.9'])('rejects unknown or malformed stat: %s', text => {
  expect(parseStat(text)).toBeNull()
})
test('uses slot-specific main stats and all 21 levels', () => {
  expect(getLegalMainStats('生之花')).toEqual(['hpFlat'])
  expect(getLegalMainStats('死之羽')).toEqual(['atkFlat'])
  expect(getExpectedMain('生之花', 'hpFlat', 0)).toBe(717)
  expect(getExpectedMain('生之花', 'hpFlat', 20)).toBe(4780)
  expect(getExpectedMain('理之冠', 'critDamage', 20)).toBe(62.2)
  expect(getExpectedMain('生之花', 'critDamage', 20)).toBeNull()
})
test('formats units and calculates crit value only from supplied substats', () => {
  expect(formatStat({ key: 'critDamage', value: 62.2 })).toBe('暴击伤害 62.2%')
  expect(getCritValue([{ key: 'critRate', value: 3.9 }, { key: 'elementalMastery', value: 40 }])).toBeCloseTo(7.8)
})
