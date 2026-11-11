# 圣遗物原版图标替换 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将本地版圣遗物图标改为由稳定 `setKey + slot` 决定，并建立缺图、兼容迁移、素材审计与最终 Windows 发布门禁。

**Architecture:** 把素材注册表、图标解析、遗留数据迁移和图标组件从 `App.tsx` 抽离。页面只传递完整圣遗物并消费 `ArtifactGlyph`；静态注册表显式声明 4 套 × 5 部位，未审核素材先以统一占位图表述。角色头像继续保留现有 `assetMap` 本地导入路径。

**Tech Stack:** Vite 8、React 19、TypeScript 6、Vitest、React Testing Library、Electron Builder、idb-keyval。

## Global Constraints

- 当前代码阶段不得下载、生成或打包未通过来源审核的《原神》原版素材。
- 圣遗物图标不得从网络热链加载，且不得回退到通用图或其他套装同部位图。
- 已支持套装固定为 `shenlang-zhongqu`、`heiyao-midian`、`zhuying-lieren`、`xishi-zhige`；每套必须声明花、羽、沙、杯、冠五项。
- 角色头像的 Q 版、原创及本地导入功能必须保留；仅移除圣遗物图标导入和读取逻辑。
- 仅 `ready` 且已在来源清单人工签收的 20 项素材可进入最终 Windows 发布包；否则交付状态只能是“代码阶段完成”。
- 在当前工作目录未初始化 Git 前，不执行 `git commit`；每项任务仍须完成独立测试周期。

---

## File Structure

| 路径 | 责任 |
| --- | --- |
| `apps/web/src/artifacts/types.ts` | 套装键、部位、圣遗物与图标解析的共享类型。 |
| `apps/web/src/assets/artifacts/manifest.ts` | 4×5 显式素材注册表、套装名解析、完整性与最终发布门禁验证。 |
| `apps/web/src/assets/artifacts/placeholder-missing.svg` | 唯一的中性缺图资源。 |
| `apps/web/src/artifacts/resolveArtwork.ts` | 按 `setKey + slot` 解析图标、开发告警与加载失败降级。 |
| `apps/web/src/artifacts/migrateArtifactData.ts` | 旧 JSON/IndexedDB 中的中文套装名与 `artifact:<id>` 覆盖迁移报告。 |
| `apps/web/src/components/ArtifactGlyph.tsx` | 所有页面共用的圣遗物图标组件。 |
| `apps/web/src/artifacts/*.test.ts` | 注册表、解析器与迁移的单元测试。 |
| `apps/web/src/components/ArtifactGlyph.test.tsx` | 正常、缺图、加载失败的组件测试。 |
| `apps/web/src/test/setup.ts` | DOM matcher 和测试环境设置。 |
| `apps/web/src/App.tsx` | 写入 `setKey`、迁移本地数据、移除圣遗物自定义入口、改用共享图标组件。 |
| `apps/web/src/App.test.tsx` | 手动录入、编辑、OCR 确认、导入、队列、回收站的集成覆盖。 |
| `apps/web/package.json` | 测试依赖与 `test` / `test:watch` 脚本。 |
| `apps/web/vite.config.ts` | Vitest 的 `jsdom` 测试环境设置。 |
| `docs/artifacts/source-register.md` | 20 项来源、哈希、处理与人工签收记录。 |
| `scripts/verify-artifact-release.mjs` | 拒绝非 20/20 ready、来源未签收或缺少构建产物素材的发布前校验。 |

### Task 1: 建立测试基础设施

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/vite.config.ts`
- Create: `apps/web/src/test/setup.ts`
- Create: `apps/web/src/test/smoke.test.ts`

**Interfaces:**
- Produces: `npm run test` 以单次模式运行 Vitest；`npm run test:watch` 运行 watch 模式。
- Produces: 测试环境为 `jsdom`，组件测试可使用 `@testing-library/jest-dom` matcher。

- [ ] **Step 1: 写出失败的测试环境烟雾测试**

```ts
// src/test/smoke.test.ts
import { expect, test } from 'vitest'

