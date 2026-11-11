import definitions from './statDefinitions.json'
import { GAME_DATA } from './gameData'
import type { ArtifactSlot } from './types'

export type StatKey = keyof typeof definitions
export type StatValue = { key: StatKey; value: number }
export const STAT_DEFINITIONS = definitions
export const STAT_KEYS = Object.keys(definitions) as StatKey[]
export const SUB_STAT_KEYS = STAT_KEYS.filter(key => definitions[key].sub)
export function parseStat(text: string): StatValue | null {
  const normalized = text.replace(/\s/g, '').replaceAll('％', '%').replaceAll(',', '').replaceAll('，', '')
  const match = normalized.match(/^(.+?)\+?(\d+(?:\.\d+)?)(%)?$/)
  if (!match) return null
  const key = STAT_KEYS.find(key => definitions[key].label === match[1] && definitions[key].percent === Boolean(match[3]))
  const value = Number(match[2])
  return key && Number.isFinite(value) ? { key, value } : null
}
export function formatStat(stat: StatValue): string {
  const definition = definitions[stat.key]
  return `${definition.label} ${stat.value}${definition.percent ? '%' : ''}`
}
export function getLegalMainStats(slot: ArtifactSlot): StatKey[] {
  return STAT_KEYS.filter(key => (definitions[key].slots as string[]).includes(slot))
}
export function getExpectedMain(slot: ArtifactSlot, key: StatKey, level: number): number | null {
  if (!Number.isInteger(level) || level < 0 || level > 20 || !getLegalMainStats(slot).includes(key)) return null
  return GAME_DATA.mainGrowth[key]?.[level] ?? null
}
export function getCritValue(subs: StatValue[]): number {
  return Math.round(subs.reduce((sum, stat) => sum + (stat.key === 'critRate' ? stat.value * 2 : stat.key === 'critDamage' ? stat.value : 0), 0) * 10) / 10
}
