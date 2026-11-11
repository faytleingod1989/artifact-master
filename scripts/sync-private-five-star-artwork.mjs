import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { AUDITED_MIRROR_SET_BY_CATALOG_SET, AUDITED_MIRROR_SLOT_BY_CATALOG_SLOT } from './audited-five-star-artifact-map.mjs'

export const SLOTS = ['flower', 'plume', 'sands', 'goblet', 'circlet']
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SNAPSHOT = path.join(ROOT, 'apps/web/src/artifacts/catalog.snapshot.ts')
const ORIGINALS = path.join(ROOT, 'apps/web/src/assets/artifacts/originals')
const REGISTER = path.join(ROOT, 'docs/artifacts/source-register.md')
const COMMIT = 'e12211c914dbaf91f5e23b7986b3d9dea4e8e85d'

export function expectedPairKeys(keys, slots = SLOTS) { return keys.flatMap((key) => slots.map((slot) => `${key}/${slot}`)) }
export function validateSourceMap(map, keys, slots = SLOTS, contract = { sets: AUDITED_MIRROR_SET_BY_CATALOG_SET, slots: AUDITED_MIRROR_SLOT_BY_CATALOG_SLOT }) {
  if (!map || map.snapshot !== '2026-08-15' || !map.entries) throw new Error('source-map snapshot or entries missing')
  const expected = expectedPairKeys(keys, slots)
  const actual = Object.keys(map.entries)
  const missing = expected.filter((key) => !actual.includes(key))
  const extra = actual.filter((key) => !expected.includes(key))
  if (missing.length || extra.length) throw new Error(`missing source-map entries: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'}`)
  const seenUrls = new Set()
  const seenMirrorIdentities = new Set()
  for (const key of expected) {
    const [catalogKey, slot] = key.split('/')
    const entry = map.entries[key]
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || (Object.getPrototypeOf(entry) !== Object.prototype && Object.getPrototypeOf(entry) !== null)) {
      throw new Error(`plain object source-map entry required for ${key}`)
    }
    const { url, mirrorSetKey, mirrorSlotKey } = entry
    if (typeof url !== 'string' || typeof mirrorSetKey !== 'string' || typeof mirrorSlotKey !== 'string' || !url || !mirrorSetKey || !mirrorSlotKey) {
      throw new Error(`source-map URL and mirror identity must be strings for ${key}`)
    }
    let parsedUrl
    try { parsedUrl = new URL(url) } catch { parsedUrl = null }
    const identity = parsedUrl?.href.match(new RegExp(`^https://raw\\.githubusercontent\\.com/gridhead/gi-loadouts/${COMMIT}/assets/imgs/arti/([^/]+)/([^/]+)\\.webp$`))
    if (!identity || parsedUrl.search || parsedUrl.hash) throw new Error(`fixed commit URL required for ${key}`)
    if (identity[1] !== mirrorSetKey) throw new Error(`mirror set does not match URL for ${key}`)
    if (identity[2] !== mirrorSlotKey) throw new Error(`mirror slot does not match URL for ${key}`)
    if (contract.sets[catalogKey] !== mirrorSetKey || contract.slots[slot] !== mirrorSlotKey) {
      throw new Error(`audited mirror identity does not match catalog pair for ${key}`)
    }
    const mirrorIdentity = `${mirrorSetKey}/${mirrorSlotKey}`
    const duplicateUrl = seenUrls.has(url)
    const duplicateMirrorIdentity = seenMirrorIdentities.has(mirrorIdentity)
    if (duplicateUrl || duplicateMirrorIdentity) {
      const reasons = [duplicateUrl && 'duplicate source URL', duplicateMirrorIdentity && 'duplicate mirror identity'].filter(Boolean).join(' and ')
      throw new Error(`${reasons} for ${key}`)
    }
    seenUrls.add(url)
    seenMirrorIdentities.add(mirrorIdentity)
  }
  return true
}
async function catalog() {
  const text = await requireText(SNAPSHOT)
  return [...text.matchAll(/\['([^']+)',\s*'([^']+)',\s*(['"])(.*?)\3\]/g)].map((m) => ({ key: m[1], name: m[2], sourceName: m[4] }))
}
function requireText(file) { return fs.readFile(file, 'utf8') }
function parsePng(b) {
  const colorType = b[25]
  let hasAlpha = colorType === 4 || colorType === 6
  let offset = 8
  while (offset + 12 <= b.length) {
    const length = b.readUInt32BE(offset); const type = b.toString('ascii', offset + 4, offset + 8)
    if (type === 'tRNS') hasAlpha = true
    offset += 12 + length
    if (type === 'IEND') break
  }
  return { format: 'PNG', width: b.readUInt32BE(16), height: b.readUInt32BE(20), hasAlpha }
}
function parseWebp(b) {
  const kind = b.toString('ascii', 12, 16)
  if (kind === 'VP8X') return { format: 'WebP', width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3), hasAlpha: (b[20] & 0x10) !== 0 }
  if (kind === 'VP8 ') return { format: 'WebP', width: b.readUInt16LE(26), height: b.readUInt16LE(28), hasAlpha: false }
  if (kind === 'VP8L') return { format: 'WebP', width: 1 + (b[21] | ((b[22] & 0x3f) << 8)), height: 1 + ((b[22] >> 6) | (b[23] << 2) | ((b[24] & 0x0f) << 10)), hasAlpha: (b[21] & 0x10) !== 0 }
  throw new Error('unsupported WebP chunk')
}
export function inspect(b) {
  if (b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return parsePng(b)
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return parseWebp(b)
  throw new Error('unsupported image signature')
}
export async function existingCandidates(dir, slot) {
  try { return (await fs.readdir(dir)).filter((name) => /^(png|webp)$/i.test(path.extname(name).slice(1)) && path.basename(name, path.extname(name)) === slot).map((name) => path.join(dir, name)) } catch (error) { if (error.code === 'ENOENT') return []; throw error }
}
export async function assertWritableTarget(dir, slot, extension, bytes) {
  const candidates = await existingCandidates(dir, slot)
  if (candidates.length > 1) throw new Error(`ambiguous existing artwork candidates for ${slot}`)
  if (candidates.length === 1) {
    const expected = path.join(dir, `${slot}.${extension}`)
    if (path.resolve(candidates[0]) !== path.resolve(expected) || !Buffer.from(await fs.readFile(candidates[0])).equals(bytes)) throw new Error(`conflicting existing artwork candidate for ${slot}`)
  }
}
function esc(s) { return s.replaceAll('|', '\\|') }
async function run(mapFile) {
  const sets = await catalog(); const map = JSON.parse(await fs.readFile(mapFile, 'utf8')); validateSourceMap(map, sets.map((s) => s.key))
  const rows = []
  for (const set of sets) for (const slot of SLOTS) {
    const key = `${set.key}/${slot}`; const entry = map.entries[key]
    let response
    for (let attempt = 0; attempt < 3; attempt++) { try { response = await fetch(entry.url); if (response.ok) break } catch { if (attempt === 2) throw new Error(`download failed ${key}: network error`) } }
    if (!response?.ok) throw new Error(`download failed ${key}: HTTP ${response?.status}`)
    const bytes = Buffer.from(await response.arrayBuffer()); const meta = inspect(bytes)
    if (meta.width !== meta.height || meta.width < 64) throw new Error(`non-square artwork ${key}: ${meta.width}x${meta.height}`)
    if (!meta.hasAlpha) throw new Error(`artwork must support transparency ${key}`)
    const hash = crypto.createHash('sha256').update(bytes).digest('hex'); const ext = meta.format === 'PNG' ? 'png' : 'webp'
    const dir = path.join(ORIGINALS, set.key); await fs.mkdir(dir, { recursive: true }); const target = path.join(dir, `${slot}.${ext}`)
    await assertWritableTarget(dir, slot, ext, bytes)
    await fs.writeFile(target, bytes)
    rows.push(`| ${set.key} | ${esc(set.name)} | ${slot} | approved | ${entry.url} | 2026-08-15 | 个人本地使用；固定提交第三方镜像；原始游戏美术权利不转移；未随公开源码发布 | ${hash} | ${hash} | ${meta.format} | ${meta.width} x ${meta.height} | ${bytes.length} | 原始单件文件；未裁剪、未改色；镜像扩展名按真实字节格式落盘 | 本地用户授权 | 2026-08-15 |`)
  }
  const header = '# 圣遗物原版素材来源清单\n\n> 本清单中的素材包仅供本机个人使用。原始游戏美术权利仍归 miHoYo / Cognosphere；`apps/web/src/assets/artifacts/originals/` 已通过 `.gitignore` 排除，公开源码或发布物不得携带该目录。\n\n| setKey | 官方中文名 | 部位 | 状态 | 来源 URL | 获取日期 | 使用依据 | 源 SHA-256 | 项目 SHA-256 | 格式 | 像素 | 字节 | 处理说明 | 签收人 | 签收日期 |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n'
  await fs.writeFile(REGISTER, header + rows.join('\n') + '\n')
  console.log(`collected ${rows.length} artwork files`)
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) run(process.argv[2] || path.join(ROOT, 'scripts/private-artwork-sources.local.json')).catch((error) => { console.error(error.message); process.exitCode = 1 })