test('uses a DOM test environment', () => {
  const element = document.createElement('span')
  element.textContent = 'artifact-master'
  expect(element).toHaveTextContent('artifact-master')
})
```

- [ ] **Step 2: 运行测试并确认因脚本不存在而失败**

Run: `npm run test -- --run src/test/smoke.test.ts`

Expected: FAIL with a missing `test` script.

- [ ] **Step 3: 安装并配置测试依赖**

在 `package.json` 的 `devDependencies` 添加 `vitest`、`jsdom`、`@testing-library/react`、`@testing-library/jest-dom` 和 `@testing-library/user-event`，并添加：

```json
"test": "vitest run",
"test:watch": "vitest"
```

将 Vite 配置改为：

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    clearMocks: true,
  },
})
```

并在 `src/test/setup.ts` 写入：

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 4: 运行烟雾测试并确认通过**

Run: `npm run test -- src/test/smoke.test.ts`

Expected: PASS with 1 passed test.

- [ ] **Step 5: 记录独立变更**

记录变更说明：`test: add Vitest and React Testing Library harness`。

### Task 2: 定义稳定的圣遗物身份与素材注册表

**Files:**
- Create: `apps/web/src/artifacts/types.ts`
- Create: `apps/web/src/assets/artifacts/manifest.ts`
- Create: `apps/web/src/assets/artifacts/placeholder-missing.svg`
- Create: `apps/web/src/assets/artifacts/manifest.test.ts`

**Interfaces:**
- Produces: `ArtifactSetKey`、`ArtifactSlot`、`ArtifactRecord` 与 `ArtworkStatus`。
- Produces: `artifactSetNames`、`artifactArtworkBySet`、`resolveArtifactSetKey(setName)`、`assertArtifactManifestComplete({ requireReady })`。
- Consumes: 无。

- [ ] **Step 1: 写出失败的注册表完整性测试**

```ts
import { expect, test } from 'vitest'
import {
  ALL_ARTIFACT_SET_KEYS,
  ARTIFACT_SLOTS,
  artifactArtworkBySet,
  assertArtifactManifestComplete,
} from './manifest'

test('declares all twenty set-slot combinations', () => {
  expect(ALL_ARTIFACT_SET_KEYS).toHaveLength(4)
  for (const setKey of ALL_ARTIFACT_SET_KEYS) {
    expect(Object.keys(artifactArtworkBySet[setKey])).toEqual(ARTIFACT_SLOTS)
  }
  expect(() => assertArtifactManifestComplete({ requireReady: false })).not.toThrow()
})

test('blocks final release while any entry is missing', () => {
  expect(() => assertArtifactManifestComplete({ requireReady: true })).toThrow('尚有 20 项圣遗物原版素材未签收')
})
```

- [ ] **Step 2: 运行测试并确认模块不存在**

Run: `npm run test -- src/assets/artifacts/manifest.test.ts`

Expected: FAIL with “Failed to resolve import './manifest'”.

- [ ] **Step 3: 创建共享类型、占位 SVG 与显式注册表**

在 `types.ts` 导出：

```ts
export const ARTIFACT_SLOTS = ['生之花', '死之羽', '时之沙', '空之杯', '理之冠'] as const
export type ArtifactSlot = (typeof ARTIFACT_SLOTS)[number]
export type ArtifactSetKey = 'shenlang-zhongqu' | 'heiyao-midian' | 'zhuying-lieren' | 'xishi-zhige'
export type ArtworkStatus = 'ready' | 'missing'
export type ArtifactRecord = {
  id: number; name: string; set: string; setKey?: ArtifactSetKey; slot: ArtifactSlot
  level: number; score: number; main: string; subs: string[]; locked: boolean; hue: string
}
```

在 `manifest.ts` 声明 20 个对象；代码阶段所有条目都使用 `status: 'missing'` 与 `placeholderMissing`，但 `setKey`、`setName`、`slot` 和 `alt` 必须各自独立。例如花与羽分别写成：

```ts
'生之花': { setKey: 'shenlang-zhongqu', setName: '深廊终曲', slot: '生之花', status: 'missing', src: placeholderMissing, alt: '深廊终曲·生之花原版图标', missingReason: 'missing-asset' },
'死之羽': { setKey: 'shenlang-zhongqu', setName: '深廊终曲', slot: '死之羽', status: 'missing', src: placeholderMissing, alt: '深廊终曲·死之羽原版图标', missingReason: 'missing-asset' },
```

按同一明确结构补全四套的五个部位。`assertArtifactManifestComplete` 必须依次验证套装数、每套 key 顺序、条目中的 `setKey`/`slot` 自洽，并在 `requireReady` 为 true 时收集 `status === 'missing'` 的条目后抛出 `尚有 ${missing.length} 项圣遗物原版素材未签收`。

