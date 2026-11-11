# 原神圣遗物详情页 OCR 分区识别 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不上传截图的前提下，可靠预填原神横屏圣遗物详情页的结构化字段，并保留人工确认。

**Architecture:** 将布局计算、OCR 文本解析放入无 DOM 的 `artifactOcr` 模块，使 16:9 截图区域与字段规则可单测。将 Canvas 预处理与 Tesseract 调用保留在一个浏览器侧 `artifactOcrImage` 模块；`App` 仅协调状态、分区结果和确认表单。

**Tech Stack:** React 19、TypeScript、Vitest、Tesseract.js、浏览器 Canvas API。

## Global Constraints

- 仅处理用户选择的本地 PNG、JPG、WebP；不上传、不保存整张截图。
- 横屏阈值固定为宽高比 `>= 1.3`；不满足时使用整图 OCR 降级。
- 仅使用现有 `tesseract.js` 的 `chi_sim+eng`；不新增在线服务或大型模型。
- 自动预填只接受完整套装名、五种合法部位、`0..20` 等级和有效词条模式；不猜测。
- 当前五星目录的每个简体中文套装名必须由可复现的游戏 TextMap/当前中文资料审计校正；旧错误名仅作为输入兼容别名，不作为界面或新记录值。
- OCR 结果仍需用户点击“确认并入库”。
- 本工作区无 Git 元数据；记录测试命令与结果，不执行提交。

---

### Task 0: 五星套装中文名称审计与旧名兼容

**Files:**
- Modify: `apps/web/src/artifacts/catalog.snapshot.ts`
- Modify: `apps/web/src/artifacts/catalog.ts`
- Modify: `apps/web/src/artifacts/catalog.test.ts`
- Create: `apps/web/src/artifacts/catalog.aliases.ts`
- Create: `docs/artifacts/five-star-name-audit-2026-08-17.md`

**Interfaces:**
- Produces `ARTIFACT_SET_NAME_ALIASES: Readonly<Record<string, string>>`，键为历史错误中文名、值为正式中文名。
- Updates `findArtifactSetByName(name: string)` to resolve an exact formal name or exact alias before returning the catalog row.
- Consumes the saved TextMap-derived audit and the current `FIVE_STAR_ARTIFACT_SETS` snapshot.

- [ ] **Step 1: 写入失败测试：正式名和历史名指向同一套装**

```ts
test('resolves the corrected Silken Moon name and its prior local alias to the same set', () => {
  expect(findArtifactSetByName('纺月的夜歌')?.key).toBe('silken-moons-serenade')
  expect(findArtifactSetByName('柔灯挽歌')?.key).toBe('silken-moons-serenade')
})
```

- [ ] **Step 2: 运行目录测试，确认正式名称尚未命中**

Run: `npm test -- --run src/artifacts/catalog.test.ts`

Expected: FAIL，正式名称未出现在当前目录且别名尚未解析。

- [ ] **Step 3: 根据审计表更正所有目录中文名并实现别名解析**

将审计来源、固定修订/日期、44 个 set key 的旧名与正式名写入 `docs/artifacts/five-star-name-audit-2026-08-17.md`。`catalog.snapshot.ts` 只保存正式名；`catalog.aliases.ts` 仅保存实际发生过变更的旧名到正式名映射。

- [ ] **Step 4: 增加全量审计回归并运行目录测试**

```ts
test('keeps every catalog Chinese name equal to the audited roster', () => {
  expect(FIVE_STAR_ARTIFACT_SETS.map(({ key, name }) => [key, name])).toEqual(AUDITED_CHINESE_SET_NAMES)
})
```

Run: `npm test -- --run src/artifacts/catalog.test.ts`

Expected: PASS。

### Task 1: 可测试的布局与字段解析器

### Task 1: 可测试的布局与字段解析器

**Files:**
- Create: `apps/web/src/artifacts/artifactOcr.ts`
- Create: `apps/web/src/artifacts/artifactOcr.test.ts`

**Interfaces:**
- Produces `getArtifactOcrRegions(width: number, height: number): ArtifactOcrRegion[] | null`。
- Produces `parseArtifactOcr(regions: ArtifactOcrText): ParsedArtifactOcr`，其中 `ArtifactOcrText` 含 `title`、`stats`、`set`，`ParsedArtifactOcr` 含可选 `name`、`set`、`slot`、`level`、`main` 及 `subs: string[]`。
- Consumes `FIVE_STAR_ARTIFACT_SETS` 与现有 `ARTIFACT_SLOTS`。

- [ ] **Step 1: 写入失败测试：16:9 区域和非横屏降级**

```ts
import { getArtifactOcrRegions } from './artifactOcr'

test('splits a 16:9 Genshin detail screen into bounded title, stats, and set regions', () => {
  expect(getArtifactOcrRegions(4608, 2160)).toEqual([
    expect.objectContaining({ id: 'title', x: expect.any(Number), y: expect.any(Number) }),
    expect.objectContaining({ id: 'stats' }),
    expect.objectContaining({ id: 'set' }),
  ])
})

test('returns null for a non-landscape input', () => {
  expect(getArtifactOcrRegions(1080, 1920)).toBeNull()
})
```

- [ ] **Step 2: 运行区域测试，确认因模块不存在而失败**

Run: `npm test -- --run src/artifacts/artifactOcr.test.ts`

Expected: FAIL，提示无法解析 `./artifactOcr`。

- [ ] **Step 3: 写入失败测试：示例截图的结构化字段**

