import { resolveArtifactSetKey } from '../assets/artifacts/manifest'
import { GAME_DATA } from '../artifacts/gameData'
import { parseStat, STAT_DEFINITIONS, SUB_STAT_KEYS } from '../artifacts/statModel'
import { ARTIFACT_SLOTS, type ArtifactRecord } from '../artifacts/types'

export type LibraryState = { artifacts: ArtifactRecord[]; trash: ArtifactRecord[]; queueIds: number[]; assets?: Record<string, string> }

export const MAX_BACKUP_FILE_BYTES = 64 * 1024 * 1024
export const MAX_CHARACTER_ASSETS_TOTAL_BYTES = 32 * 1024 * 1024
export const MAX_SINGLE_ASSET_BYTES = 3 * 1024 * 1024
export const MAX_CHARACTER_ASSETS_COUNT = 100
const MAX_RECORD_TEXT_LENGTH = 100

export function estimateDataUrlDecodedBytes(asset: string): number {
  const comma = asset.indexOf(',')
  if (comma === -1) return 0
  const body = asset.slice(comma + 1).trim()
  if (!body) return 0
  const padding = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0
  return Math.max(0, Math.ceil((body.length * 3) / 4) - padding)
}

function artifactProblem(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '记录必须是对象'
  const row = value as ArtifactRecord
  if (!Number.isSafeInteger(row.id)) return '编号必须是安全整数'
  if (typeof row.name !== 'string' || typeof row.set !== 'string') return '名称和套装必须是字符串'
  if (row.name.length > MAX_RECORD_TEXT_LENGTH || row.set.length > MAX_RECORD_TEXT_LENGTH) return '名称或套装长度不能超过 100 字符'
  if (!ARTIFACT_SLOTS.includes(row.slot)) return '部位不正确'
  if (!Number.isInteger(row.level) || row.level < 0 || row.level > 20) return '等级必须是 0～20 的整数'
  if (row.score !== undefined && !Number.isFinite(row.score)) return '评分必须是有限数字'
  if (typeof row.main !== 'string' || row.main.length > MAX_RECORD_TEXT_LENGTH) return '主词条必须是长度不超过 100 字符的字符串'
  if (!Array.isArray(row.subs) || row.subs.length > 4 || !row.subs.every(stat => typeof stat === 'string' && stat.length <= MAX_RECORD_TEXT_LENGTH)) return '副词条最多四条，且每条必须是长度不超过 100 字符的字符串'
  if (row.pendingSubs !== undefined && (!Array.isArray(row.pendingSubs) || row.pendingSubs.length > 1 || !row.pendingSubs.every(stat => typeof stat === 'string' && stat.length <= MAX_RECORD_TEXT_LENGTH))) return '待激活副词条最多一条，且必须是长度不超过 100 字符的字符串'
  if (typeof row.locked !== 'boolean' || typeof row.hue !== 'string') return '锁定状态或显示颜色不正确'
  return undefined
}

function backupRecordProblem(value: unknown): string | undefined {
  const base = artifactProblem(value)
  if (base) return base
  const row = value as ArtifactRecord
  if (!resolveArtifactSetKey(row.set)) return `不支持未知套装“${row.set}”`
  const main = parseStat(row.main)
  if (!main || !(main.key in STAT_DEFINITIONS) || !Number.isFinite(main.value) || main.value <= 0) return `主词条格式或数值无效：${row.main}`
  const seen = new Set<string>()
  for (let index = 0; index < row.subs.length; index++) {
    const text = row.subs[index]
    const parsed = parseStat(text)
    const bounds = parsed ? GAME_DATA.subBounds[parsed.key] : undefined
    if (!parsed || !SUB_STAT_KEYS.includes(parsed.key) || !bounds || !Number.isFinite(parsed.value) || parsed.value < bounds.min || parsed.value > bounds.max) {
      return `副词条第 ${index + 1} 条超出五星合法范围或无法识别：${text}`
    }
    if (parsed.key === main.key || seen.has(parsed.key)) {
      return `副词条第 ${index + 1} 条与主词条或已有副词条重复：${text}`
    }
    seen.add(parsed.key)
  }
  const pending = row.pendingSubs ?? []
  if (pending.length) {
    if (row.level >= 4 || row.subs.length !== 3 || pending.length !== 1) return '待激活副词条仅适用于低于 4 级且有三条生效副词条的圣遗物'
    const parsedPending = parseStat(pending[0])
    const bounds = parsedPending ? GAME_DATA.subBounds[parsedPending.key] : undefined
    if (!parsedPending || !SUB_STAT_KEYS.includes(parsedPending.key) || !bounds || !Number.isFinite(parsedPending.value) || parsedPending.value < bounds.min || parsedPending.value > bounds.max) {
      return `待激活副词条超出五星合法范围或无法识别：${pending[0]}`
    }
    if (parsedPending.key === main.key || seen.has(parsedPending.key)) return `待激活副词条与已有词条重复：${pending[0]}`
  }
  return undefined
}

