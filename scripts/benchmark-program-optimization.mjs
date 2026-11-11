// Run from any directory: node scripts/benchmark-program-optimization.mjs
// Synthetic data only. Compares preserved pre-change source and current source through Vite SSR.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { performance } from 'node:perf_hooks'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const app = path.join(root, 'apps/web')
const snapshot = path.join(root, '.superpowers/snapshots/optimization-20261004/apps/web')
const { createServer, transformWithOxc } = await import(pathToFileURL(path.join(app, 'node_modules/vite/dist/node/index.js')).href)
const server = await createServer({ root: app, configFile: path.join(app, 'vite.config.ts'),
  server: { middlewareMode: true }, plugins: [{ name: 'pre-optimization-snapshot',
    resolveId(id) { if (id.startsWith('baseline:')) return '\0' + id },
    async load(id) {
      if (!id.startsWith('\0baseline:')) return
      const sourcePath = id.slice('\0baseline:'.length)
      const source = await readFile(path.join(snapshot, sourcePath), 'utf8')
      const rewritten = source.replace(/from (['"])(\.{1,2}\/[^'"]+)\1/g, (_, quote, relative) =>
        `from ${quote}/${path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), relative))}${quote}`)
      return (await transformWithOxc(rewritten, path.join(app, sourcePath))).code
    },
  }] })
try {
  const beforeWarehouse = await server.ssrLoadModule('baseline:src/warehouse/warehouseModel.ts')
  const beforeDraft = await server.ssrLoadModule('baseline:src/artifacts/artifactDraft.ts')
  const afterWarehouse = await server.ssrLoadModule('/src/warehouse/warehouseModel.ts')
  const afterDraft = await server.ssrLoadModule('/src/artifacts/artifactDraft.ts')
  const base = { draftId: 'synthetic', setKey: 'zhuying-lieren', slot: '生之花', rarity: 5, level: 20,
    main: { key: 'hpFlat', value: 4780 }, subs: [], source: 'manual', issues: [] }
  const makeRecords = size => Array.from({ length: size }, (_, i) => {
    const draft = { ...base, subs: [{ key: 'critRate', value: 2.7 + (i * 7 % 101) / 10 },
      { key: 'critDamage', value: 5.4 + (i * 11 % 151) / 10 },
      { key: 'energyRecharge', value: 4.5 + (i * 13 % 121) / 10 }] }
    const record = beforeDraft.draftToRecord(draft, size - i)
    if (i % 97 === 0) record.subs.push('未知副词条')
    if (i % 89 === 0) record.main = '未知主词条'
    if (i % 7 === 0) delete record.setKey
    return record
  })
  const measure = (rounds, operation) => Array.from({ length: rounds }, () => {
    const start = performance.now(); operation(); return +(performance.now() - start).toFixed(3)
  })
  const output = { environment: { node: process.version, platform: process.platform, arch: process.arch,
    osRelease: os.release(), cpu: os.cpus()[0]?.model, vite: JSON.parse(await readFile(path.join(app, 'node_modules/vite/package.json'), 'utf8')).version },
    method: 'Vite SSR actual preserved/current source; fixed synthetic samples; no DOM/OCR/profile/network. Fresh historical sample unavailable; not identical to unsaved 2026-10-03 records.', samples: [] }
  for (const size of [1000, 5000]) {
    const rounds = size === 1000 ? 5 : 3
    const records = makeRecords(size)
    const drafts = Array.from({ length: 20 }, (_, i) => beforeDraft.recordToDraft(records[1 + i * 17], 'manual'))
    const frozen = JSON.stringify(records)
    let equivalentSortCases = 0
    for (const sort of ['level', 'cv', 'recharge']) for (const patch of [{}, { search: '充能' }, { maxLevel: 0 }, { locked: 'locked' }, { main: 'hpFlat' }, { search: '不存在' }]) {
      const filters = { ...beforeWarehouse.DEFAULT_FILTERS, ...patch }
      assert.deepEqual(afterWarehouse.filterAndSort(records, filters, sort).map(a => a.id), beforeWarehouse.filterAndSort(records, filters, sort).map(a => a.id))
      assert.ok(afterWarehouse.filterAndSort(records, filters, sort).every(record => records.includes(record)))
      equivalentSortCases++
    }
    const index = afterDraft.buildDuplicateIndex(records)
    for (const draft of drafts) assert.deepEqual(afterDraft.findDuplicateIds(draft, index), beforeDraft.findDuplicateIds(draft, records))
    assert.equal(JSON.stringify(records), frozen)
    const sortBefore = () => beforeWarehouse.filterAndSort(records, beforeWarehouse.DEFAULT_FILTERS, 'cv')
    const sortAfter = () => afterWarehouse.filterAndSort(records, afterWarehouse.DEFAULT_FILTERS, 'cv')
    const duplicatesBefore = () => drafts.map(d => beforeDraft.findDuplicateIds(d, records))
    const duplicatesColdAfter = () => { const fresh = afterDraft.buildDuplicateIndex(records); return drafts.map(d => afterDraft.findDuplicateIds(d, fresh)) }
    const duplicatesWarmAfter = () => drafts.map(d => afterDraft.findDuplicateIds(d, index))
    const evaluate = afterDraft.createDraftReviewEvaluator(index)
    drafts.forEach(evaluate)
    let editSequence = 0
    const editedBatch = () => drafts.map((draft, i) => i === 0 ? { ...draft, draftId: `edited-${++editSequence}`, subs: [...draft.subs] } : draft)
    const editBefore = () => editedBatch().map(draft => ({ issues: beforeDraft.validateDraft(draft), ids: beforeDraft.findDuplicateIds(draft, records) }))
    const editAfter = () => editedBatch().map(evaluate)
    // Warm the exact operations once before recorded rounds; cold index timing still includes rebuild.
    for (const op of [sortBefore, sortAfter, duplicatesBefore, duplicatesColdAfter, duplicatesWarmAfter, editBefore, editAfter]) op()
    output.samples.push({ size, drafts: drafts.length, rounds, equivalentSortCases, equivalentDuplicateCases: drafts.length,
      cvSortBeforeMs: measure(rounds, sortBefore), cvSortAfterMs: measure(rounds, sortAfter),
      duplicateBatchBeforeMs: measure(rounds, duplicatesBefore), duplicateBatchColdAfterMs: measure(rounds, duplicatesColdAfter),
      duplicateBatchIndexedAfterMs: measure(rounds, duplicatesWarmAfter),
      editBatchBeforeMs: measure(rounds, editBefore), editBatchCachedAfterMs: measure(rounds, editAfter) })
  }
  process.stdout.write(JSON.stringify(output, null, 2) + '\n')
} finally { await server.close() }