- [ ] **Step 4: 运行注册表测试并确认通过**

Run: `npm run test -- src/assets/artifacts/manifest.test.ts`

Expected: PASS with 2 passed tests.

- [ ] **Step 5: 记录独立变更**

记录变更说明：`feat: declare typed artifact artwork manifest`。

### Task 3: 实现唯一查图入口与缺图告警

**Files:**
- Create: `apps/web/src/artifacts/resolveArtwork.ts`
- Create: `apps/web/src/artifacts/resolveArtwork.test.ts`

**Interfaces:**
- Consumes: `ArtifactRecord`、`artifactArtworkBySet` 与 `resolveArtifactSetKey`。
- Produces: `getArtifactArtwork(artifact)` 返回 `{ src, alt, status, missingReason?, setKey? }`；永不返回其他套装的图。

- [ ] **Step 1: 写出失败的解析器测试**

```ts
import { expect, test, vi } from 'vitest'
import { getArtifactArtwork } from './resolveArtwork'

const base = { id: 1, name: '测试', set: '深廊终曲', setKey: 'shenlang-zhongqu', slot: '生之花', level: 0, score: 0, main: '生命值 717', subs: [], locked: false, hue: 'blue' } as const

test('resolves artwork by set key and slot', () => {
  expect(getArtifactArtwork(base)).toMatchObject({ status: 'missing', alt: '深廊终曲·生之花原版图标' })
})

test('does not use a different set when a set is unknown', () => {
  expect(getArtifactArtwork({ ...base, set: '未知套装', setKey: undefined })).toMatchObject({ status: 'missing', missingReason: 'unregistered-set' })
})

test('warns with locatable fields in development', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  getArtifactArtwork({ ...base, set: '未知套装', setKey: undefined })
  expect(warn).toHaveBeenCalledWith('[artifact-artwork:missing]', expect.objectContaining({ set: '未知套装', slot: '生之花', reason: 'unregistered-set' }))
})
```

- [ ] **Step 2: 运行测试并确认解析器不存在**

Run: `npm run test -- src/artifacts/resolveArtwork.test.ts`

Expected: FAIL with unresolved `./resolveArtwork`.

- [ ] **Step 3: 实现解析规则**

实现顺序固定为：有效 `setKey` → 精确 `set` 名映射 → 统一占位。`setKey` 存在但不在当前注册表时视为 `unregistered-set`；可识别套装中某项 `missing` 时保留条目自身的 `missing-asset`；不允许按 `slot` 查询或遍历其他套装。开发告警使用：

```ts
console.warn('[artifact-artwork:missing]', { setKey: artifact.setKey, set: artifact.set, slot: artifact.slot, reason })
```

- [ ] **Step 4: 运行解析器测试并确认通过**

Run: `npm run test -- src/artifacts/resolveArtwork.test.ts`

Expected: PASS with 3 passed tests.

- [ ] **Step 5: 记录独立变更**

记录变更说明：`feat: resolve artifact artwork by set and slot`。

### Task 4: 建立旧数据迁移和圣遗物覆盖清单

**Files:**
- Create: `apps/web/src/artifacts/migrateArtifactData.ts`
- Create: `apps/web/src/artifacts/migrateArtifactData.test.ts`
- Modify: `apps/web/src/App.tsx:23-26,133-152`

**Interfaces:**
- Consumes: 历史 `ArtifactRecord[]`、历史 `Record<string, string>` 资源映射与 `resolveArtifactSetKey`。
- Produces: `migrateArtifactLibrary({ artifacts, assets })`，返回 `{ artifacts, migrationReport, retainedAssets }`；每个可解析记录获得 `setKey`，所有 `artifact:<id>` 资源键保留但被报告为 ignored，所有 `character:<name>` 键原样保留。

- [ ] **Step 1: 写出失败的迁移测试**

