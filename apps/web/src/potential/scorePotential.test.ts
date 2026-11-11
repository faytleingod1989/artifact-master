import { expect, test } from 'vitest'
import { calculatePotential } from './scorePotential'
import { scoreArtifact } from '../scoring'
import { getExpectedMain } from '../artifacts/statModel'
import type { ArtifactRecord } from '../artifacts/types'
const flower: ArtifactRecord = { id: 1, name: 'test', set: '逐影猎人', setKey: 'zhuying-lieren', slot: '生之花', level: 0, main: '生命值 717', subs: ['暴击率 3.1%', '攻击力 19', '暴击伤害 5.4%'], locked: false, hue: 'blue', score: 88 }
const run = (record: ArtifactRecord, options = {}) => calculatePotential({ record, characterName: '雷电将军', options: { buildId: 'hyperbloom', ...options } })
test('unknown fourth permits EM, while fixed pending HP consumes activation without another upgrade', () => {
  expect(run(flower)).toMatchObject({ status: 'ready', min: 25, max: 60.1, remainingEvents: 5, fourth: 'unknown' })
  expect(run({ ...flower, pendingSubs: ['生命值 4.1%'] })).toMatchObject({ status: 'ready', min: 25, max: 25, fourth: 'known' })
  expect(flower.score).toBe(88); expect(flower.subs).toHaveLength(3)
})
test('legitimate completed piece collapses to its current score; malformed full pieces remain unverified', () => {
  const record = { ...flower, level: 20, main: '生命值 4780', subs: ['攻击力 9.9%', '元素充能效率 6.5%', '暴击伤害 28.0%', '暴击率 6.2%'] }
  const score = scoreArtifact(record, '雷电将军', { buildId: 'hyperbloom' })
  expect(run(record)).toMatchObject({ status: 'ready', min: score, max: score, current: score, maxed: true, remainingEvents: 0 })
  expect(run({ ...record, subs: ['元素充能效率 6.59%'] })).toMatchObject({ status: 'needs-verification' })
})
test.each([0, 3, 4, 17])('remaining event count at level %i follows thresholds rather than every level', level => {
  const record = level < 4 ? { ...flower, level, main: '生命值 ' + getExpectedMain('生之花', 'hpFlat', level) } : { ...flower, level, main: '生命值 ' + getExpectedMain('生之花', 'hpFlat', level), subs: level === 4 ? ['暴击率 3.1%', '攻击力 19', '暴击伤害 5.4%', '元素精通 23'] : ['暴击率 15.6%', '暴击伤害 7.8%', '攻击力 5.8%', '元素充能效率 13.0%'] }
  expect(run(record)).toMatchObject({ status: 'ready', remainingEvents: 5 - Math.floor(level / 4) })
})
// Independent exhaustive oracle: raw starting sums and tiers are literals, not production history/DP helpers.
test.each([{ extraCritRate: 0, extraEnergyRecharge: 0 }, { extraCritRate: 90, extraEnergyRecharge: 145 }])('two-node DP equals all 256 literal upgrade sequences at crit/ER boundaries: %o', options => {
  const record = { ...flower, level: 12, main: '生命值 ' + getExpectedMain('生之花', 'hpFlat', 12), subs: ['暴击率 15.6%', '暴击伤害 7.8%', '攻击力 5.8%', '元素充能效率 6.5%'] }
  const labels = ['暴击率 ', '暴击伤害 ', '攻击力 ', '元素充能效率 ']
  const tiers = [[27200, 31100, 35000, 38900], [54400, 62200, 69900, 77700], [40800, 46600, 52500, 58300], [45300, 51800, 58300, 64800]]
  const scores: number[] = []
  const visit = (values: number[], left: number) => {
    if (!left) { const subs = values.map((value, i) => labels[i] + (Math.floor((value + 500) / 1000) / 10) + '%'); scores.push(scoreArtifact({ ...record, level: 20, main: '生命值 4780', subs }, '雷电将军', { buildId: 'burst', ...options })); return }
    for (let i = 0; i < 4; i++) for (const tier of tiers[i]) visit(values.map((v, j) => i === j ? v + tier : v), left - 1)
  }
  visit([155600, 77700, 58300, 64800], 2)
  expect(calculatePotential({ record, characterName: '雷电将军', options: { buildId: 'burst', ...options } })).toMatchObject({ status: 'ready', min: Math.min(...scores), max: Math.max(...scores) })
})
const literalStats = {
  cr: { label: '暴击率 ', percent: true, tiers: [27200, 31100, 35000, 38900] },
  cd: { label: '暴击伤害 ', percent: true, tiers: [54400, 62200, 69900, 77700] },
  atk: { label: '攻击力 ', percent: false, tiers: [136200, 155600, 175100, 194500] },
  atkPercent: { label: '攻击力 ', percent: true, tiers: [40800, 46600, 52500, 58300] },
  hpPercent: { label: '生命值 ', percent: true, tiers: [40800, 46600, 52500, 58300] },
  def: { label: '防御力 ', percent: false, tiers: [162000, 185200, 208300, 231500] },
  defPercent: { label: '防御力 ', percent: true, tiers: [51000, 58300, 65600, 72900] },
  em: { label: '元素精通 ', percent: false, tiers: [163200, 186500, 209800, 233100] },
  er: { label: '元素充能效率 ', percent: true, tiers: [45300, 51800, 58300, 64800] },
}
function exhaustiveFinals(start: number[], statKeys: Array<keyof typeof literalStats>, nodes: number, buildId: string) {
  const visited = new Set<string>(); let min = Infinity, max = -Infinity
  const walk = (values: number[], left: number) => {
    const id = left + ':' + values.join(','); if (visited.has(id)) return; visited.add(id)
    if (!left) {
      const subs = values.map((value, i) => { const stat = literalStats[statKeys[i]], step = stat.percent ? 1000 : 10000; return stat.label + (Math.floor((value + step / 2) / step) * step / 10000) + (stat.percent ? '%' : '') })
      const score = scoreArtifact({ ...flower, level: 20, main: '生命值 4780', subs }, '雷电将军', { buildId })
      min = Math.min(min, score); max = Math.max(max, score); return
    }
    for (let i = 0; i < values.length; i++) for (const tier of literalStats[statKeys[i]].tiers) walk(values.map((v, j) => i === j ? v + tier : v), left - 1)
  }
  walk(start, nodes); return { min, max }
}
test('independent exhaustive activation oracle uses only four remaining upgrades for a known fourth row', () => {
  const expected = exhaustiveFinals([31100, 194500, 54400, 40800], ['cr', 'atk', 'cd', 'hpPercent'], 4, 'burst')
  expect(run({ ...flower, pendingSubs: ['生命值 4.1%'] }, { buildId: 'burst' })).toMatchObject({ status: 'ready', ...expected })
}, 30000)
test('independent unknown-fourth oracle covers all six non-main nonduplicate types and every tier', () => {
  let min = Infinity, max = -Infinity
  for (const key of ['hpPercent', 'atkPercent', 'def', 'defPercent', 'em', 'er'] as const) for (const tier of literalStats[key].tiers) {
    const bounds = exhaustiveFinals([31100, 194500, 54400, tier], ['cr', 'atk', 'cd', key], 4, 'burst')
    min = Math.min(min, bounds.min); max = Math.max(max, bounds.max)
  }
  expect(run(flower, { buildId: 'burst' })).toMatchObject({ status: 'ready', min, max })
}, 60000)
test('independent rounded-history oracle includes both 18.65 and 18.66 underlying crit-damage sums', () => {
  const bounds = [186500, 186600].map(cd => exhaustiveFinals([62200, cd, 58300, 64800], ['cr', 'cd', 'atkPercent', 'er'], 2, 'burst'))
  const record = { ...flower, level: 12, main: '生命值 ' + getExpectedMain('生之花', 'hpFlat', 12), subs: ['暴击率 6.2%', '暴击伤害 18.7%', '攻击力 5.8%', '元素充能效率 6.5%'] }
  expect(run(record, { buildId: 'burst' })).toMatchObject({ status: 'ready', min: Math.min(...bounds.map(b => b.min)), max: Math.max(...bounds.map(b => b.max)) })
})
