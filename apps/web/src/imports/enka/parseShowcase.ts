import { GAME_DATA } from '../../artifacts/gameData'
import { STAT_DEFINITIONS, STAT_KEYS, type StatValue } from '../../artifacts/statModel'
import type { ArtifactDraft } from '../../artifacts/artifactDraft'
import type { ArtifactSlot } from '../../artifacts/types'
import type { ShowcaseParseResult } from './types'
const slots: Record<string, ArtifactSlot> = { EQUIP_BRACER: '生之花', EQUIP_NECKLACE: '死之羽', EQUIP_SHOES: '时之沙', EQUIP_RING: '空之杯', EQUIP_DRESS: '理之冠' }
function object(value: unknown): Record<string, unknown> | null { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null }
function hash(value: unknown): string | null { return typeof value === 'string' || typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : null }
function stat(value: unknown, sub = false): StatValue | undefined {
  const row = object(value)
  const key = row && STAT_KEYS.find(key => STAT_DEFINITIONS[key].prop === row[sub ? 'appendPropId' : 'mainPropId'])
  return key && typeof row!.propValue === 'number' && Number.isFinite(row!.propValue) ? { key, value: row!.propValue } : undefined
}
export function parseShowcase(payload: unknown, fetchedAt: number): ShowcaseParseResult {
  const root = object(payload)
  if (!root || !Number.isFinite(fetchedAt)) throw new Error('展柜响应格式异常。')
  const result: ShowcaseParseResult = { drafts: [], skipped: { weapons: 0, lowerRarity: 0 }, unknown: [], empty: true }
  if (root.avatarInfoList === undefined) return result
  if (!Array.isArray(root.avatarInfoList)) throw new Error('展柜角色列表格式异常。')
  result.empty = root.avatarInfoList.length === 0
  for (const entry of root.avatarInfoList) {
    const avatar = object(entry)
    const characterId = typeof avatar?.avatarId === 'number' && Number.isSafeInteger(avatar.avatarId) ? avatar.avatarId : undefined
    const unknown = (message: string) => result.unknown.push({ characterId, message })
    if (!avatar || !Array.isArray(avatar.equipList)) { unknown('角色装备列表格式异常，未导入该角色。'); continue }
    for (const equipment of avatar.equipList) {
      const row = object(equipment); const flat = object(row?.flat)
      if (flat?.itemType === 'ITEM_WEAPON') { result.skipped.weapons++; continue }
      if (flat?.itemType !== 'ITEM_RELIQUARY') { unknown('装备类型未知，未猜测其部位。'); continue }
      if (typeof flat.rankLevel !== 'number') { unknown('装备稀有度未知。'); continue }
      if (flat.rankLevel !== 5) { result.skipped.lowerRarity++; continue }
      const slot = typeof flat.equipType === 'string' && Object.hasOwn(slots, flat.equipType) ? slots[flat.equipType] : undefined
      const setHash = hash(flat.setNameTextMapHash); const pieceHash = hash(flat.nameTextMapHash)
      const setKey = setHash && Object.hasOwn(GAME_DATA.setHashes, setHash) ? GAME_DATA.setHashes[setHash] : undefined
      const piece = pieceHash && Object.hasOwn(GAME_DATA.pieceHashes, pieceHash) ? GAME_DATA.pieceHashes[pieceHash] : undefined
      if (!slot || !setKey || !piece || piece.setKey !== setKey || piece.slot !== slot) { unknown('五星装备名称、套装或部位无法可靠匹配当前字典，未导入。'); continue }
      const reliquary = object(row?.reliquary)
      const level = typeof reliquary?.level === 'number' ? reliquary.level - 1 : undefined
      const draft: ArtifactDraft = { draftId: crypto.randomUUID(), setKey, slot, name: piece.name, rarity: 5, level, main: stat(flat.reliquaryMainstat), subs: [], source: 'uid', sourceCharacterId: characterId, fetchedAt, issues: [] }
      if (characterId === undefined) draft.issues.push({ field: 'sourceCharacterId', code: 'unknown-character', severity: 'warning', message: '来源角色编号未知，请核实。' })
      if (!Array.isArray(flat.reliquarySubstats)) draft.issues.push({ field: 'subs', code: 'malformed', severity: 'error', message: '副词条列表缺失或格式异常，请核实。' })
      else for (const [index, raw] of flat.reliquarySubstats.entries()) {
        const parsed = stat(raw, true)
        if (parsed) draft.subs.push(parsed)
        else draft.issues.push({ field: `subs.${index}`, code: 'unparsed', severity: 'error', message: '未知副词条类型或非法数值，不能自动入库。' })
      }
      result.drafts.push(draft)
    }
  }
  return result
}
