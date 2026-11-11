import { createSingleArtifactScorer, scoreArtifact } from '../scoring'
import { getCharacterProfile, getBuildProfile } from '../characters/profiles'
import { formatStat, getExpectedMain, SUB_STAT_KEYS } from '../artifacts/statModel'
import { displayUnits, getRollSums, RULE_VERSION } from './enhancementRules'
import { getRollHistories, type RollValue } from './rollHistory'
import type { PotentialInput, PotentialResult } from './potentialTypes'

export function calculatePotential({ record, characterName, options }: PotentialInput): PotentialResult {
  if (!getCharacterProfile(characterName) || options.buildId && !getCharacterProfile(characterName)?.builds.some(build => build.id === options.buildId) || !getBuildProfile(characterName, options.buildId)) return { status: 'needs-verification', reasons: ['请选择有效角色和玩法。'] }
  const history = getRollHistories(record)
  if (history.status !== 'ready') return history
  const context = { ...options, includeSetBonuses: false }
  const current = scoreArtifact(record, characterName, context), remainingEvents = 5 - Math.floor(record.level / 4)
  const fourth = record.subs.length === 4 ? 'none' : record.pendingSubs?.length ? 'known' : 'unknown'
  if (record.level === 20) return { status: 'ready', current, min: current, max: current, maxed: true, remainingEvents, fourth, ruleVersion: RULE_VERSION }
  let min = Infinity, max = -Infinity
  for (const prior of history.histories) {
    const finished = { ...record, level: 20, main: formatStat({ key: prior.mainKey, value: getExpectedMain(record.slot, prior.mainKey, 20)! }) }
    const scorer = createSingleArtifactScorer(finished, characterName, context)
    const candidates: readonly RollValue[][] = prior.active.length === 4 ? [[]] : prior.pending ? [[{ ...prior.pending, rolls: 1 }]] : SUB_STAT_KEYS.filter(key => key !== prior.mainKey && !prior.active.some(stat => stat.key === key)).flatMap(key => getRollSums(key, 1).map(units => [{ key, units, rolls: 1 }]))
    for (const fourthRow of candidates) {
      const stats = [...prior.active, ...fourthRow], upgrades = remainingEvents - (fourthRow.length ? 1 : 0)
      let lows = [0, ...Array(upgrades).fill(Infinity)] as number[], highs = [0, ...Array(upgrades).fill(-Infinity)] as number[]
      for (const stat of stats) {
        const low: number[] = [], high: number[] = []
        for (let count = 0; count <= upgrades; count++) {
          const scores = getRollSums(stat.key, count).map(delta => scorer.sub({ key: stat.key, value: displayUnits(stat.key, stat.units + delta) }))
          low[count] = Math.min(...scores); high[count] = Math.max(...scores)
        }
        const nextLow = Array(upgrades + 1).fill(Infinity) as number[], nextHigh = Array(upgrades + 1).fill(-Infinity) as number[]
        for (let used = 0; used <= upgrades; used++) for (let extra = 0; extra <= upgrades - used; extra++) {
          nextLow[used + extra] = Math.min(nextLow[used + extra], lows[used] + low[extra])
          nextHigh[used + extra] = Math.max(nextHigh[used + extra], highs[used] + high[extra])
        }
        lows = nextLow; highs = nextHigh
      }
      min = Math.min(min, scorer.finish(scorer.main + lows[upgrades])); max = Math.max(max, scorer.finish(scorer.main + highs[upgrades]))
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { status: 'needs-verification', reasons: ['没有可达的合法+20结果，请核实词条。'] }
  return { status: 'ready', current, min, max, remainingEvents, fourth, maxed: false, ruleVersion: RULE_VERSION }
}