```ts
import { expect, test } from 'vitest'
import { migrateArtifactLibrary } from './migrateArtifactData'

test('adds a stable key and preserves only character asset behavior', () => {
  const result = migrateArtifactLibrary({
    artifacts: [{ id: 42, name: '花', set: '逐影猎人', slot: '生之花', level: 0, score: 0, main: '生命值 717', subs: [], locked: false, hue: 'blue' }],
    assets: { 'artifact:42': 'data:image/png;base64,old', 'character:芙宁娜': 'data:image/png;base64,avatar' },
  })
  expect(result.artifacts[0].setKey).toBe('zhuying-lieren')
  expect(result.retainedAssets).toEqual({ 'character:芙宁娜': 'data:image/png;base64,avatar' })
  expect(result.migrationReport.ignoredArtifactOverrideIds).toEqual([42])
})

test('records an unresolved historical set without guessing', () => {
  const result = migrateArtifactLibrary({ artifacts: [{ id: 7, name: '未知', set: '旧套装', slot: '理之冠', level: 0, score: 0, main: '暴击率 4.7%', subs: [], locked: false, hue: 'blue' }], assets: {} })
  expect(result.artifacts[0].setKey).toBeUndefined()
  expect(result.migrationReport.unresolvedArtifactIds).toEqual([7])
})
```

- [ ] **Step 2: 运行测试并确认迁移模块不存在**

Run: `npm run test -- src/artifacts/migrateArtifactData.test.ts`

Expected: FAIL with unresolved `./migrateArtifactData`.

- [ ] **Step 3: 实现迁移并接入本地加载**

`migrateArtifactLibrary` 不能删除浏览器数据；在首次 IndexedDB 加载后执行，并把报告保存到 `localStorage['artifact-master-artwork-migration-v1']`。当报告键已存在时，不重新写入。持久化的 `assetMap` 仅保留 `character:` 项；旧 `artifact:` 项只在报告中列出，下一版本由用户确认后的显式清理动作处理。

- [ ] **Step 4: 运行迁移测试并确认通过**

Run: `npm run test -- src/artifacts/migrateArtifactData.test.ts`

Expected: PASS with 2 passed tests.

- [ ] **Step 5: 记录独立变更**

记录变更说明：`feat: migrate legacy artifact icon overrides safely`。

### Task 5: 抽出共享图标组件并覆盖所有现有展示点

**Files:**
- Create: `apps/web/src/components/ArtifactGlyph.tsx`
- Create: `apps/web/src/components/ArtifactGlyph.test.tsx`
- Modify: `apps/web/src/App.tsx:1-86,661-683,723`
- Modify: `apps/web/src/App.css`（仅为缺图状态增加可读的边框与提示样式）

**Interfaces:**
- Consumes: `ArtifactRecord` 与 `getArtifactArtwork`。
- Produces: `<ArtifactGlyph artifact={artifact} />`；图片的 `alt` 为清单提供的文本，加载失败后展示占位图并设置 `data-artwork-status="missing"`。

- [ ] **Step 1: 写出失败的组件测试**

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { ArtifactGlyph } from './ArtifactGlyph'

const artifact = { id: 1, name: '测试', set: '黑曜秘典', setKey: 'heiyao-midian', slot: '空之杯', level: 0, score: 0, main: '火元素伤害加成 7.0%', subs: [], locked: false, hue: 'red' } as const

test('renders the resolved set-slot alt text', () => {
  render(<ArtifactGlyph artifact={artifact} />)
  expect(screen.getByRole('img', { name: '黑曜秘典·空之杯原版图标' })).toBeInTheDocument()
})