export function isArtifactRecord(value: unknown): value is ArtifactRecord {
  return artifactProblem(value) === undefined
}

export function validateLibraryState(value: unknown): LibraryState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('仓库必须是对象')
  const state = value as LibraryState
  const ids = new Set<number>()
  for (const [label, rows] of [['库存', state.artifacts], ['回收站', state.trash]] as const) {
    if (!Array.isArray(rows)) throw new Error(`${label}必须是数组`)
    rows.forEach((row: unknown, index: number) => {
      const problem = artifactProblem(row)
      if (problem) throw new Error(`${label}第 ${index + 1} 件：${problem}`)
      const record = row as ArtifactRecord
      if (ids.has(record.id)) throw new Error(`${label}第 ${index + 1} 件：编号 ${record.id} 重复（库存和回收站须唯一）`)
      ids.add(record.id)
    })
  }
  // Local legacy queues can contain stale references. Do not silently change them on load.
  if (!Array.isArray(state.queueIds) || !state.queueIds.every(Number.isSafeInteger)) throw new Error('强化队列编号必须全部是安全整数')
  if (state.assets !== undefined && (!state.assets || typeof state.assets !== 'object' || Array.isArray(state.assets) || !Object.values(state.assets).every(asset => typeof asset === 'string'))) throw new Error('头像数据格式不正确')
  return state
}

export function parseLibraryBackup(raw: string): LibraryState {
  const payload = JSON.parse(raw) as Partial<LibraryState> & { version?: number }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('备份必须是对象')
  if (payload.version !== undefined && payload.version !== 1 && payload.version !== 2) throw new Error('不支持此备份版本')
  if (payload.version === 2 && payload.queueIds === undefined) throw new Error('新版备份缺少强化队列')
  const state = validateLibraryState({ artifacts: payload.artifacts, trash: payload.trash === undefined ? [] : payload.trash, queueIds: payload.queueIds === undefined ? [] : payload.queueIds })
  if (state.artifacts.length > 5000 || state.trash.length > 5000) throw new Error('库存或回收站超过 5000 件上限')
  for (const [label, rows] of [['库存', state.artifacts], ['回收站', state.trash]] as const) {
    rows.forEach((row, index) => {
      const problem = backupRecordProblem(row)
      if (problem) throw new Error(`${label}第 ${index + 1} 件：${problem}`)
    })
  }
  const liveIds = new Set(state.artifacts.map(record => record.id))
  if (state.queueIds.length > 5 || new Set(state.queueIds).size !== state.queueIds.length) throw new Error('强化队列最多五件，且编号不可重复')
  state.queueIds.forEach((id, index) => {
    if (!liveIds.has(id)) throw new Error(`强化队列第 ${index + 1} 件：编号 ${id} 不在库存中`)
  })
  const safeAssets: Record<string, string> = {}
  const legacyAssets: Record<string, string> = {}
  if (payload.assets !== undefined) {
    if (!payload.assets || typeof payload.assets !== 'object' || Array.isArray(payload.assets)) throw new Error('备份头像数据格式不正确')
    let characterCount = 0
    let totalCharacterBytes = 0
    for (const [key, asset] of Object.entries(payload.assets)) {
      if (key.startsWith('character:')) {
        if (typeof asset !== 'string' || !/^data:image\/(?:png|jpeg|webp);base64,/.test(asset)) {
          throw new Error(`角色头像“${key.slice('character:'.length)}”格式无效，仅允许 PNG、JPG 或 WebP。`)
        }
        const bytes = estimateDataUrlDecodedBytes(asset)
        if (bytes > MAX_SINGLE_ASSET_BYTES) throw new Error(`角色头像“${key.slice('character:'.length)}”超过 3 MB 上限`)
        characterCount++
        totalCharacterBytes += bytes
        if (characterCount > MAX_CHARACTER_ASSETS_COUNT) throw new Error(`备份角色头像最多 ${MAX_CHARACTER_ASSETS_COUNT} 张`)
        if (totalCharacterBytes > MAX_CHARACTER_ASSETS_TOTAL_BYTES) throw new Error('备份全部角色头像解码后总量超过 32 MB 上限')
        safeAssets[key] = asset
      } else if (key.startsWith('artifact:') && typeof asset === 'string' && asset.startsWith('data:image/')) {
        // Artifact image overrides are retained for user-confirmed cleanup only; never restored as custom glyphs.
        legacyAssets[key] = asset
      }
    }
  }
  return { ...state, assets: { ...safeAssets, ...legacyAssets } }
}
