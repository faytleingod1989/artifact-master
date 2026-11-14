import { resolveArtifactSetKey } from '../assets/artifacts/manifest'
import { getValidRollCountsForLevel } from '../artifacts/artifactDraft'
import { GAME_DATA } from '../artifacts/gameData'
import { getExpectedMain, parseStat, STAT_DEFINITIONS, SUB_STAT_KEYS } from '../artifacts/statModel'
import { ARTIFACT_SLOTS, type ArtifactRecord } from '../artifacts/types'

export type LibraryState = { artifacts: ArtifactRecord[]; trash: ArtifactRecord[]; queueIds: number[]; assets?: Record<string, string> }

export const MAX_BACKUP_FILE_BYTES = 64 * 1024 * 1024
export const MAX_CHARACTER_ASSETS_TOTAL_BYTES = 32 * 1024 * 1024
export const MAX_SINGLE_ASSET_BYTES = 3 * 1024 * 1024
export const MAX_CHARACTER_ASSETS_COUNT = 100
export const MAX_AVATAR_DIMENSION = 4096
const MAX_RECORD_TEXT_LENGTH = 100

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let c = 0xffffffff
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function decodeBase64Bytes(body: string): Uint8Array | undefined {
  if (!body || body.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body)) return undefined
  const padding = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0
  const estimated = (body.length * 3) / 4 - padding
  if (estimated <= 0 || estimated > MAX_SINGLE_ASSET_BYTES) return undefined
  let binary: string
  try {
    binary = atob(body)
  } catch {
    return undefined
  }
  if (binary.length === 0 || binary.length > MAX_SINGLE_ASSET_BYTES) return undefined
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function readU16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1]
}

function readU32BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
}

function readU32LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
}

function ascii4(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3])
}

function inspectPng(bytes: Uint8Array): { width: number; height: number } | undefined {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (bytes.length < 45 || sig.some((value, index) => bytes[index] !== value)) return undefined
  let offset = 8
  let width = 0
  let height = 0
  let ihdrSeen = false
  let hasIdat = false
  let hasIend = false
  while (offset + 12 <= bytes.length) {
    const length = readU32BE(bytes, offset)
    const type = ascii4(bytes, offset + 4)
    if (!/^[A-Za-z]{4}$/.test(type) || offset + 12 + length > bytes.length) return undefined
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    const expectedCrc = readU32BE(bytes, dataEnd)
    if (crc32(bytes, offset + 4, dataEnd) !== expectedCrc) return undefined
    if (!ihdrSeen) {
      if (type !== 'IHDR' || length !== 13) return undefined
      width = readU32BE(bytes, dataStart)
      height = readU32BE(bytes, dataStart + 4)
      const bitDepth = bytes[dataStart + 8]
      const colorType = bytes[dataStart + 9]
      const compression = bytes[dataStart + 10]
      const filter = bytes[dataStart + 11]
      const interlace = bytes[dataStart + 12]
      if (![1, 2, 4, 8, 16].includes(bitDepth) || ![0, 2, 3, 4, 6].includes(colorType) || compression !== 0 || filter !== 0 || interlace > 1) return undefined
      ihdrSeen = true
    } else if (type === 'IDAT') {
      if (length === 0) return undefined
      hasIdat = true
    } else if (type === 'IEND') {
      if (length !== 0 || dataEnd + 4 !== bytes.length) return undefined
      hasIend = true
      break
    }
    offset = dataEnd + 4
  }
  if (!ihdrSeen || !hasIdat || !hasIend || width < 1 || height < 1 || width > MAX_AVATAR_DIMENSION || height > MAX_AVATAR_DIMENSION) {
    return undefined
  }
  return { width, height }
}

const JPEG_SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])

function inspectJpeg(bytes: Uint8Array): { width: number; height: number } | undefined {
  if (bytes.length < 16 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return undefined
  let pos = 2
  let width = 0
  let height = 0
  let hasSof = false
  let hasSos = false
  let hasEoi = false
  while (pos < bytes.length) {
    if (bytes[pos] !== 0xff) return undefined
    while (pos < bytes.length && bytes[pos] === 0xff) pos++
    if (pos >= bytes.length) return undefined
    const marker = bytes[pos++]
    if (marker === 0xd9) {
      hasEoi = pos === bytes.length
      break
    }
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue
    if (pos + 2 > bytes.length) return undefined
    const segLen = readU16BE(bytes, pos)
    if (segLen < 2 || pos + segLen > bytes.length) return undefined
    if (marker === 0xda) {
      hasSos = true
      hasEoi = bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9
      break
    }
    if (JPEG_SOF_MARKERS.has(marker)) {
      if (segLen < 7) return undefined
      height = readU16BE(bytes, pos + 3)
      width = readU16BE(bytes, pos + 5)
      hasSof = true
    }
    pos += segLen
  }
  if (!hasSof || !hasSos || !hasEoi || width < 1 || height < 1 || width > MAX_AVATAR_DIMENSION || height > MAX_AVATAR_DIMENSION) {
    return undefined
  }
  return { width, height }
}

function inspectWebp(bytes: Uint8Array): { width: number; height: number } | undefined {
  if (bytes.length < 26 || ascii4(bytes, 0) !== 'RIFF' || ascii4(bytes, 8) !== 'WEBP') return undefined
  const riffSize = readU32LE(bytes, 4)
  if (8 + riffSize > bytes.length || riffSize < 12) return undefined
  const chunkType = ascii4(bytes, 12)
  const chunkSize = readU32LE(bytes, 16)
  if (20 + chunkSize > bytes.length) return undefined
  let width = 0
  let height = 0
  if (chunkType === 'VP8 ') {
    if (chunkSize < 10 || bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return undefined
    width = (bytes[26] | (bytes[27] << 8)) & 0x3fff
    height = (bytes[28] | (bytes[29] << 8)) & 0x3fff
  } else if (chunkType === 'VP8L') {
    if (chunkSize < 5 || bytes[20] !== 0x2f) return undefined
    const bits = readU32LE(bytes, 21)
    width = (bits & 0x3fff) + 1
    height = ((bits >> 14) & 0x3fff) + 1
  } else if (chunkType === 'VP8X') {
    if (chunkSize < 10) return undefined
    width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16))
    height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16))
  } else {
    return undefined
  }
  if (width < 1 || height < 1 || width > MAX_AVATAR_DIMENSION || height > MAX_AVATAR_DIMENSION) return undefined
  return { width, height }
}