test('marks image load failures as missing', () => {
  render(<ArtifactGlyph artifact={artifact} />)
  const image = screen.getByRole('img')
  fireEvent.error(image)
  expect(image.closest('[data-artwork-status]')).toHaveAttribute('data-artwork-status', 'missing')
})
```

- [ ] **Step 2: 运行测试并确认组件不存在**

Run: `npm run test -- src/components/ArtifactGlyph.test.tsx`

Expected: FAIL with unresolved `./ArtifactGlyph`.

- [ ] **Step 3: 实现组件并移除旧的单部位图机制**

从 `App.tsx` 删除五个 `relic-*-opt.jpg` import、`slotArtwork` 和旧的内嵌 `ArtifactGlyph`。替换仓库网格、详情面板、强化队列和回收站中的调用为 `<ArtifactGlyph artifact={artifact} />`。删除 `ArtifactCard.imageSrc` 参数和全部 `assetMap['artifact:${id}']` 读取。保持 `assetMap['character:${name}']` 的角色头像读取不变。

- [ ] **Step 4: 运行组件测试和类型检查并确认通过**

Run: `npm run test -- src/components/ArtifactGlyph.test.tsx && npm run build`

Expected: PASS; TypeScript 不再引用 `slotArtwork`、`imageSrc` 或圣遗物 `src` 覆盖参数。

- [ ] **Step 5: 记录独立变更**

记录变更说明：`refactor: render all artifact icons through shared resolver`。

### Task 6: 使全部写入路径生成 `setKey` 并移除圣遗物导入入口

**Files:**
- Modify: `apps/web/src/App.tsx:196-214,564-611,666-677,745-746,748-748`
- Create: `apps/web/src/App.test.tsx`

**Interfaces:**
- Consumes: `resolveArtifactSetKey` 和共享 `ArtifactRecord`。
- Produces: 手动录入、编辑、OCR 确认和 JSON 导入的记录均有与 `set` 匹配的 `setKey`；不再渲染“导入此圣遗物图标”。

- [ ] **Step 1: 写出失败的界面流程测试**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import App from './App'

test('creates a record with a set-derived icon and no custom icon upload action', async () => {
  const user = userEvent.setup()
  render(<App />)
  expect(screen.queryByText('导入此圣遗物图标')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '手动录入' }))
  await user.type(screen.getByLabelText('名称'), '映射测试')
  await user.selectOptions(screen.getByLabelText('套装'), '逐影猎人')
  await user.selectOptions(screen.getByLabelText('部位'), '死之羽')
  await user.type(screen.getByLabelText('主词条'), '攻击力 47')
  await user.click(screen.getByRole('button', { name: '保存圣遗物' }))
  expect(screen.getByRole('img', { name: '逐影猎人·死之羽原版图标' })).toBeInTheDocument()
})
```

- [ ] **Step 2: 运行测试并确认它因旧 UI 而失败**

Run: `npm run test -- src/App.test.tsx`

Expected: FAIL because “导入此圣遗物图标” still exists or the created artifact has no set-derived glyph.

- [ ] **Step 3: 修改所有创建和导入路径**

创建一个内部辅助函数 `artifactFromFields(fields, defaults)`，它读取 `set` 后立即设置 `setKey: resolveArtifactSetKey(set)`。`addArtifact`、`saveOcrArtifact` 和 `updateArtifact` 均调用它。`importLibrary` 对 payload 调用 `migrateArtifactLibrary`，只导入其 `retainedAssets`，并将报告写入本地存储。删除 `saveOcrArtifact` 对 `pendingOcrImage` 的 `artifact:` 写入，且删除详情面板的图标上传 `<label>`。

- [ ] **Step 4: 扩展并运行完整流程测试**

加入以下断言：编辑“深廊终曲”的部位后新 `alt` 立即变化；OCR 确认保存“黑曜秘典”后显示对应 `alt`；导入缺少 `setKey` 的 JSON 后中文名可解析时显示对应 `alt`，不可解析时显示占位状态；强化队列与回收站对同一记录显示同样的 `alt`。

Run: `npm run test -- src/App.test.tsx`

Expected: PASS with manual-entry, edit, OCR, JSON-import, queue, and trash coverage.

- [ ] **Step 5: 记录独立变更**

记录变更说明：`feat: derive artifact artwork identity across every write path`。

### Task 7: 建立素材来源清单与最终发布校验

**Files:**
- Create: `docs/artifacts/source-register.md`
- Create: `scripts/verify-artifact-release.mjs`
- Modify: `apps/web/package.json`
- Create: `scripts/verify-artifact-release.test.mjs`

**Interfaces:**
- Produces: `npm run verify:artifact-release`。
- Consumes: `manifest.ts` 的 `status`/素材路径和 `source-register.md` 的 20 行 Markdown 表格。
- Produces: 失败时显示每个缺失的 `setKey/slot`；成功时输出 `20/20 原版素材与来源签收通过`。

- [ ] **Step 1: 写出失败的发布门禁测试**

```js
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

assert.throws(
  () => execFileSync(process.execPath, ['scripts/verify-artifact-release.mjs'], { cwd: process.cwd(), encoding: 'utf8' }),
  /尚有 20 项圣遗物原版素材未签收/,
)
```

- [ ] **Step 2: 运行测试并确认校验脚本不存在**

Run: `node scripts/verify-artifact-release.test.mjs`

Expected: FAIL with missing `scripts/verify-artifact-release.mjs`.

- [ ] **Step 3: 创建 20 项来源清单和发布校验**

