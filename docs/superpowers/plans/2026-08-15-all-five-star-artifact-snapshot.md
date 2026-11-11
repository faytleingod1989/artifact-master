# 全量五星圣遗物本地素材快照 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将程序扩展为当前冻结版本的全部五星圣遗物套装，并为每套五个部位提供经审计的本地原版图标。

**Architecture:** 新增一个受版本控制的五星套装目录作为 UI、解析、迁移和发布门禁的唯一事实来源。原图存于被忽略的私有本地目录；目录与素材登记缺失时应用继续使用中性占位，私有发布门禁则拒绝构建。

**Tech Stack:** React 19、TypeScript、Vite、Vitest、Node.js ESM、Electron Builder。

## Global Constraints

- 只包含冻结日已具五星品质的正式套装；每套必须恰有五部位。
- 禁止运行时热链、AI 图、跨套装/跨部位回退、裁切或重新着色。
- 原图只限个人本地素材包；公开源码和公开二进制不得携带 `originals/`。
- 保留现有四套 setKey，历史 JSON 导入不得因新增目录而崩溃。
- 当前外部清单显示 44 套（目标 220 项），但所有验证以目录实际条目数 × 5 为准。
- 任务完成后必须运行 `npm run test`、`npm run lint`、`npm run build`、`npm run verify:artifact-release`。

---

### Task 1: 冻结五星套装目录和审计记录

**Files:**

- Create: `apps/web/src/artifacts/catalog.ts`
- Create: `apps/web/src/artifacts/catalog.test.ts`
- Create: `docs/artifacts/five-star-roster-2026-08-15.md`
- Modify: `apps/web/src/artifacts/types.ts`

**Interfaces:**

- Produces: `FIVE_STAR_ARTIFACT_SETS`, `FIVE_STAR_ARTIFACT_SET_KEYS`, `findArtifactSetByName(name)`, `ArtifactSetKey`.
- Consumes: two independently captured current-list source URLs recorded in the roster document.

- [ ] **Step 1: 建立两源对照的冻结名单**

在 `five-star-roster-2026-08-15.md` 创建一个三栏对照表：英语名、简体中文名、目录 key。以 `https://genshin-impact.fandom.com/wiki/Category:5-Star_Artifacts` 和 `https://genshin.guide/genshin-impact/artifacts` 作为两份交叉清单，记录各页面的 URL、抓取日期、差异结论和冻结版本说明。对现有四套保留 `shenlang-zhongqu`、`heiyao-midian`、`zhuying-lieren`、`xishi-zhige`。若任一来源不一致，该条目不进入目录，并在文档的“排除项”中说明原因。

- [ ] **Step 2: 写失败测试，要求目录是唯一且完整的五星快照**

```ts
import { expect, test } from 'vitest'
import { FIVE_STAR_ARTIFACT_SETS, findArtifactSetByName } from './catalog'

test('freezes a unique five-star set roster', () => {
  expect(FIVE_STAR_ARTIFACT_SETS.length).toBeGreaterThanOrEqual(44)
  expect(new Set(FIVE_STAR_ARTIFACT_SETS.map((entry) => entry.key)).size).toBe(FIVE_STAR_ARTIFACT_SETS.length)
  expect(new Set(FIVE_STAR_ARTIFACT_SETS.map((entry) => entry.name)).size).toBe(FIVE_STAR_ARTIFACT_SETS.length)
  expect(findArtifactSetByName('深廊终曲')?.key).toBe('shenlang-zhongqu')
})
```

Run: `npm run test -- catalog.test.ts`  
Expected: FAIL because the catalog module does not exist.

- [ ] **Step 3: 实现目录和动态 setKey 类型**

