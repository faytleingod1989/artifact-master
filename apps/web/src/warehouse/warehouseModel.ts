import { getCritValue, parseStat, STAT_DEFINITIONS, SUB_STAT_KEYS, type StatKey } from '../artifacts/statModel'
import { resolveArtifactSetKey } from '../assets/artifacts/manifest'
import type { ArtifactRecord, ArtifactSetKey, ArtifactSlot } from '../artifacts/types'

export type WarehouseFilters = { search: string; setKey: ArtifactSetKey | 'all'; slot: ArtifactSlot | 'all'; main: StatKey | 'all'; minLevel: number; maxLevel: number; locked: 'all' | 'locked' | 'unlocked' }
export const DEFAULT_FILTERS: WarehouseFilters = { search: '', setKey: 'all', slot: 'all', main: 'all', minLevel: 0, maxLevel: 20, locked: 'all' }
export type WarehouseSort = 'level' | 'cv' | 'recharge'
export function artifactMetrics(record: ArtifactRecord) {
  const subs = record.subs.map(parseStat)
  const known = subs.every(Boolean)
  return { cv: known ? getCritValue(subs.filter(s => s !== null)) : null, recharge: known ? subs.find(s => s?.key === 'energyRecharge')?.value ?? 0 : null, known }
}
export function filterAndSort(records: ArtifactRecord[], filters: WarehouseFilters, sort: WarehouseSort): ArtifactRecord[] {
  const searchTerm = filters.search.trim().toLowerCase()
  return records.filter(record => {
    const search = `${record.name} ${record.set} ${record.slot} ${record.main} ${record.subs.join(' ')}`.toLowerCase()
    return search.includes(searchTerm) &&
      (filters.setKey === 'all' || (record.setKey ?? resolveArtifactSetKey(record.set)) === filters.setKey) &&
      (filters.slot === 'all' || record.slot === filters.slot) && (filters.main === 'all' || parseStat(record.main)?.key === filters.main) &&
      record.level >= filters.minLevel && record.level <= filters.maxLevel &&
      (filters.locked === 'all' || record.locked === (filters.locked === 'locked'))
  }).map(record => ({ record, metric: sort === 'level' ? record.level : artifactMetrics(record)[sort] ?? -Infinity }))
    .sort((a, b) => a.metric === b.metric ? a.record.id - b.record.id : a.metric > b.metric ? -1 : 1)
    .map(entry => entry.record)
}
export function compareArtifacts(left: ArtifactRecord, right: ArtifactRecord): { comparable: boolean; reason?: string; rows: { label: string; left: string; right: string; delta: string | null }[] } {
  if (left.slot !== right.slot) return { comparable: false, reason: '部位不同，不能作为直接替换比较。请选择两件同部位圣遗物。', rows: [] }
  const rows = [{ label: '主词条', left: left.main, right: right.main, delta: null as string | null }]
  for (const key of SUB_STAT_KEYS) {
    const a = left.subs.map(parseStat).find(s => s?.key === key)
    const b = right.subs.map(parseStat).find(s => s?.key === key)
    if (!a && !b) continue
    const definition = STAT_DEFINITIONS[key]
    const uncertain = !artifactMetrics(left).known || !artifactMetrics(right).known
    const difference = Math.round(((b?.value ?? 0) - (a?.value ?? 0)) * 10) / 10
    rows.push({ label: definition.label, left: a ? `${a.value}${definition.percent ? '%' : ''}` : '—', right: b ? `${b.value}${definition.percent ? '%' : ''}` : '—', delta: uncertain ? null : `${difference > 0 ? '+' : ''}${difference}${definition.percent ? ' 百分点' : ''}` })
  }
  return { comparable: true, rows }
}