`source-register.md` 使用以下固定列：`setKey | 官方中文名 | 部位 | 状态 | 来源 URL | 获取日期 | 使用依据 | 源 SHA-256 | 项目 SHA-256 | 格式 | 像素 | 字节 | 处理说明 | 签收人 | 签收日期`。立即建立 20 行，每行初始 `状态` 为 `missing`、其余审核字段为 `未提供`；“深廊终曲”的使用依据填入需求中给出的官方页面 URL。脚本必须：

1. 读取注册表并确认每套五项均存在；
2. 确认 20 项均为 `ready`；
3. 确认清单存在同样 20 个唯一 `setKey + 部位`，且状态为 `approved`；
4. 确认每个 `ready` 图片文件存在；
5. 对每个 ready 文件计算 SHA-256 并与清单项目 SHA-256 比对。

在 `package.json` 添加：

```json
"verify:artifact-release": "node ../scripts/verify-artifact-release.mjs"
```

并将脚本相对路径调整为从 `apps/web` 运行时仍能定位工作区根目录。

- [ ] **Step 4: 运行门禁并确认代码阶段按预期阻止发布**

Run: `npm run verify:artifact-release`

Expected: FAIL with `尚有 20 项圣遗物原版素材未签收`，并列出 20 项缺口；该失败是本阶段正确结果。

- [ ] **Step 5: 记录独立变更**

记录变更说明：`docs: add audited artifact source register and release gate`。

### Task 8: 接收审核素材并执行最终多端发布验收

**Files:**
- Create: `apps/web/src/assets/artifacts/<set-key>/{flower,plume,sands,goblet,circlet}.png`（仅限已审核通过的文件）
- Modify: `apps/web/src/assets/artifacts/manifest.ts`
- Modify: `docs/artifacts/source-register.md`

**Interfaces:**
- Consumes: 已获授权或确认可用的 20 个原版源文件及其来源、日期、使用依据。
- Produces: 所有注册项 `status: 'ready'`，`npm run verify:artifact-release` 可通过。

- [ ] **Step 1: 写出最终发布前的失败断言**

```ts
import { expect, test } from 'vitest'
import { assertArtifactManifestComplete } from './manifest'

test('allows a final release only after every artwork item is ready', () => {
  expect(() => assertArtifactManifestComplete({ requireReady: true })).not.toThrow()
})
```

- [ ] **Step 2: 在全部审核素材实际到位前运行并确认它失败**

Run: `npm run test -- src/assets/artifacts/manifest.test.ts && npm run verify:artifact-release`

Expected: FAIL because at least one entry is `missing`; do not mark release complete.

- [ ] **Step 3: 处理并登记每个审核素材**

只在已获取并核实来源的情况下，将源文件无拉伸、无裁切主体地保存为对应 set-key 目录的 PNG。每张控制在建议的 200 KB 以内且保留透明背景；在清单中填入真实 URL、日期、哈希、尺寸、大小、处理说明与签收信息；再将对应 manifest 条目更新为 `status: 'ready'` 和真实 `src` import。不得复制同一个文件到多个位置。

- [ ] **Step 4: 执行代码、素材、桌面和视觉验收**

Run: `npm run lint && npm run test && npm run build && npm run verify:artifact-release && npm run desktop:build`

Expected: 所有命令 PASS；发布门禁输出 `20/20 原版素材与来源签收通过`。

手工验证：在浏览器桌面宽度、窄屏移动宽度和生成的 Windows 便携程序中分别查看仓库、详情、强化队列、回收站、推荐方案和 OCR 入库后条目；任取两个不同套装的同一部位，确认 `src` 不同且图标主体、锁、等级和星级互不遮挡。

- [ ] **Step 5: 记录最终交付状态**

只有步骤 4 的全部命令、来源签收清单和三端截图均完成时，记录变更说明：`release: ship audited original artifact artwork`；否则标记为“代码阶段完成”，附 20 项中尚未签收的缺口。

## Self-Review

- Spec coverage: 需求中的 set+slot 映射、20 项清单、缺图占位、无跨套回退、角色头像保留、旧覆盖迁移、全展示点、OCR/JSON、来源/哈希、构建/桌面验收均各有对应任务。
- Placeholder scan: 本计划不包含 TBD、TODO 或“后续实现”占位；唯一的待外部输入是明确列出的、已审核的 20 个原版素材，未到位时由 Task 7/8 的门禁阻止发布。
- Type consistency: `ArtifactSetKey`、`ArtifactSlot`、`ArtifactRecord`、`getArtifactArtwork` 与 `ArtifactGlyph` 的字段名在各任务中一致。
