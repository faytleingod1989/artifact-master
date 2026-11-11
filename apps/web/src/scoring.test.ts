import { expect, test } from 'vitest'
import { scoreReason, scoreArtifact, recommendBuild, getCharacterStatWeights, getBuildMetrics } from './scoring'

test('role weights reflect HP lunar support, EM lunar bloom and DEF lunar crystallize instead of attack template', () => {
  const weight = (name: string, stat: string) => getCharacterStatWeights(name).find(w => w.stat === stat)?.weight ?? 0
  expect(weight('月之少女·哥伦比娅', '生命值%')).toBeGreaterThan(weight('月之少女·哥伦比娅', '攻击力%'))
  expect(weight('奈芙尔', '攻击力%')).toBe(0)
  expect(weight('兹白', '攻击力%')).toBe(0)
  expect(weight('叶洛亚', '元素精通')).toBeGreaterThan(weight('叶洛亚', '防御力%'))
})
test('flat HP cannot win merely because its raw number is larger than a critical substat', () => {
  const flower = { id: 1, slot: '生之花', level: 20, main: '生命值 4780', subs: [] as string[] }
  expect(scoreArtifact({ ...flower, subs: ['暴击伤害 +7.8%'] }, '那维莱特')).toBeGreaterThan(scoreArtifact({ ...flower, subs: ['生命值 +299'] }, '那维莱特'))
})
test('confirmed crit overflow and recharge beyond the selected build target do not inflate marginal ratings', () => {
  const piece = { id: 1, slot: '生之花', level: 20, main: '生命值 4780', subs: ['暴击率 +3.9%'] }
  expect(scoreArtifact(piece, '菲林斯', { critRate: 100 })).toBe(scoreArtifact({ ...piece, subs: [] }, '菲林斯', { critRate: 100 }))
  const recharge = { ...piece, subs: ['元素充能效率 +6.5%'] }
  expect(scoreArtifact(recharge, '菲林斯', { energyRecharge: 240 }) - scoreArtifact({ ...piece, subs: [] }, '菲林斯', { energyRecharge: 240 })).toBeLessThan(scoreArtifact(recharge, '菲林斯', { energyRecharge: 100 }) - scoreArtifact({ ...piece, subs: [] }, '菲林斯', { energyRecharge: 100 }))
})
test('known ER includes actual two-piece bonus, ascension and declared weapon without treating flat energy refund as ER', () => {
  const items = [1, 2].map(id => ({ id, slot: id === 1 ? '生之花' : '死之羽', level: 20, main: id === 1 ? '生命值 4780' : '攻击力 311', subs: [], set: '纺月的夜歌' }))
  expect(getBuildMetrics(items, '爱诺').energyRecharge).toBe(181.3)
  expect(getBuildMetrics(items, '阿罗夏').energyRecharge).toBe(177.3)
  expect(getBuildMetrics(items, '月之少女·哥伦比娅').energyRecharge).toBe(120)
  expect(getBuildMetrics(items, '爱诺', { extraEnergyRecharge: 0 }).energyRecharge).toBe(120)
})
test('recommendations produce an actual available four-piece preferred set and a matching-main offpiece', () => {
  const slots = ['生之花', '死之羽', '时之沙', '空之杯', '理之冠']
  const main = ['生命值 4780', '攻击力 311', '元素精通 187', '元素精通 187', '暴击伤害 62.2%']
  const preferred = slots.slice(0, 4).map((slot, i) => ({ id: i + 1, slot, level: 20, main: main[i], set: '穹境示现之夜', setKey: 'night-of-the-skys-unveiling', subs: ['暴击率 +3.1%', '暴击伤害 +6.2%'] }))
  const loose = slots.map((slot, i) => ({ id: i + 11, slot, level: 20, main: main[i], set: '角斗士的终幕礼', setKey: 'gladiators-finale', subs: i === 4 ? ['暴击率 +10.5%', '元素精通 +40'] : ['暴击率 +10.5%', '暴击伤害 +21%'] }))
  const result = recommendBuild([...preferred, ...loose], '奈芙尔')
  expect(result.picks.filter(p => p.set === '穹境示现之夜')).toHaveLength(4)
  expect(result.picks.find(p => p.slot === '理之冠')?.id).toBe(15)
  expect(result).toMatchObject({ setComplete: true, missingSlots: 0 })
  const free = recommendBuild([...preferred, ...loose], '奈芙尔', { setMode: 'any' })
  expect(free.picks.every(p => p.id >= 11)).toBe(true)
})
test('recommended main stats beat wrong-main high-substat pieces and unavailable four-piece sets are never claimed complete', () => {
  const items = [
    { id: 1, slot: '时之沙', level: 20, main: '元素精通 187', subs: [], set: '穹境示现之夜' },
    { id: 2, slot: '时之沙', level: 20, main: '攻击力 46.6%', subs: ['暴击伤害 +46.6%', '暴击率 +23.3%'], set: '穹境示现之夜' },
  ]
  const result = recommendBuild(items, '奈芙尔')
  expect(result.picks.map(p => p.id)).toEqual([1])
  expect(result).toMatchObject({ setComplete: false, missingSlots: 4 })
})
test('a fully upgraded artifact is never recommended for further strengthening', () => {
  const reason = scoreReason({ id: 1, slot: '理之冠', level: 20, main: '暴击率 31.1%', subs: ['暴击伤害 +21%', '攻击力 +15%', '元素充能效率 +11%'] }, '雷电将军')
  expect(reason).toContain('已满级')
  expect(reason).not.toContain('值得强化')
})

