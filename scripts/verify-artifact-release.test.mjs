import { strict as assert } from 'node:assert'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { verifyRelease } from './verify-artifact-release.mjs'
import { auditedMirrorUrl } from './audited-five-star-artifact-map.mjs'

const catalog = { setKeys: ['shenlang-zhongqu', 'heiyao-midian'], slots: ['flower', 'plume', 'sands', 'goblet', 'circlet'] }
function fixture({ missing = false, remote = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'artifact-release-'))
  mkdirSync(join(root, 'artifacts', 'shenlang-zhongqu'), { recursive: true })
  mkdirSync(join(root, 'artifacts', 'heiyao-midian'), { recursive: true })
  const register = ['| setKey | name | slot | status | source | date | basis | source hash | project hash | format | pixels | bytes | handling | signer | signed |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |']
  for (const setKey of catalog.setKeys) for (const slot of catalog.slots) {
    const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
    if (!(missing && setKey === 'heiyao-midian' && slot === 'circlet')) writeFileSync(join(root, 'artifacts', setKey, `${slot}.png`), bytes)
    const hash = createHash('sha256').update(bytes).digest('hex')
    register.push(`| ${setKey} | Set | ${slot} | approved | ${remote ? 'https://example.com/original.png' : auditedMirrorUrl(setKey, slot)} | 2026-08-15 | local | ${hash} | ${hash} | PNG | 1 x 1 | ${bytes.length} | local | user | 2026-08-15 |`)
  }
  writeFileSync(join(root, 'register.md'), `${register.join('\n')}\n`)
  writeFileSync(join(root, 'catalog.json'), JSON.stringify(catalog))
  return root
}

assert.throws(() => verifyRelease({ root: fixture({ missing: true }) }), /尚有 1 项圣遗物原版素材未签收/)
assert.throws(() => verifyRelease({ root: fixture({ remote: true }) }), /固定提交第三方镜像|来源 URL/)
const result = verifyRelease({ root: fixture() })
assert.equal(result.expectedCount, 10)
assert.match(result.message, /10\/10 原版素材与来源签收通过/)
const unexpectedArtworkFile = fixture()
writeFileSync(join(unexpectedArtworkFile, 'artifacts', 'shenlang-zhongqu', 'notes.bin'), 'private notes')
assert.throws(() => verifyRelease({ root: unexpectedArtworkFile }), /素材目录包含意外文件|notes\.bin/)
const productionCatalog = JSON.parse(readFileSync(new URL('./artifact-catalog.json', import.meta.url)))
assert.ok(productionCatalog.setKeys.length > 4)
assert.equal(productionCatalog.setKeys.length * productionCatalog.slots.length, 220)
const leaked = fixture()
mkdirSync(join(leaked, 'dist'), { recursive: true })
writeFileSync(join(leaked, 'dist', 'bundle.js'), 'https://raw.githubusercontent.com/a/b/0123456789012345678901234567890123456789/assets/imgs/arti/a.png')
assert.throws(() => verifyRelease({ root: leaked, outputRoots: [join(leaked, 'dist')] }), /发布物包含原版素材/)
const binaryLeaked = fixture()
mkdirSync(join(binaryLeaked, 'dist'), { recursive: true })
writeFileSync(join(binaryLeaked, 'dist', 'innocent.webp'), readFileSync(join(binaryLeaked, 'artifacts', 'shenlang-zhongqu', 'flower.png')))
assert.throws(() => verifyRelease({ root: binaryLeaked, outputRoots: [join(binaryLeaked, 'dist')] }), /已审计原图二进制|扩展名与文件内容/)
console.log('dynamic artifact release gate tests passed')
