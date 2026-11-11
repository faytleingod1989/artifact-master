import { ARTIFACT_SLOTS, type ArtifactSetKey } from './artifacts/types'
import { findArtifactSetByName, FIVE_STAR_ARTIFACT_SETS } from './artifacts/catalog'
import { getExpectedMain, parseStat, STAT_DEFINITIONS, SUB_STAT_KEYS, type StatKey, type StatValue } from './artifacts/statModel'
import { getBuildProfile, getCharacterProfile } from './characters/profiles'
import type { BuildProfile, SetPlan } from './characters/profileTypes'
import { GAME_DATA } from './artifacts/gameData'

export type ScoringArtifact = { id: number; name?: string; hue?: string; slot: string; level: number; main: string; subs: readonly string[]; set?: string; setKey?: string }
export type ScoringOptions = { buildId?: string; setMode?: 'recommended' | 'any'; includeSetBonuses?: boolean; extraCritRate?: number; extraEnergyRecharge?: number }
export type ScoreContext = ScoringOptions & { critRate?: number; energyRecharge?: number }
// Chosen units approximating one medium increase, not legal roll tables or DPS.
export const STAT_ROLL_UNITS: Partial<Record<StatKey, number>> = { critRate: 3.3, critDamage: 6.6, atkPercent: 5, atkFlat: 17, hpPercent: 5, hpFlat: 254, defPercent: 6.2, defFlat: 20, elementalMastery: 20, energyRecharge: 5.5 }
const fallback: BuildProfile = { id: 'generic', label: '通用参考', description: '', mainStats: { '时之沙': ['atkPercent', 'hpPercent', 'defPercent', 'elementalMastery', 'energyRecharge'], '空之杯': ['atkPercent', 'hpPercent', 'defPercent', 'elementalMastery', 'pyroDmgBonus', 'hydroDmgBonus', 'electroDmgBonus', 'cryoDmgBonus', 'anemoDmgBonus', 'geoDmgBonus', 'dendroDmgBonus', 'physicalDmgBonus'], '理之冠': ['critRate', 'critDamage', 'healingBonus', 'hpPercent', 'atkPercent', 'defPercent', 'elementalMastery'] }, weights: { critRate: 1, critDamage: 1, atkPercent: .7, atkFlat: .2, hpPercent: .3, hpFlat: .1, elementalMastery: .3, energyRecharge: .6 }, recharge: { min: 100, max: 160, note: '通用参考，尚无角色规则。' }, sets: [], notes: [] }
const ruleFor = (name: string, options: ScoringOptions) => getBuildProfile(name, options.buildId) ?? fallback
const finite = (value: number | undefined, defaultValue = 0) => Number.isFinite(value) ? Math.max(0, value!) : defaultValue
const rounded = (n: number) => Math.round(n * 10) / 10
const canonicalSet = (a: ScoringArtifact): ArtifactSetKey | undefined => findArtifactSetByName(a.set ?? '')?.key ?? (!a.set ? FIVE_STAR_ARTIFACT_SETS.find(s => s.key === a.setKey)?.key : undefined)
function desiredMain(build: BuildProfile, slot: string): StatKey[] {
  if (slot === '生之花') return ['hpFlat']
  if (slot === '死之羽') return ['atkFlat']
  return build.mainStats[slot as keyof BuildProfile['mainStats']] ?? []
}
// Legacy records remain stored, but syntactically parsed text is not necessarily
// legal game data. Use tolerant displayed-value bounds, never round to a roll.
function usable(item: ScoringArtifact) {
  if (!ARTIFACT_SLOTS.includes(item.slot as typeof ARTIFACT_SLOTS[number]) || !Number.isInteger(item.level) || item.level < 0 || item.level > 20 || item.subs.length > 4) return false
  const main = parseStat(item.main)
  if (!main) return false
  const slot = item.slot as typeof ARTIFACT_SLOTS[number]
  const expected = getExpectedMain(slot, main.key, item.level)
  if (expected === null || Math.abs(main.value - expected) > .15) return false
  const seen = new Set<StatKey>([main.key])
  for (const text of item.subs) {
    const stat = parseStat(text), bounds = stat ? GAME_DATA.subBounds[stat.key] : undefined
    if (!stat || !bounds || seen.has(stat.key) || stat.value < bounds.min - .1 || stat.value > bounds.max + .1) return false
    seen.add(stat.key)
  }
  return true
}
export function getCharacterStatWeights(name: string, buildId?: string): { stat: string; key: StatKey; weight: number }[] {
  const build = ruleFor(name, { buildId })
  return SUB_STAT_KEYS.map(key => ({ key, stat: STAT_DEFINITIONS[key].label + (['hpPercent', 'atkPercent', 'defPercent'].includes(key) ? '%' : ''), weight: build.weights[key] ?? 0 })).sort((a, b) => b.weight - a.weight)
}
function knownTotals(items: readonly ScoringArtifact[]) {
  const main: Partial<Record<StatKey, number>> = {}, subs: Partial<Record<StatKey, number>> = {}
  for (const item of items) {
    if (!usable(item)) continue
    const primary = parseStat(item.main)
    if (primary) main[primary.key] = (main[primary.key] ?? 0) + primary.value
    for (const text of item.subs) { const stat = parseStat(text); if (stat && SUB_STAT_KEYS.includes(stat.key)) subs[stat.key] = (subs[stat.key] ?? 0) + stat.value }
  }
  return { main, subs }
}
export function getSetCounts(items: readonly ScoringArtifact[]) {
  const counts = new Map<ArtifactSetKey, number>()
  for (const item of items) { if (!usable(item)) continue; const key = canonicalSet(item); if (key) counts.set(key, (counts.get(key) ?? 0) + 1) }
  return [...counts].map(([key, count]) => ({ key, count, name: FIVE_STAR_ARTIFACT_SETS.find(s => s.key === key)!.name }))
}
function setRecharge(items: readonly ScoringArtifact[]) {
  return getSetCounts(items).reduce((sum, row) => sum + (row.count >= 2 && ['emblem-of-severed-fate', 'silken-moons-serenade'].includes(row.key) ? 20 : 0), 0)
}
function conditionalCrit(items: readonly ScoringArtifact[], enabled?: boolean) {
  if (!enabled) return 0
  const bonuses: Partial<Record<ArtifactSetKey, number>> = { 'night-of-the-skys-unveiling': 30, 'a-day-carved-from-rising-winds': 20, 'zhuying-lieren': 36, 'heiyao-midian': 40, 'disenchantment-in-deep-shadow': 16, 'scarlet-proof': 16 }
  return getSetCounts(items).reduce((sum, row) => sum + (row.count >= 4 ? bonuses[row.key] ?? 0 : 0), 0)
}
export function getBuildMetrics(items: readonly ScoringArtifact[], name: string, options: ScoringOptions = {}) {
  const { main, subs } = knownTotals(items), profile = getCharacterProfile(name), build = ruleFor(name, options)
  return {
    critRate: rounded(5 + (profile?.ascensionCritRate ?? 0) + (profile?.critRateAdjustment ?? 0) + finite(options.extraCritRate, build.assumedWeapon?.critRate ?? 0) + (main.critRate ?? 0) + (subs.critRate ?? 0) + conditionalCrit(items, options.includeSetBonuses)),
    energyRecharge: rounded(100 + (profile?.ascensionEnergyRecharge ?? 0) + finite(options.extraEnergyRecharge, build.assumedWeapon?.energyRecharge ?? 0) + setRecharge(items) + (main.energyRecharge ?? 0) + (subs.energyRecharge ?? 0)),
  }
}
function rechargeValue(value: number, before: number, target: number) {
  const useful = Math.min(value, Math.max(0, target - before))
  return useful + (value - useful) * .15
}
function scoreContributions(items: readonly ScoringArtifact[], name: string, options: ScoreContext = {}) {
  items = items.filter(usable)
  const build = ruleFor(name, options), profile = getCharacterProfile(name), totals = knownTotals(items)
  const baseCrit = options.critRate ?? 5 + (profile?.ascensionCritRate ?? 0) + (profile?.critRateAdjustment ?? 0) + finite(options.extraCritRate, build.assumedWeapon?.critRate ?? 0) + conditionalCrit(items, options.includeSetBonuses)
  const baseER = options.energyRecharge ?? 100 + (profile?.ascensionEnergyRecharge ?? 0) + finite(options.extraEnergyRecharge, build.assumedWeapon?.energyRecharge ?? 0) + setRecharge(items)
  let score = 0
  for (const item of items) {
    const stat = parseStat(item.main)
    if (!stat || !desiredMain(build, item.slot).includes(stat.key)) continue
    const maximum = getExpectedMain(item.slot as typeof ARTIFACT_SLOTS[number], stat.key, 20)
    if (!maximum) continue
    let value = stat.value
    // Allocate main stats first; subtracting subs here as well as mains below
    // double-discounted overflow and could make an extra crit roll lower the score.
    if (stat.key === 'critRate') value = Math.min(value, Math.max(0, 100 - baseCrit))
    if (stat.key === 'energyRecharge') value = rechargeValue(value, baseER, build.recharge.max)
    score += 25 * Math.min(1, value / maximum)
  }
  const sub = ({ key, value: raw }: StatValue) => {
    let value = raw
    if (key === 'critRate') value = Math.min(value, Math.max(0, 100 - baseCrit - (totals.main.critRate ?? 0)))
    if (key === 'energyRecharge') value = rechargeValue(value, baseER + (totals.main.energyRecharge ?? 0), build.recharge.max)
    return value / (STAT_ROLL_UNITS[key] ?? 1) * (build.weights[key] ?? 0) * 6
  }
  return { main: score, sub, finish: (sum: number) => rounded(Math.min(items.length * 100, sum)), totals }
}
function evaluate(items: readonly ScoringArtifact[], name: string, options: ScoreContext = {}) {
  const scorer = scoreContributions(items, name, options)
  return scorer.finish(scorer.main + SUB_STAT_KEYS.reduce((sum, key) => sum + scorer.sub({ key, value: scorer.totals.subs[key] ?? 0 }), 0))
}
export function createSingleArtifactScorer(artifact: ScoringArtifact, name: string, context: ScoreContext = {}) {
  const { main, sub, finish } = scoreContributions([artifact], name, context)
  return { main, sub, finish }
}
export function scoreArtifact(artifact: ScoringArtifact, name: string, context: ScoreContext = {}) { return evaluate([artifact], name, context) }

