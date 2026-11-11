import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const root = fileURLToPath(new URL('..', import.meta.url))
const definitions = JSON.parse(readFileSync(resolve(root, 'apps/web/src/artifacts/statDefinitions.json'), 'utf8'))
const byProp = Object.fromEntries(Object.entries(definitions).map(([key, value]) => [value.prop, key]))
const slots = { EQUIP_BRACER: '生之花', EQUIP_NECKLACE: '死之羽', EQUIP_SHOES: '时之沙', EQUIP_RING: '空之杯', EQUIP_DRESS: '理之冠' }
function display(value, key) { return definitions[key].percent ? Math.round(value * 1000) / 10 : Math.round(value) }

export function buildSnapshot({ catalog, text, sets, effects, pieces, levels, affixes, avatars, sourceCommit, sourceHashes }) {
  const data = { version: '2026-10-01', sourceCommit, sourceHashes, setHashes: {}, pieceHashes: {}, characters: {}, mainGrowth: {}, subBounds: {} }
  const setKeys = new Map()
  for (const [key, name] of catalog) {
    const hashes = new Set(Object.entries(text).filter(([, value]) => value === name).map(([hash]) => hash))
    const matching = sets.filter(set => effects.some(effect => effect.id === set.equipAffixId && hashes.has(String(effect.nameTextMapHash))))
    if (matching.length !== 1) throw new Error(`套装名称无法唯一核实：${name} (${matching.length})`)
    setKeys.set(matching[0].setId, key)
    for (const hash of hashes) data.setHashes[hash] = key
    const canonical = matching[0].containsList.map(id => pieces.find(piece => piece.id === id)).filter(Boolean)
    for (const piece of canonical) {
      const pieceName = text[piece.nameTextMapHash]
      const slot = slots[piece.equipType]
      if (!pieceName || !slot) throw new Error(`无法核实单件：${name}/${piece.id}`)
      const entry = { setKey: key, slot, name: pieceName }
      // Include rank variants only when both the localized name and canonical slot agree.
      for (const variant of pieces.filter(row => row.setId === piece.setId && row.equipType === piece.equipType && text[row.nameTextMapHash] === pieceName)) {
        const hash = String(variant.nameTextMapHash)
        if (data.pieceHashes[hash] && JSON.stringify(data.pieceHashes[hash]) !== JSON.stringify(entry)) throw new Error(`单件hash冲突：${hash}`)
        data.pieceHashes[hash] = entry
      }
    }
  }
  for (const row of levels.filter(row => row.rank === 5 && row.level >= 1 && row.level <= 21)) {
    for (const prop of row.addProps) {
      const key = byProp[prop.propType]
      if (!key || !definitions[key].slots.length) continue
      data.mainGrowth[key] ??= []
      data.mainGrowth[key][row.level - 1] = display(prop.value, key)
    }
  }
  for (const key of Object.keys(definitions).filter(key => definitions[key].sub)) {
    const values = affixes.filter(row => row.depotId === 501 && byProp[row.propType] === key).map(row => row.propValue)
    if (values.length) data.subBounds[key] = { min: display(Math.min(...values), key), max: display(Math.max(...values) * 6, key) }
  }
  for (const avatar of avatars) {
    const name = text[avatar.nameTextMapHash]
    if (name && avatar.useType === 'AVATAR_FORMAL') data.characters[String(avatar.id)] = { name }
  }
  return data
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = resolve(root, '_audit_AnimeGameData')
  const hashes = {}
  const read = file => {
    const bytes = readFileSync(resolve(input, file))
    hashes[file] = createHash('sha256').update(bytes).digest('hex')
    return JSON.parse(bytes.toString('utf8'))
  }
  const text = { ...read('TextMap/TextMapCHS.json'), ...read('TextMap/TextMap_MediumCHS.json') }
  const source = readFileSync(resolve(root, 'apps/web/src/artifacts/catalog.snapshot.ts'), 'utf8')
  const catalog = [...source.matchAll(/\['([^']+)',\s*'([^']+)'/g)].map(match => [match[1], match[2]])
  const data = buildSnapshot({
    catalog, text, sets: read('ExcelBinOutput/ReliquarySetExcelConfigData.json'), effects: read('ExcelBinOutput/EquipAffixExcelConfigData.json'),
    pieces: read('ExcelBinOutput/ReliquaryExcelConfigData.json'), levels: read('ExcelBinOutput/ReliquaryLevelExcelConfigData.json'),
    affixes: read('ExcelBinOutput/ReliquaryAffixExcelConfigData.json'), avatars: read('ExcelBinOutput/AvatarExcelConfigData.json'),
    sourceCommit: execFileSync('git', ['-C', input, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sourceHashes: hashes,
  })
  const canonicalCount = new Set(Object.values(data.pieceHashes).map(piece => `${piece.setKey}/${piece.slot}`)).size
  if (catalog.length !== 46 || canonicalCount !== 230) throw new Error(`目录覆盖不完整：${catalog.length}套/${canonicalCount}部位`)
  if (Object.values(data.mainGrowth).some(values => values.length !== 21 || values.some(value => !Number.isFinite(value)))) throw new Error('成长表不完整')
  writeFileSync(resolve(root, 'apps/web/src/artifacts/gameData.snapshot.json'), `${JSON.stringify(data, null, 2)}\n`)
  console.log(`已生成：${catalog.length}套、${canonicalCount}单件、${Object.keys(data.characters).length}角色；源 ${data.sourceCommit}`)
}
