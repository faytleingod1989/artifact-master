import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
const root = fileURLToPath(new URL('..', import.meta.url))
export function buildEnhancementRules({ affixes, pieces, definitions, sourceCommit, sourceHashes }) {
  const events = [4, 8, 12, 16, 20], tiers = {}
  const five = pieces.filter(row => row.rankLevel === 5 && row.appendPropDepotId === 501)
  if (!five.length || five.some(row => row.maxLevel !== 21 || JSON.stringify(row.addPropLevels?.map(n => n - 1)) !== JSON.stringify(events))) throw Error('五星强化节点不一致。')
  for (const [key, definition] of Object.entries(definitions).filter(([, value]) => value.sub)) {
    const values = affixes.filter(row => row.depotId === 501 && row.propType === definition.prop).map(row => Math.round(row.propValue * (definition.percent ? 100 : 1) * 10000)).sort((a, b) => a - b)
    if (values.length !== 4 || new Set(values).size !== 4 || values.some(n => !Number.isSafeInteger(n) || n <= 0)) throw Error('五星档位不完整：' + key)
    tiers[key] = values
  }
  if (Object.keys(tiers).length !== 10) throw Error('五星副词条应为10种。')
  return { version: '2026-10-18-v1', sourceCommit, sourceHashes, unitScale: 10000, events, tiers }
}
export function readPinnedEnhancementRules() {
  const known = JSON.parse(readFileSync(resolve(root, 'apps/web/src/artifacts/gameData.snapshot.json'), 'utf8')), sourceHashes = {}
  const read = file => {
    const bytes = readFileSync(resolve(root, '_audit_AnimeGameData', file)), hash = createHash('sha256').update(bytes).digest('hex')
    if (hash !== known.sourceHashes[file]) throw Error('固定源哈希不符：' + file)
    sourceHashes[file] = hash; return JSON.parse(bytes.toString('utf8'))
  }
  return buildEnhancementRules({ affixes: read('ExcelBinOutput/ReliquaryAffixExcelConfigData.json'), pieces: read('ExcelBinOutput/ReliquaryExcelConfigData.json'), definitions: JSON.parse(readFileSync(resolve(root, 'apps/web/src/artifacts/statDefinitions.json'), 'utf8')), sourceCommit: known.sourceCommit, sourceHashes })
}
// stdout only: callers can inspect and apply_patch the reproducible snapshot.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.stdout.write(JSON.stringify(readPinnedEnhancementRules(), null, 2) + '\n')
