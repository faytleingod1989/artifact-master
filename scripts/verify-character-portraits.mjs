import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('..', import.meta.url))
const defaults = { registerPath: join(root, 'docs/artifacts/character-portraits.source.json'), artworkRoot: join(root, 'apps/web/src/assets/characters/originals'), outputRoots: [] }
function list(directory) { return existsSync(directory) ? readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? list(join(directory, entry.name)) : [join(directory, entry.name)]) : [] }
export function verifyCharacterPortraits(options = {}) {
  const config = { ...defaults, ...options }
  const rows = JSON.parse(readFileSync(config.registerPath, 'utf8')).entries
  if (!Array.isArray(rows) || !rows.length) throw new Error('头像来源清单缺失')
  const seen = new Set(); const expectedHashes = []
  for (const row of rows) {
    const wiki = row.identityKind === 'hoyowiki'
    const identity = wiki ? `wiki:${row.wikiEntryId}` : `game:${row.characterId}`
    const validIdentity = wiki
      ? Number.isSafeInteger(row.wikiEntryId) && row.wikiEntryId > 0 && row.characterId === undefined && row.iconName === `HoYoWiki_${row.wikiEntryId}` && /^https:\/\/act-webstatic\.hoyoverse\.com\/event-static-hoyowiki-admin\/[^\s]+\.png$/.test(row.url)
      : (row.identityKind === undefined || row.identityKind === 'game-data') && Number.isSafeInteger(row.characterId) && row.characterId > 0 && /^UI_AvatarIcon_[A-Za-z0-9]+$/.test(row.iconName) && row.url === `https://enka.network/ui/${row.iconName}.png`
    if (!validIdentity || !row.name || !row.displayName || !/^[a-f0-9]{64}$/.test(row.sha256) || seen.has(identity) || seen.has(row.iconName)) throw new Error('头像来源身份不合法或重复')
    seen.add(identity); seen.add(row.iconName)
    const file = join(config.artworkRoot, `${row.iconName}.png`)
    if (!existsSync(file)) throw new Error(`缺少游戏头像：${row.name}`)
    const bytes = readFileSync(file); const hash = createHash('sha256').update(bytes).digest('hex')
    if (hash !== row.sha256) throw new Error(`头像哈希不符：${row.name}`)
    if (bytes.length !== row.bytes || bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.readUInt32BE(16) !== row.width || bytes.readUInt32BE(20) !== row.height) throw new Error(`头像元数据不符：${row.name}`)
    expectedHashes.push(hash)
  }
  const files = config.outputRoots.flatMap(list); const byHash = new Map()
  for (const file of files) { const hash = createHash('sha256').update(readFileSync(file)).digest('hex'); byHash.set(hash, [...(byHash.get(hash) ?? []), file]) }
  if (config.local) {
    const source = files.filter(file => /\.(js|html|css)$/.test(file)).map(file => readFileSync(file, 'utf8')).join('\n')
    for (const hash of expectedHashes) if (!byHash.get(hash)?.some(file => source.includes(basename(file)))) throw new Error('本地头像缺少或构建中不可达')
  } else if (expectedHashes.some(hash => byHash.has(hash))) throw new Error('公开构建包含私有游戏头像')
  return { checked: rows.length }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const local = process.argv.includes('--local')
  console.log(`游戏头像来源与${local ? '本地可达性' : '公开隔离'}通过：${verifyCharacterPortraits({ local, outputRoots: [join(root, 'apps/web', local ? 'dist-local' : 'dist')] }).checked} 位`)
}