```ts
test('parses the supplied crown detail without accepting effect-description noise', () => {
  expect(parseArtifactOcr({
    title: '司信者的圣冕\n理之冠',
    stats: '+20\n暴击伤害 62.2%\n元素精通 +40\n防御力 +16\n暴击率 +3.9%\n元素充能效率 +22.7%',
    set: '纺月的夜歌\n2件套：元素充能效率提高20%',
  })).toEqual({
    name: '司信者的圣冕', set: '纺月的夜歌', slot: '理之冠', level: 20,
    main: '暴击伤害 62.2%', subs: ['元素精通 +40', '防御力 +16', '暴击率 +3.9%', '元素充能效率 +22.7%'],
  })
})
```

- [ ] **Step 4: 运行解析测试，确认因函数不存在而失败**

Run: `npm test -- --run src/artifacts/artifactOcr.test.ts`

Expected: FAIL，提示 `parseArtifactOcr` 未导出。

- [ ] **Step 5: 实现最小布局与解析模块**

```ts
export const getArtifactOcrRegions = (width: number, height: number) =>
  width / height < 1.3 ? null : [
    { id: 'title', x: .61, y: .01, width: .38, height: .18 },
    { id: 'stats', x: .61, y: .17, width: .38, height: .30 },
    { id: 'set', x: .61, y: .44, width: .38, height: .14 },
  ].map((region) => ({ ...region, x: Math.round(width * region.x), y: Math.round(height * region.y), width: Math.round(width * region.width), height: Math.round(height * region.height) }))
```

`parseArtifactOcr` 只从标题区取第一个非部位行作为名称、从属性区按第一条合法词条取主词条并依序取四条副词条、从套装区按目录精确匹配取套装。

- [ ] **Step 6: 运行解析器测试，确认通过**

Run: `npm test -- --run src/artifacts/artifactOcr.test.ts`

Expected: PASS。

### Task 2: 浏览器侧分区预处理与 OCR 协调

**Files:**
- Create: `apps/web/src/artifacts/artifactOcrImage.ts`
- Create: `apps/web/src/artifacts/artifactOcrImage.test.ts`

**Interfaces:**
- Produces `prepareArtifactOcrImages(file: Blob): Promise<PreparedArtifactOcrImages>`，返回 `regions` 与对应 Blob；非横屏时返回单个 `full` 区域。
- Produces `formatArtifactOcrText(text: ArtifactOcrText): string`，以 `【名称与部位】`、`【属性】`、`【套装】` 标签拼接原文。
- Consumes Task 1 的 `getArtifactOcrRegions`。

- [ ] **Step 1: 写入失败测试：OCR 原文保留区域标签**

```ts
test('formats each OCR region under an inspectable label', () => {
  expect(formatArtifactOcrText({ title: '理之冠', stats: '+20', set: '纺月的夜歌' }))
    .toBe('【名称与部位】\n理之冠\n\n【属性】\n+20\n\n【套装】\n纺月的夜歌')
})
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test -- --run src/artifacts/artifactOcrImage.test.ts`

Expected: FAIL，提示模块或函数不存在。

- [ ] **Step 3: 实现 Canvas 预处理**

对每个区域创建 Canvas，按最长边至少放大到 1600px；逐像素转换灰度，应用 `contrast = 1.8`，将亮度高于 155 的像素置白、低于阈值置黑，并编码为 PNG。使用 `try/finally` 撤销对象 URL。

- [ ] **Step 4: 实现区域标签格式化并运行测试**

Run: `npm test -- --run src/artifacts/artifactOcrImage.test.ts`

Expected: PASS。

### Task 3: 接入单张、批量与实时 OCR 表单

**Files:**
- Modify: `apps/web/src/App.tsx:291-315, 450-545`
- Modify: `apps/web/src/App.test.tsx`

**Interfaces:**
- Consumes `prepareArtifactOcrImages`、`parseArtifactOcr` 和 `formatArtifactOcrText`。
- Produces表单中仅对 `ParsedArtifactOcr` 已定义字段进行预填；OCR 原文为带标签分区文本。

- [ ] **Step 1: 写入失败测试：确认 OCR 文本只填确定字段**

```tsx
test('prefills recognized set, slot, level, main stat, and four substats from regional OCR text', async () => {
  // 使用模块 mock 返回包含示例截图字段的 ParsedArtifactOcr；断言表单字段与副词条 textarea。
})
```

- [ ] **Step 2: 运行 App 测试，确认失败**

Run: `npm test -- --run src/App.test.tsx`

Expected: FAIL，说明副词条字段尚未由 OCR 预填或区域格式尚未接入。

- [ ] **Step 3: 最小接入**

将 `recognizeImage` 改为创建一个 worker 后按分区顺序识别；分区失败时仅留下该区空文本。单张截图、批量截图和实时截图共用同一识别协调函数。`prefillOcrFields` 改接收 `ParsedArtifactOcr`，仅在字段有值时写入，并将 `subs` 写入 OCR 表单新增的副词条 textarea。

- [ ] **Step 4: 运行 App 与 OCR 聚焦测试**

Run: `npm test -- --run src/App.test.tsx src/artifacts/artifactOcr.test.ts src/artifacts/artifactOcrImage.test.ts`

Expected: PASS。

- [ ] **Step 5: 完整验证**

Run: `npm test && npm run lint && npm run build`

Expected: 测试、静态检查和生产构建均通过；生产构建不新增远程 OCR 服务或私有原图。
