import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyRelease } from './verify-artifact-release.mjs'
import { verifyCharacterPortraits } from './verify-character-portraits.mjs'
const root = fileURLToPath(new URL('..', import.meta.url))
function files(directory) { return existsSync(directory) ? readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]) : [] }
export function verifyLocalArtwork(outputRoot, fixture) {
  if (!fixture) verifyRelease({ outputRoots: [] }) // Preserve the existing exact provenance/hash gate.
  const rows = fixture?.entries ?? readFileSync(join(root, 'docs/artifacts/source-register.md'), 'utf8').split(/\r?\n/).filter(line => line.startsWith('|') && !line.includes('setKey') && !line.includes('---')).map(line => { const values = line.split('|').slice(1, -1).map(value => value.trim()); return { setKey: values[0], slot: values[2], sha256: values[8] } })
  const output = files(resolve(outputRoot)); const source = output.filter(file => /\.(js|html|css)$/.test(file)).map(file => readFileSync(file, 'utf8')).join('\n')
  const byHash = new Map()
  for (const file of output.filter(file => /\.(png|webp)$/.test(file))) { const hash = createHash('sha256').update(readFileSync(file)).digest('hex'); byHash.set(hash, [...(byHash.get(hash) ?? []), file]) }
  for (const row of rows) {
    const matching = byHash.get(row.sha256)
    if (!matching?.length) throw new Error(`本地构建缺少已审计原图：${row.setKey}/${row.slot}`)
    if (!matching.some(file => source.includes(basename(file)))) throw new Error(`本地原图在构建中不可达：${row.setKey}/${row.slot}`)
  }
  if (!fixture) verifyCharacterPortraits({ outputRoots: [outputRoot], local: true })
  return { checked: rows.length }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(`本地原图哈希与构建可达性通过：${verifyLocalArtwork(join(root, 'apps/web/dist-local')).checked} 张；新增两套缺图另列，不冒充齐全。`)
