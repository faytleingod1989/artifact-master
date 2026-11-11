import type { ArtifactRecord } from '../artifacts/types'
import { getExpectedMain, parseStat, STAT_DEFINITIONS, SUB_STAT_KEYS, type StatKey } from '../artifacts/statModel'
import { displayUnits, getRollSums } from './enhancementRules'
export type RollValue = { key: StatKey; units: number; rolls: number }
export type RollHistory = { initialCount: 3 | 4; mainKey: StatKey; active: readonly RollValue[]; pending?: { key: StatKey; units: number } }
export type HistoryResult = { status: 'ready'; histories: readonly RollHistory[] } | { status: 'needs-verification'; reasons: string[] }
const invalid = (reason: string): HistoryResult => ({ status: 'needs-verification', reasons: [reason] })
export function getRollHistories(record: ArtifactRecord): HistoryResult {
  const main = parseStat(record.main)
  if (!main || !Number.isInteger(record.level) || record.level < 0 || record.level > 20 || getExpectedMain(record.slot, main.key, record.level) !== main.value) return invalid('等级或主词条成长值需核实。')
  if (record.subs.length !== 4 && !(record.subs.length === 3 && record.level < 4)) return invalid('生效副词条数量与等级不符。')
  const active = record.subs.map(parseStat), pending = (record.pendingSubs ?? []).map(parseStat)
  if (pending.length > 1 || pending.length && (record.level >= 4 || active.length !== 3)) return invalid('待激活词条状态需核实。')
  const seen = new Set<StatKey>([main.key])
  for (const stat of [...active, ...pending]) {
    if (!stat || !SUB_STAT_KEYS.includes(stat.key) || seen.has(stat.key)) return invalid('副词条缺失、重复或与主词条冲突。')
    const precision = STAT_DEFINITIONS[stat.key].percent ? 10 : 1
    if (Math.abs(stat.value * precision - Math.round(stat.value * precision)) > 1e-6) return invalid('副词条显示精度需核实。')
    seen.add(stat.key)
  }
  const choices = active.map(stat => {
    const result: RollValue[] = []
    for (let rolls = 1; rolls <= 6; rolls++) for (const units of getRollSums(stat!.key, rolls)) if (displayUnits(stat!.key, units) === stat!.value) result.push({ key: stat!.key, units, rolls })
    return result
  })
  if (choices.some(rows => !rows.length)) return invalid('副词条数值无法由五星真实档位组成。')
  const pendingChoices = pending.length ? getRollSums(pending[0]!.key, 1).filter(units => displayUnits(pending[0]!.key, units) === pending[0]!.value).map(units => ({ key: pending[0]!.key, units })) : [undefined]
  if (!pendingChoices.length) return invalid('待激活词条数值无法由五星初始档位组成。')
  const histories: RollHistory[] = [], passed = Math.floor(record.level / 4)
  for (const initialCount of [3, 4] as const) {
    if (active.length !== (passed === 0 ? initialCount : 4)) continue
    const target = initialCount + passed
    const visit = (index: number, rolls: number, selected: RollValue[]) => {
      if (rolls > target) return
      if (index === choices.length) { if (rolls === target) for (const nextPending of pendingChoices) histories.push({ initialCount, mainKey: main.key, active: selected, ...(nextPending ? { pending: nextPending } : {}) }); return }
      for (const row of choices[index]) visit(index + 1, rolls + row.rolls, [...selected, row])
    }
    visit(0, 0, [])
  }
  return histories.length ? { status: 'ready', histories } : invalid('显示数值与已发生的强化次数无法组成合法历史。')
}
