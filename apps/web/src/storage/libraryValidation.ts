import { ARTIFACT_SLOTS, type ArtifactRecord } from '../artifacts/types'

export type LibraryState = { artifacts: ArtifactRecord[]; trash: ArtifactRecord[]; queueIds: number[]; assets?: Record<string, string> }

function artifactProblem(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '记录必须是对象'
  const row = value as ArtifactRecord
  if (!Number.isSafeInteger(row.id)) return '编号必须是安全整数'
  if (typeof row.name !== 'string' || typeof row.set !== 'string') return '名称和套装必须是字符串'
  if (!ARTIFACT_SLOTS.includes(row.slot)) return '部位不正确'
  if (!Number.isFinite(row.level)) return '等级必须是有限数字'
  if (row.score !== undefined && !Number.isFinite(row.score)) return '评分必须是有限数字'
  if (typeof row.main !== 'string') return '主词条必须是字符串'
  if (!Array.isArray(row.subs) || !row.subs.every(stat => typeof stat === 'string')) return '副词条必须全部是字符串'
  if (row.pendingSubs !== undefined && (!Array.isArray(row.pendingSubs) || !row.pendingSubs.every(stat => typeof stat === 'string'))) return '待激活副词条必须全部是字符串'
  if (typeof row.locked !== 'boolean' || typeof row.hue !== 'string') return '锁定状态或显示颜色不正确'
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
  const liveIds = new Set(state.artifacts.map(record => record.id))
  if (state.queueIds.length > 5 || new Set(state.queueIds).size !== state.queueIds.length) throw new Error('强化队列最多五件，且编号不可重复')
  state.queueIds.forEach((id, index) => {
    if (!liveIds.has(id)) throw new Error(`强化队列第 ${index + 1} 件：编号 ${id} 不在库存中`)
  })
  const safeAssets = payload.assets && typeof payload.assets === 'object' && !Array.isArray(payload.assets)
    ? Object.fromEntries(Object.entries(payload.assets).filter(([key, asset]) => key.startsWith('character:') && typeof asset === 'string' && asset.startsWith('data:image/')))
    : {}
  // Artifact image overrides are consumed by migration only; never restored as custom glyphs.
  const legacyAssets = payload.assets && typeof payload.assets === 'object' && !Array.isArray(payload.assets)
    ? Object.fromEntries(Object.entries(payload.assets).filter(([key, asset]) => key.startsWith('artifact:') && typeof asset === 'string' && asset.startsWith('data:image/')))
    : {}
  return { ...state, assets: { ...safeAssets, ...legacyAssets } }
}