```ts
export const FIVE_STAR_ARTIFACT_SETS = [
  { key: 'shenlang-zhongqu', name: '深廊终曲', sourceName: 'Finale of the Deep Galleries' },
  { key: 'heiyao-midian', name: '黑曜秘典', sourceName: 'Obsidian Codex' },
] as const

export type ArtifactSetKey = (typeof FIVE_STAR_ARTIFACT_SETS)[number]['key']
export const FIVE_STAR_ARTIFACT_SET_KEYS = FIVE_STAR_ARTIFACT_SETS.map(({ key }) => key)
export const findArtifactSetByName = (name: string) => FIVE_STAR_ARTIFACT_SETS.find((entry) => entry.name === name)
```

Move `ArtifactSetKey` out of the four-value union in `types.ts`; retain `ArtifactSlot` unchanged. Do not accept a catalog with fewer than the independently audited snapshot count.

- [ ] **Step 4: Run focused tests**

Run: `npm run test -- catalog.test.ts`  
Expected: PASS.

### Task 2: 用目录重构素材清单与解析器

**Files:**

- Modify: `apps/web/src/assets/artifacts/manifest.ts`
- Modify: `apps/web/src/assets/artifacts/manifest.test.ts`
- Modify: `apps/web/src/artifacts/resolveArtwork.ts`
- Modify: `apps/web/src/artifacts/resolveArtwork.test.ts`

**Interfaces:**

- Consumes: `FIVE_STAR_ARTIFACT_SETS`, `ARTIFACT_SLOTS`.
- Produces: `artifactSetNames`, `artifactArtworkBySet`, `resolveArtifactSetKey`, `assertArtifactManifestComplete` for every catalog set.

- [ ] **Step 1: 写失败测试，验证目录条目自动获得五部位映射**

```ts
test('declares every catalog set with all five slots', () => {
  expect(Object.keys(artifactArtworkBySet)).toEqual(FIVE_STAR_ARTIFACT_SET_KEYS)
  for (const entry of FIVE_STAR_ARTIFACT_SETS) {
    expect(Object.keys(artifactArtworkBySet[entry.key])).toEqual(ARTIFACT_SLOTS)
  }
})
```

Run: `npm run test -- manifest.test.ts`  
Expected: FAIL while the manifest still hard-codes four sets.

- [ ] **Step 2: 生成完整嵌套映射，不再人工复制四套对象**

```ts
export const artifactSetNames = Object.fromEntries(
  FIVE_STAR_ARTIFACT_SETS.map(({ key, name }) => [key, name]),
) as Record<ArtifactSetKey, string>

export const artifactArtworkBySet = Object.fromEntries(
  FIVE_STAR_ARTIFACT_SETS.map(({ key }) => [
    key,
    Object.fromEntries(ARTIFACT_SLOTS.map((slot) => [slot, createArtwork(key, slot)])),
  ]),
) as Record<ArtifactSetKey, Record<ArtifactSlot, ArtifactArtwork>>
```

`createArtwork` 继续只查询 `./originals/<setKey>/<slot>.(webp|png)`；不存在时返回 `missing-asset`。`resolveArtifactSetKey` 改为调用 `findArtifactSetByName`。

- [ ] **Step 3: 扩展未知套装和未知部位测试**

```ts
test('does not borrow a same-slot image for a catalog miss', () => {
  expect(getArtifactArtwork({ ...base, set: '不存在', setKey: undefined })).toMatchObject({
    status: 'missing', missingReason: 'unregistered-set',
  })
})
```

- [ ] **Step 4: 运行解析器与清单测试**

Run: `npm run test -- manifest.test.ts resolveArtwork.test.ts`  
Expected: PASS.

### Task 3: 让界面、OCR 和导入动态读取目录

**Files:**

- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.tsx`
- Modify: `apps/web/src/artifacts/migrateArtifactData.ts`
- Modify: `apps/web/src/artifacts/migrateArtifactData.test.ts`

**Interfaces:**

- Consumes: `FIVE_STAR_ARTIFACT_SETS`, `findArtifactSetByName`.
- Produces: 所有套装选择器和 OCR/导入都使用目录的中文名与 key。

- [ ] **Step 1: 写失败 UI 测试，证明非初始四套能够录入并正确显示**

```tsx
test('lists a catalog set outside the original four in manual entry', async () => {
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '手动录入' }))
  expect(screen.getByRole('option', { name: '翠绿之影' })).toBeInTheDocument()
})
```

Use one audited catalog member outside the first four. Run: `npm run test -- App.test.tsx`; expected FAIL before removing hard-coded options.

- [ ] **Step 2: Replace all four-set literals with catalog-derived options**

Create one `const artifactSetOptions = FIVE_STAR_ARTIFACT_SETS.map(({ name }) => name)` near the App constants. Use it in filters, manual entry, edit and OCR selects. In OCR, use `FIVE_STAR_ARTIFACT_SETS.find(({ name }) => text.includes(name))` and only set `setKey` after exact match. In JSON migration, resolve Chinese name first when persisted `setKey` conflicts with the name, then retain an unresolved record with no `setKey`.

- [ ] **Step 3: Add import and OCR regression tests**

```ts
expect(migrateArtifactData({ artifacts: [{ ...artifact, set: '翠绿之影', setKey: undefined }] }).artifacts[0].setKey)
  .toBe(findArtifactSetByName('翠绿之影')?.key)