export function inspectAvatarDataUrl(asset: string): { mime: 'image/png' | 'image/jpeg' | 'image/webp'; bytes: number; width: number; height: number; buffer: Uint8Array } | undefined {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(asset)
  if (!match) return undefined
  const mime = match[1] as 'image/png' | 'image/jpeg' | 'image/webp'
  const buffer = decodeBase64Bytes(match[2])
  if (!buffer) return undefined
  const dims = mime === 'image/png' ? inspectPng(buffer) : mime === 'image/jpeg' ? inspectJpeg(buffer) : inspectWebp(buffer)
  if (!dims) return undefined
  return { mime, bytes: buffer.length, width: dims.width, height: dims.height, buffer }
}

export async function decodeAvatarDataUrl(asset: string): Promise<{ width: number; height: number }> {
  const inspected = inspectAvatarDataUrl(asset)
  if (!inspected) throw new Error('图片格式、文件签名或尺寸无效，仅允许不超过 3 MB 且宽高 4096 像素以内的 PNG、JPG 或 WebP。')
  if (typeof createImageBitmap === 'function') {
    let bitmap: ImageBitmap
    try {
      const payload = new Uint8Array(inspected.buffer.byteLength)
      payload.set(inspected.buffer)
      bitmap = await createImageBitmap(new Blob([payload], { type: inspected.mime }))
    } catch {
      throw new Error('图片解码失败，文件可能已损坏或与扩展名不符。')
    }
    try {
      if (bitmap.width < 1 || bitmap.height < 1 || bitmap.width > MAX_AVATAR_DIMENSION || bitmap.height > MAX_AVATAR_DIMENSION) {
        throw new Error(`图片尺寸超出 ${MAX_AVATAR_DIMENSION}×${MAX_AVATAR_DIMENSION} 像素上限。`)
      }
      return { width: bitmap.width, height: bitmap.height }
    } finally {
      if (typeof bitmap.close === 'function') bitmap.close()
    }
  }
  return { width: inspected.width, height: inspected.height }
}

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
  const expectedMain = getExpectedMain(row.slot, main.key, row.level)
  const mainPrecision = STAT_DEFINITIONS[main.key].percent ? 10 : 1
  if (expectedMain === null || Math.round(main.value * mainPrecision) !== Math.round(expectedMain * mainPrecision)) {
    return `主词条与部位或等级不符：${row.main}`
  }
  const seen = new Set<string>()
  let minUpgradesSum = 0
  for (let index = 0; index < row.subs.length; index++) {
    const text = row.subs[index]
    const parsed = parseStat(text)
    const bounds = parsed ? GAME_DATA.subBounds[parsed.key] : undefined
    if (!parsed || !SUB_STAT_KEYS.includes(parsed.key) || !bounds || !Number.isFinite(parsed.value) || parsed.value < bounds.min || parsed.value > bounds.max) {
      return `副词条第 ${index + 1} 条超出五星合法范围或无法识别：${text}`
    }
    const validRolls = getValidRollCountsForLevel(parsed.key, parsed.value, row.level)
    if (!validRolls.length) {
      return `副词条第 ${index + 1} 条数值与当前等级强化档位不符：${text}`
    }
    minUpgradesSum += Math.min(...validRolls) - 1
    if (parsed.key === main.key || seen.has(parsed.key)) {
      return `副词条第 ${index + 1} 条与主词条或已有副词条重复：${text}`
    }
    seen.add(parsed.key)
  }
  if (minUpgradesSum > Math.floor(row.level / 4)) {
    return '副词条累计强化次数超过当前等级上限'
  }
  const pending = row.pendingSubs ?? []
  if (pending.length) {
    if (row.level >= 4 || row.subs.length !== 3 || pending.length !== 1) return '待激活副词条仅适用于低于 4 级且有三条生效副词条的圣遗物'
    const parsedPending = parseStat(pending[0])
    const bounds = parsedPending ? GAME_DATA.subBounds[parsedPending.key] : undefined
    if (!parsedPending || !SUB_STAT_KEYS.includes(parsedPending.key) || !bounds || !Number.isFinite(parsedPending.value) || parsedPending.value < bounds.min || parsedPending.value > bounds.max) {
      return `待激活副词条超出五星合法范围或无法识别：${pending[0]}`
    }
    if (!getValidRollCountsForLevel(parsedPending.key, parsedPending.value, 0).length) {
      return `待激活副词条数值不符合初始档位：${pending[0]}`
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
        const estimatedBytes = estimateDataUrlDecodedBytes(asset)
        if (estimatedBytes > MAX_SINGLE_ASSET_BYTES) throw new Error(`角色头像“${key.slice('character:'.length)}”超过 3 MB 上限`)
        const inspected = inspectAvatarDataUrl(asset)
        if (!inspected) {
          throw new Error(`角色头像“${key.slice('character:'.length)}”文件签名、编码结构或宽高（上限 ${MAX_AVATAR_DIMENSION}px）校验失败，无法解码。`)
        }
        const bytes = inspected.bytes
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