export type BuildRecommendation<T extends ScoringArtifact = ScoringArtifact> = { picks: T[]; score: number; missingSlots: number; setComplete: boolean; setPlan?: SetPlan; setCounts: ReturnType<typeof getSetCounts>; warnings: string[]; buildId: string }
function combinations(values: number[], size: number): number[][] {
  if (!size) return [[]]
  return values.flatMap((v, i) => combinations(values.slice(i + 1), size - 1).map(rest => [v, ...rest]))
}
function assignments(plan: SetPlan, slots: number[], group = 0, chosen: Map<number, ArtifactSetKey> = new Map()): Map<number, ArtifactSetKey>[] {
  if (group === plan.pieces.length) return [chosen]
  const part = plan.pieces[group]
  return combinations(slots.filter(i => !chosen.has(i)), part.count).flatMap(indices => assignments(plan, slots, group + 1, new Map([...chosen, ...indices.map(i => [i, part.key] as const)])))
}
export function recommendBuild<T extends ScoringArtifact>(artifacts: readonly T[], name: string, options: ScoringOptions = {}): BuildRecommendation<T> {
  const build = ruleFor(name, options), warnings: string[] = []
  const invalid = artifacts.filter(a => !usable(a)).length
  if (invalid) warnings.push(`${invalid}件记录的词条异常或未解析，已排除候选；原记录保留在仓库，需核实后使用。`)
  artifacts = artifacts.filter(usable)
  // Bounded rule search, not exhaustive DPS optimization or Cartesian product.
  const ranked = new Map<T, number>()
  for (const artifact of artifacts) ranked.set(artifact, scoreArtifact(artifact, name, options))
  const pools = ARTIFACT_SLOTS.map(slot => {
    const all = artifacts.filter(a => a.slot === slot && parseStat(a.main))
    const ideal = all.filter(a => desiredMain(build, slot).includes(parseStat(a.main)!.key))
    if (all.length && !ideal.length) warnings.push(`${slot}暂无建议主词条，展示替代件，请核实。`)
    return [...(ideal.length ? ideal : all)].sort((a,b) => ranked.get(b)! - ranked.get(a)! || a.id - b.id)
  })
  const optimize = (rows: T[][]) => {
    let picks = rows.flatMap(pool => pool.length ? [pool[0]] : [])
    let score = evaluate(picks, name, options)
    for (let pass = 0; pass < 2; pass++) for (const pool of rows) for (const candidate of pool.slice(0, 8)) {
      const next = picks.map(p => p.slot === candidate.slot ? candidate : p), nextScore = evaluate(next, name, options)
      if (nextScore > score || nextScore === score && next.reduce((sum,p) => sum+p.id,0) < picks.reduce((sum,p) => sum+p.id,0)) { picks = next; score = nextScore }
    }
    return { picks, score }
  }
  let result: { picks: T[]; score: number } | undefined, selectedPlan: SetPlan | undefined
  if (options.setMode !== 'any') for (const plan of build.sets) {
    for (const assignment of assignments(plan, pools.flatMap((p,i) => p.length ? [i] : []))) {
      const restricted = pools.map((pool,i) => assignment.has(i) ? pool.filter(p => canonicalSet(p) === assignment.get(i)) : pool)
      if ([...assignment.keys()].some(i => !restricted[i].length)) continue
      const next = optimize(restricted)
      if (!result || next.score > result.score) { result = next; selectedPlan = plan }
    }
    // Prefer the first available declared scheme; no invented set DPS bonus.
    if (result) break
  }
  if (!result) result = optimize(pools)
  const setCounts = getSetCounts(result.picks)
  const setComplete = !!selectedPlan && selectedPlan.pieces.every(piece => (setCounts.find(c => c.key === piece.key)?.count ?? 0) >= piece.count)
  if (!setComplete && options.setMode !== 'any' && build.sets.length) warnings.push('没有可用的完整建议套装，当前按主词条与有效词条展示散件；不代表套装效果已生效。')
  if (getBuildMetrics(result.picks, name, options).energyRecharge < build.recharge.min) warnings.push('已知估算充能低于参考下限；请补充武器/其他充能属性并核对实际循环，不代表必须丢弃这些圣遗物。')
  return { ...result, missingSlots: Math.max(0, 5 - result.picks.length), setComplete, setPlan: selectedPlan, setCounts, warnings, buildId: build.id }
}
export function scoreReason(artifact: ScoringArtifact, name: string, options: ScoringOptions = {}) {
  if (!usable(artifact)) return '词条异常或未解析，请先核实；原记录仍保留，不据此建议强化'
  if (artifact.level >= 20) return '已满级：结合角色需求判断是否保留，不再需要强化'
  const build = ruleFor(name, options)
  const effective = artifact.subs.map(parseStat).filter(s => s && (build.weights[s.key] ?? 0) >= .7)
  if (effective.length >= 3) return '值得强化：命中多个高权重副词条'
  if (effective.length >= 2) return '建议保留：存在可用强化潜力'
  return '暂时保留：建议结合其他角色需求判断'
}
