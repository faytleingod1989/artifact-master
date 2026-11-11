import { FIVE_STAR_ARTIFACT_SETS } from './catalog'
import { GAME_DATA, getPieceName } from './gameData'
import { formatStat, getExpectedMain, parseStat, STAT_DEFINITIONS, SUB_STAT_KEYS, type StatValue } from './statModel'
import { ARTIFACT_SLOTS, type ArtifactRecord, type ArtifactSetKey, type ArtifactSlot } from './types'

export type DraftSource = 'manual' | 'realtime' | 'screenshot' | 'uid'
export type DraftIssue = { field: string; code: string; message: string; severity: 'error' | 'warning' }
export type ArtifactDraft = {
  draftId: string; setKey?: ArtifactSetKey; slot?: ArtifactSlot; rarity: 5; level?: number
  main?: StatValue; subs: StatValue[]; pendingSubs?: StatValue[]; name?: string; source: DraftSource
  sourceCharacterId?: number; fetchedAt?: number; issues: DraftIssue[]
  observedGameLocked?: boolean
}
export type ImportDecision = { draft: ArtifactDraft; action: 'skip' | 'add' | 'update'; targetId?: number }
export type ImportResult = { artifacts: ArtifactRecord[]; added: number; updated: number; skipped: number }
export function validateDraft(draft: ArtifactDraft): DraftIssue[] {
  const issues = [...draft.issues]
  const error = (field: string, message: string) => issues.push({ field, code: 'invalid', message, severity: 'error' })
  if (!FIVE_STAR_ARTIFACT_SETS.some(set => set.key === draft.setKey)) error('setKey', '请选择已核实套装。')
  if (!draft.slot || !ARTIFACT_SLOTS.includes(draft.slot)) error('slot', '请选择部位。')
  if (draft.rarity !== 5) error('rarity', '只收入五星圣遗物。')
  if (!Number.isInteger(draft.level) || draft.level! < 0 || draft.level! > 20) error('level', '等级须为0～20整数。')
  if (!draft.main || !Number.isFinite(draft.main.value) || !(draft.main.key in STAT_DEFINITIONS)) error('main', '主词条未识别或数值非法。')
  else if (draft.slot && Number.isInteger(draft.level)) {
    const expected = getExpectedMain(draft.slot, draft.main.key, draft.level!)
    const precision = STAT_DEFINITIONS[draft.main.key].percent ? 10 : 1
    if (expected === null || Math.round(draft.main.value * precision) !== Math.round(expected * precision)) error('main', `主词条与部位/等级不符${expected === null ? '' : `，该等级应为${expected}`}。`)
  }
  if (draft.subs.length > 4) error('subs', '副词条最多四条。')
  const seen = new Set<string>()
  draft.subs.forEach((sub, index) => {
    const bounds = GAME_DATA.subBounds[sub.key]
    if (!SUB_STAT_KEYS.includes(sub.key) || !bounds || !Number.isFinite(sub.value) || sub.value < bounds.min || sub.value > bounds.max) error(`subs.${index}`, '副词条类型或数值不在五星合法范围。')
    if (seen.has(sub.key) || sub.key === draft.main?.key) error(`subs.${index}`, '副词条重复或与主词条相同。')
    seen.add(sub.key)
  })
  const pending = draft.pendingSubs ?? []
  if (pending.length && (pending.length !== 1 || draft.subs.length !== 3 || draft.level === undefined || draft.level >= 4)) error('pendingSubs', '待激活副词条仅适用于低于4级且有三条生效副词条的圣遗物，不能代替缺失的生效词条。')
  pending.forEach((sub, index) => {
    const bounds = GAME_DATA.subBounds[sub.key]
    const precision = STAT_DEFINITIONS[sub.key]?.percent ? 10 : 1
    if (!SUB_STAT_KEYS.includes(sub.key) || !bounds || !Number.isFinite(sub.value) || sub.value < bounds.min || sub.value > bounds.max || Math.abs(sub.value * precision - Math.round(sub.value * precision)) > 1e-6) error(`pendingSubs.${index}`, '待激活副词条类型、数值或显示精度异常，请核实原文。')
    if (seen.has(sub.key) || sub.key === draft.main?.key) error(`pendingSubs.${index}`, '待激活副词条重复或与主词条相同。')
    seen.add(sub.key)
  })
  return issues
}
export function allocateLocalId(existingIds: number[], now = Date.now()): number {
  const valid = existingIds.filter(Number.isSafeInteger)
  const maximum = valid.reduce((max, id) => Math.max(max, id), 0)
  const id = Math.max(Math.floor(now), maximum + 1, 1)
  if (!Number.isSafeInteger(id)) throw new Error('本地编号超出安全范围，未入库。')
  return id
}
export function draftToRecord(draft: ArtifactDraft, id: number): ArtifactRecord {
  const errors = validateDraft(draft).filter(issue => issue.severity === 'error')
  if (errors.length) throw new Error(errors.map(issue => issue.message).join(' '))
  const set = FIVE_STAR_ARTIFACT_SETS.find(set => set.key === draft.setKey)!
  return { id, name: getPieceName(set.key, draft.slot!) ?? `${set.name}·${draft.slot}`, set: set.name, setKey: set.key,
    slot: draft.slot!, level: draft.level!, main: formatStat(draft.main!), subs: draft.subs.map(sub => formatStat(sub).replace(' ', ' +')),
    ...(draft.pendingSubs?.length ? { pendingSubs: draft.pendingSubs.map(sub => formatStat(sub).replace(' ', ' +')) } : {}),
    score: 0, locked: draft.observedGameLocked === true, hue: 'blue', source: { kind: draft.source, characterId: draft.sourceCharacterId, fetchedAt: draft.fetchedAt } }
}
export function recordToDraft(record: ArtifactRecord, source: DraftSource, draftId: string = crypto.randomUUID()): ArtifactDraft {
  const issues: DraftIssue[] = []
  const main = parseStat(record.main) ?? undefined
  if (!main) issues.push({ field: 'main', code: 'unparsed', message: `旧主词条待修正：${record.main}`, severity: 'error' })
  const subs = record.subs.flatMap((text, index) => {
    const stat = parseStat(text)
    if (stat) return [stat]
    issues.push({ field: `subs.${index}`, code: 'unparsed', message: `旧副词条待修正：${text}`, severity: 'error' })
    return []
  })
  const pendingSubs = record.pendingSubs?.flatMap((text, index) => {
    const stat = parseStat(text)
    if (stat) return [stat]
    issues.push({ field: `pendingSubs.${index}`, code: 'unparsed', message: `旧待激活词条待修正：${text}`, severity: 'error' })
    return []
  })
  return { draftId, setKey: record.setKey ?? FIVE_STAR_ARTIFACT_SETS.find(set => set.name === record.set)?.key,
    name: record.name, slot: record.slot, rarity: 5, level: record.level, main, subs, ...(pendingSubs?.length ? { pendingSubs } : {}), source, issues }
}
export function fingerprint(draft: ArtifactDraft): string {
  const fields: unknown[] = [draft.setKey, draft.slot, draft.level, draft.main, draft.subs.map(sub => `${sub.key}:${sub.value}`).sort()]
  if (draft.pendingSubs?.length) fields.push(draft.pendingSubs.map(sub => `${sub.key}:${sub.value}`).sort())
  return JSON.stringify(fields)
}
export type DuplicateIndex = ReadonlyMap<string, readonly number[]>
export function buildDuplicateIndex(records: ArtifactRecord[]): DuplicateIndex {
  const index = new Map<string, number[]>()
  for (const record of records) {
    // Comparison needs parsed fields, not a new identity or stricter game validation.
    const existing = recordToDraft(record, 'manual', '')
    if (existing.issues.length) continue
    const key = fingerprint(existing)
    const ids = index.get(key)
    if (ids) ids.push(record.id)
    else index.set(key, [record.id])
  }
  return index
}
export function findDuplicateIds(draft: ArtifactDraft, records: ArtifactRecord[] | DuplicateIndex): number[] {
  const index = Array.isArray(records) ? buildDuplicateIndex(records) : records
  return [...(index.get(fingerprint(draft)) ?? [])]
}
export function createDraftReviewEvaluator(index: DuplicateIndex) {
  const cache = new WeakMap<ArtifactDraft, { issues: DraftIssue[]; duplicateIds: number[] }>()
  return (draft: ArtifactDraft) => {
    let result = cache.get(draft)
    if (!result) {
      result = { issues: validateDraft(draft), duplicateIds: findDuplicateIds(draft, index) }
      cache.set(draft, result)
    }
    return result
  }
}
export function applyImportDecisions(existing: ArtifactRecord[], entries: ImportDecision[], reservedIds: number[] = []): ImportResult {
  const result: ImportResult = { artifacts: [...existing], added: 0, updated: 0, skipped: 0 }
  const updated = new Set<number>()
  for (const entry of entries) {
    if (entry.action === 'skip') { result.skipped++; continue }
    if (entry.action === 'add') {
      const id = allocateLocalId([...result.artifacts.map(record => record.id), ...reservedIds])
      result.artifacts.push(draftToRecord(entry.draft, id)); result.added++; continue
    }
    const index = result.artifacts.findIndex(record => record.id === entry.targetId)
    if (index < 0 || updated.has(entry.targetId!)) throw new Error('请明确选择唯一的已有记录作为更新目标。')
    const old = result.artifacts[index]
    const next = draftToRecord(entry.draft, old.id)
    result.artifacts[index] = { ...next, locked: old.locked, hue: old.hue,
      source: { ...old.source, ...next.source, kind: entry.draft.source, characterId: next.source?.characterId ?? old.source?.characterId, fetchedAt: next.source?.fetchedAt ?? old.source?.fetchedAt } }
    updated.add(old.id); result.updated++
  }
  return result
}