```

For OCR, inject matching recognized text, confirm it selects the catalog set, save, and assert the image alt is `${name}·死之羽原版图标`.

- [ ] **Step 4: Run focused UI and migration tests**

Run: `npm run test -- App.test.tsx migrateArtifactData.test.ts`  
Expected: PASS.

### Task 4: 收集、审核并隔离私有全量原图包

**Files:**

- Create: `scripts/sync-private-five-star-artwork.mjs`
- Create: `docs/artifacts/private-artwork-sources.local.example.json`
- Modify: `apps/web/src/assets/artifacts/originals/.gitignore`
- Modify: `docs/artifacts/source-register.md`

**Interfaces:**

- Consumes: catalog and a private local JSON source map keyed by `<setKey>/<slot>`.
- Produces: `originals/<setKey>/<slot>.<real-extension>` plus one audited source-register row per catalog pair.

- [ ] **Step 1: Define the ignored private source-map contract**

```json
{
  "snapshot": "2026-08-15",
  "entries": {
    "cu-lv-zhi-ying/flower": {
      "url": "https://raw.githubusercontent.com/<owner>/<repo>/<commit>/<path>",
      "mirrorSetKey": "<mirror-set-key>",
      "mirrorSlotKey": "fwol"
    }
  }
}
```

Ignore `private-artwork-sources.local.json`; commit only the example schema. Populate the real private file with exactly one fixed-commit URL for every catalog pair. Never use a moving branch URL.

- [ ] **Step 2: Write a failing Node test for collection-map coverage**

Create `scripts/sync-private-five-star-artwork.test.mjs` that loads a fixture map and asserts the pair key set equals `catalog keys × flower/plume/sands/goblet/circlet`, rejecting duplicates, missing URLs and non-commit GitHub URLs. Run it and verify failure before implementing validation.

- [ ] **Step 3: Implement deterministic collection and metadata extraction**

The script must:

1. validate source-map coverage before downloading;
2. retrieve to the exact `originals/<setKey>/` directory;
3. inspect RIFF/WebP (`VP8`, `VP8L`, `VP8X`) and PNG headers to calculate real format and dimensions;
4. rename only when extension conflicts with byte signature;
5. calculate SHA-256 after download;
6. write source-register rows in catalog order with third-party-mirror/local-only wording;
7. fail if any file is not square transparent-compatible artwork or if more than one candidate exists for a pair.

- [ ] **Step 4: Audit each full set before signing it off**

For every set, compare source set name, all five individual item names, and images. Record the fixed source URL and 2026-08-15 collection date. Keep an item `missing` until all five checks are complete; do not sign an incomplete set as `approved`.

- [ ] **Step 5: Run the collection-map test and inspect private file isolation**

Run: `node scripts/sync-private-five-star-artwork.test.mjs`  
Expected: PASS.  
Run: `git check-ignore apps/web/src/assets/artifacts/originals/<any-private-image>` when Git is initialized; expected output confirms it is ignored.

### Task 5: 让发布门禁完全目录驱动

**Files:**

- Modify: `scripts/verify-artifact-release.mjs`
- Modify: `scripts/verify-artifact-release.test.mjs`
- Modify: `apps/web/package.json`

**Interfaces:**

- Consumes: catalog, source register, private originals.
- Produces: non-zero failure for any missing/unapproved/catalog-inconsistent artwork; `20/20` message replaced by a computed count.

- [ ] **Step 1: Write failing gate tests for a dynamic expected count and a missing catalog pair**

```js
assert.match(runGate(fixtureWithMissingFile), /尚有 1 项圣遗物原版素材未签收/)
assert.match(runGate(completeFixture), /原版素材与来源签收通过/)
```

Run: `node scripts/verify-artifact-release.test.mjs`; expected FAIL before the gate no longer has four hard-coded set keys.

- [ ] **Step 2: Derive expected pairs from the catalog**

Have the Node gate import a generated JSON catalog snapshot or parse a JSON-only catalog resource shared with TypeScript; do not regex parse a TypeScript array. For every derived pair require exactly one register row, `approved` status, a valid fixed HTTPS source URL, both matching hashes, real-format metadata, and exactly one local image.

- [ ] **Step 3: Compute the success message and retain build ordering**

```js
console.log(`${expectedPairs.length}/${expectedPairs.length} 原版素材与来源签收通过`)
```

Keep `desktop:build` as `npm run verify:artifact-release && npm run build && electron-builder --win portable --x64`.

- [ ] **Step 4: Run gate tests**

Run: `node scripts/verify-artifact-release.test.mjs`  
Expected: PASS with fixture coverage; then run `npm run verify:artifact-release` only after the full private pack is present.

### Task 6: 全量验收、私有包检查与 Windows 构建

**Files:**

- Modify: `.superpowers/sdd/2026-08-10-artifact-original-icon-replacement/progress.md`
- Create: `docs/artifacts/five-star-snapshot-acceptance-2026-08-15.md`

**Interfaces:**

- Consumes: catalog, register, gate output, tests and build artifacts.
- Produces: the final count, command results, manual visual sampling record, and package result without treating old release contents as current.

- [ ] **Step 1: Run full automated verification**

```powershell
Set-Location 'E:\AI Project\YS\apps\web'
npm run test
npm run lint
npm run build
npm run verify:artifact-release
```

Expected: all tests pass, lint exits zero, Vite build exits zero, and the gate reports the catalog-derived `N/N` count.

- [ ] **Step 2: Perform visual coverage sampling**

Open representative artifacts from every release-era group and verify flower/plume/sands/goblet/circlet have the correct set identity, transparency, full subject visibility (`object-fit: contain`) and no placeholder state. Add exact set keys sampled and results to the acceptance document.

- [ ] **Step 3: Validate open-source separation**

Verify original files are ignored and document that a public source checkout must not run the release gate or publish a binary containing the private pack. The acceptance record must explicitly label the content “personal local use only; third-party mirror; rights not transferred.”

- [ ] **Step 4: Build Windows package only after the gate passes**

Run: `npm run desktop:build` in a persistent terminal session. Record its exact output path and creation time only if Electron Builder exits zero. If it hangs or fails, record that condition and do not identify the old `release/` directory as a new package.

## Plan Self-Review

- Spec coverage: Tasks 1–2 provide one dynamic data source and mapped artwork; Task 3 covers every user input path; Task 4 handles local source collection; Task 5 guards release integrity; Task 6 validates content and packaging.
- No placeholders: all source-map entries and catalog rows must be filled from the audited snapshot before a task is accepted; the plan specifies the schema, validation, paths, commands and expected outcomes.
- Type consistency: `ArtifactSetKey` is derived from `FIVE_STAR_ARTIFACT_SETS`; `artifactArtworkBySet`, resolvers, UI options, migrator and gate all consume that same catalog.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-15-all-five-star-artifact-snapshot.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task and review each task before proceeding.
2. **Inline Execution** — execute the tasks in this session with checkpoints.