test('aggregate crit overflow does not lower a build score when another crit roll is added', () => {
  const slots = ['生之花', '死之羽', '时之沙', '空之杯', '理之冠']
  const mains = ['生命值 4780', '攻击力 311', '攻击力 46.6%', '攻击力 46.6%', '暴击率 31.1%']
  const pieces = slots.map((slot, i) => ({ id: i + 1, slot, level: 20, main: mains[i], subs: i < 4 ? ['暴击率 +19.4%'] : [] }))
  const before = recommendBuild(pieces, '菲林斯', { setMode: 'any' }).score
  const after = recommendBuild(pieces.map((p, i) => i === 0 ? { ...p, subs: ['暴击率 +23.3%'] } : p), '菲林斯', { setMode: 'any' }).score
  expect(after).toBe(before)
})
test('two-plus-two uses actual distinct sets and conditional crit requires both confirmation and four real pieces', () => {
  const slots = ['生之花', '死之羽', '时之沙', '空之杯', '理之冠']
  const mains = ['生命值 4780', '攻击力 311', '生命值 46.6%', '生命值 46.6%', '生命值 46.6%']
  const pieces = slots.map((slot, i) => ({ id: i + 1, slot, level: 20, main: mains[i], subs: [], set: i < 2 ? '千岩牢固' : '花海甘露之光' }))
  const result = recommendBuild(pieces, '沃雅妮莎', { buildId: 'hp-team' })
  expect(result.setComplete).toBe(true)
  expect(result.setPlan?.pieces).toHaveLength(2)
  const night = pieces.map(p => ({ ...p, set: '穹境示现之夜' }))
  expect(getBuildMetrics(night, '奈芙尔').critRate).toBe(5)
  expect(getBuildMetrics(night, '奈芙尔', { includeSetBonuses: true }).critRate).toBe(35)
  expect(getBuildMetrics(night.slice(0, 3), '奈芙尔', { includeSetBonuses: true }).critRate).toBe(5)
})
test('pending substats are not counted as active stats', () => {
  const p = { id: 1, slot: '生之花', level: 0, main: '生命值 717', subs: ['攻击力 +19'], pendingSubs: ['暴击率 +3.9%'] }
  const withoutPending = { ...p, pendingSubs: undefined }
  expect(scoreArtifact(p, '菲林斯')).toBe(scoreArtifact(withoutPending, '菲林斯'))
})
test('impossible legacy stat data is retained externally but cannot enter candidates or known totals', () => {
  const broken = [
    { id: 1, slot: '生之花', level: 20, main: '元素充能效率 999%', subs: [] },
    { id: 2, slot: '生之花', level: 20, main: '生命值 99999', subs: [] },
    { id: 3, slot: '生之花', level: 20, main: '生命值 4780', subs: ['暴击率 +999%'] },
    { id: 4, slot: '生之花', level: 20, main: '生命值 4780', subs: ['暴击率 +3.9%', '暴击率 +3.9%'] },
    { id: 5, slot: '生之花', level: 20, main: '生命值 4780', subs: ['生命值 +299'] },
    { id: 6, slot: '生之花', level: 0, main: '生命值 4780', subs: [] },
  ]
  const snapshot = structuredClone(broken)
  const result = recommendBuild(broken, '奈芙尔')
  expect(result.picks).toEqual([])
  expect(result.warnings.join(' ')).toContain('异常')
  expect(getBuildMetrics(broken, '奈芙尔')).toEqual({ critRate: 5, energyRecharge: 100 })
  for (const p of broken) expect(scoreArtifact(p, '奈芙尔')).toBe(0)
  for (const p of broken) expect(scoreReason(p, '奈芙尔')).toContain('核实')
  expect(broken).toEqual(snapshot)
})
test('new healing and special-energy roles do not inherit generic crit or recharge weights', () => {
  const w = (name: string, key: string) => getCharacterStatWeights(name).find(p => p.key === key)?.weight
  expect(w('珊瑚宫心海', 'critRate')).toBe(0)
  expect(w('妮露', 'critDamage')).toBe(0)
  expect(w('玛薇卡', 'energyRecharge')).toBe(0)
  expect(w('丝柯克', 'energyRecharge')).toBe(0)
  expect(getBuildMetrics([], '珊瑚宫心海').critRate).toBe(-95)
})
