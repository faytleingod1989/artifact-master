import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditedMirrorUrl } from './audited-five-star-artifact-map.mjs'
import { verifyCharacterPortraits } from './verify-character-portraits.mjs'

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const defaultConfig = {
  catalogPath: join(repositoryRoot, 'scripts/artifact-catalog.json'),
  registerPath: join(repositoryRoot, 'docs/artifacts/source-register.md'),
  artworkRoot: join(repositoryRoot, 'apps/web/src/assets/artifacts/originals'),
  outputRoots: [join(repositoryRoot, 'apps/web/dist'), join(repositoryRoot, 'apps/web/release')],
  manifestPath: join(repositoryRoot, 'apps/web/src/assets/artifacts/manifest.ts'),
  resolverPath: join(repositoryRoot, 'apps/web/src/artifacts/resolveArtwork.ts'),
  characterRegisterPath: join(repositoryRoot, 'docs/artifacts/character-portraits.source.json'),
}
const imageExtensions = ['.webp', '.png']
const unexpectedImageExtensions = new Set(['.jpg', '.jpeg', '.gif', '.avif', '.bmp', '.ico', '.tif', '.tiff'])

function fail(message) { throw new Error(message) }
function readRows(path) {
  return readFileSync(path, 'utf8').split(/\r?\n/).filter((line) => line.startsWith('|') && !line.includes('setKey') && !line.includes('---')).map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
}
function imageInfo(path) {
  const bytes = readFileSync(path)
  if (bytes[0] === 0x89 && bytes.subarray(1, 4).toString('ascii') === 'PNG') return { format: 'PNG', pixels: `${bytes.readUInt32BE(16)} x ${bytes.readUInt32BE(20)}` }
  if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') {
    const chunk = bytes.subarray(12, 16).toString('ascii')
    if (chunk === 'VP8X') return { format: 'WebP', pixels: `${1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16)} x ${1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16)}` }
    if (chunk === 'VP8 ') return { format: 'WebP', pixels: `${bytes.readUInt16LE(26) & 0x3fff} x ${bytes.readUInt16LE(28) & 0x3fff}` }
    if (chunk === 'VP8L') { const bits = bytes.readUInt32LE(21); return { format: 'WebP', pixels: `${1 + (bits & 0x3fff)} x ${1 + ((bits >> 14) & 0x3fff)}` } }
  }
  fail(`不支持的素材格式：${path}`)
}
function filesForPair(root, setKey, slot) {
  return imageExtensions.map((extension) => join(root, setKey, `${slot}${extension}`)).filter(existsSync)
}
function validateImageFile(path, rejectUnexpected = false) {
  const extension = extname(path).toLowerCase()
  if (unexpectedImageExtensions.has(extension)) {
    if (rejectUnexpected) fail(`包含不支持的私有图片扩展名：${path}`)
    return
  }
  if (!imageExtensions.includes(extension)) return
  const info = imageInfo(path)
  const expected = info.format === 'PNG' ? '.png' : '.webp'
  if (extension !== expected) fail(`图片扩展名与文件内容不匹配：${path}`)
}
function scanOutputs(roots, auditedHashes) {
  const findings = []
  const visit = (path) => {
    if (!existsSync(path)) return
    const stat = lstatSync(path)
    if (stat.isDirectory()) { for (const child of readdirSync(path)) visit(join(path, child)); return }
    validateImageFile(path)
    const bytes = readFileSync(path)
    const hash = createHash('sha256').update(bytes).digest('hex')
    if (auditedHashes.has(hash)) findings.push(`${path} (SHA-256 ${hash})`)
    const text = bytes.toString('utf8')
    if (/originals[\\/]|raw\.githubusercontent\.com\/[^\s"']*\/assets\/imgs\/arti\//i.test(text)) findings.push(path)
  }
  roots.forEach(visit)
  return findings
}
function scanArtworkShape(root, setKeys, slots) {
  if (!existsSync(root)) return
  const expectedSets = new Set(setKeys)
  const expectedSlots = new Set(slots)
  const rootEntries = readdirSync(root)
  for (const entry of rootEntries) {
    const entryPath = join(root, entry)
    const stat = lstatSync(entryPath)
    if (entry === '.gitignore' && !stat.isDirectory()) continue
    if (!stat.isDirectory()) fail(`素材目录包含意外文件：${entryPath}`)
    if (!expectedSets.has(entry)) fail(`素材目录包含未知套装目录：${entryPath}`)
    for (const child of readdirSync(entryPath)) {
      const childPath = join(entryPath, child)
      const childStat = lstatSync(childPath)
      if (childStat.isDirectory()) fail(`素材目录包含嵌套目录：${childPath}`)
      const match = /^(.+)\.(png|webp)$/.exec(child)
      if (!match || !expectedSlots.has(match[1])) fail(`素材目录包含意外文件：${childPath}`)
      validateImageFile(childPath, true)
    }
  }
}
function trackedOriginals() {
  try { return execFileSync('git', ['ls-files', '-z', '--', '*originals*'], { cwd: repositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\0').filter(Boolean) } catch { return [] }
}
function validateManifest(path) {
  if (!existsSync(path)) return
  const source = readFileSync(path, 'utf8')
  for (const required of ['FIVE_STAR_ARTIFACT_SETS', 'ARTIFACT_SLOTS', 'createArtwork', 'placeholderMissing']) if (!source.includes(required)) fail(`素材清单缺少目录驱动或占位回退：${required}`)
  if (!/FIVE_STAR_ARTIFACT_SETS\.map\(\s*\(\{\s*key\s*\}/.test(source) || !/ARTIFACT_SLOTS\.map\(\s*\(slot\)/.test(source)) fail('素材清单必须按目录集合与部位动态生成所有组合')
  if (/https?:\/\//i.test(source)) fail('公开素材清单不得包含远程原图 URL')
}
function validateResolver(path) {
  if (!existsSync(path)) return
  const source = readFileSync(path, 'utf8')
  for (const required of ['placeholderMissing', 'missingArtwork', "status: 'missing'"]) if (!source.includes(required)) fail(`解析器缺少共享占位回退：${required}`)
  if (!/artifactArtworkBySet\[setKey\]\[artifact\.slot\]/.test(source) || !/ARTIFACT_SLOTS\.includes\(artifact\.slot\)/.test(source)) fail('解析器必须按目录键与部位解析，不得使用静态或任意路径')
  if (/https?:\/\//i.test(source)) fail('解析器不得包含远程原图 URL')
}

export function verifyRelease(overrides = {}) {
  const config = overrides.root
    ? { catalogPath: join(overrides.root, 'catalog.json'), registerPath: join(overrides.root, 'register.md'), artworkRoot: join(overrides.root, 'artifacts'), outputRoots: [], manifestPath: join(overrides.root, 'manifest.ts'), resolverPath: join(overrides.root, 'resolveArtwork.ts'), ...overrides }
    : { ...defaultConfig, ...overrides }
  const catalog = JSON.parse(readFileSync(config.catalogPath, 'utf8'))
  const setKeys = [...new Set(catalog.setKeys)]
  const slots = [...new Set(catalog.slots)]
  if (!setKeys.length || !slots.length || setKeys.length !== catalog.setKeys.length || slots.length !== catalog.slots.length) fail('目录清单无效或包含重复项')
  const expectedPairs = setKeys.flatMap((setKey) => slots.map((slot) => ({ setKey, slot })))
  validateManifest(config.manifestPath)
  validateResolver(config.resolverPath)
  if (!existsSync(config.registerPath)) fail('缺少素材来源清单：docs/artifacts/source-register.md')
  const rows = readRows(config.registerPath)
  const rowByPair = new Map()
  for (const row of rows) {
    if (row.length !== 15) fail('素材来源清单列数无效')
    const pair = `${row[0]}/${row[2]}`
    if (rowByPair.has(pair)) fail(`素材来源清单重复：${pair}`)
    rowByPair.set(pair, row)
  }
  const expectedKeys = new Set(expectedPairs.map(({ setKey, slot }) => `${setKey}/${slot}`))
  if (rowByPair.size !== expectedKeys.size || [...rowByPair.keys()].some((pair) => !expectedKeys.has(pair))) fail('素材来源清单必须且只能包含目录中的 setKey/部位组合')
  let missing = 0
  for (const entry of expectedPairs) {
    const key = `${entry.setKey}/${entry.slot}`
    const row = rowByPair.get(key)
    const files = filesForPair(config.artworkRoot, entry.setKey, entry.slot)
    if (files.length !== 1) { missing++; continue }
    if (!row || row[3] !== 'approved') fail(`素材来源尚未签收：${key}`)
    if (row[4] !== auditedMirrorUrl(entry.setKey, entry.slot)) fail(`素材来源 URL 不符合已审计身份契约：${key}`)
    const actualHash = createHash('sha256').update(readFileSync(files[0])).digest('hex')
    if (![row[7], row[8]].every((hash) => /^[a-f0-9]{64}$/i.test(hash) && hash.toLowerCase() === actualHash)) fail(`已签收素材 SHA-256 不匹配：${key}`)
    const info = imageInfo(files[0])
    if (row[9] !== info.format || row[10] !== info.pixels || Number(row[11]) !== readFileSync(files[0]).byteLength) fail(`已签收素材元数据不匹配：${key}`)
    if (![row[12], row[13], row[14]].every(Boolean)) fail(`素材签收信息不完整：${key}`)
  }
  if (missing) fail(`尚有 ${missing} 项圣遗物原版素材未签收`)
  const auditedHashes = new Set([...rowByPair.values()].map((row) => row[8].toLowerCase()))
  const leakedTracked = trackedOriginals()
  if (leakedTracked.length) fail(`Git 跟踪文件包含原版素材：${leakedTracked.join(', ')}`)
  scanArtworkShape(config.artworkRoot, setKeys, slots)
  const leakedOutputs = scanOutputs(config.outputRoots, auditedHashes)
  if (leakedOutputs.length) fail(`发布物包含原版素材、远程原图 URL 或已审计原图二进制：${leakedOutputs.join(', ')}`)
  if (config.characterRegisterPath) verifyCharacterPortraits({ registerPath: config.characterRegisterPath, outputRoots: config.outputRoots })
  return { expectedCount: expectedPairs.length, message: `${expectedPairs.length}/${expectedPairs.length} 原版素材与来源签收通过` }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(verifyRelease().message) } catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 }
}
