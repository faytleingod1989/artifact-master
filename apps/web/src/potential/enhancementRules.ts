import snapshot from './enhancementRules.snapshot.json'
import { STAT_DEFINITIONS, type StatKey } from '../artifacts/statModel'
export const ENHANCEMENT_RULES = snapshot as typeof snapshot & { tiers: Partial<Record<StatKey, number[]>> }
export const RULE_VERSION = ENHANCEMENT_RULES.version
export const SCALE = 10000
export function displayUnits(key: StatKey, units: number): number {
  const step = STAT_DEFINITIONS[key].percent ? 1000 : 10000
  return Math.floor((units + step / 2) / step) * step / SCALE
}
const sumCache = new Map<string, readonly number[]>()
export function getRollSums(key: StatKey, count: number): readonly number[] {
  if (!Number.isInteger(count) || count < 0 || count > 6) return []
  const cacheKey = key + ':' + count, existing = sumCache.get(cacheKey)
  if (existing) return existing
  let sums = new Set([0])
  for (let i = 0; i < count; i++) sums = new Set([...sums].flatMap(n => (ENHANCEMENT_RULES.tiers[key] ?? []).map(tier => n + tier)))
  const result = [...sums].sort((a, b) => a - b); sumCache.set(cacheKey, result); return result
}
