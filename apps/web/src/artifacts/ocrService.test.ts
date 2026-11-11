import { afterEach, expect, test, vi } from 'vitest'
import { createOcrSession } from './ocrService'
import { getRecognitionProblems } from '../imports/recognitionCheck'
const mocks = vi.hoisted(() => ({ createWorker: vi.fn(), prepare: vi.fn(), crop: vi.fn() }))
const detail = vi.hoisted(() => ({ detect: vi.fn() }))
vi.mock('./detailDetection', () => ({ detectArtifactDetail: detail.detect }))
vi.mock('tesseract.js', () => ({ createWorker: mocks.createWorker }))
vi.mock('./artifactOcrImage', () => ({ prepareDetailOcrImages: mocks.prepare, formatArtifactOcrText: (t: object) => JSON.stringify(t) }))
vi.mock('../capture/captureRegion', () => ({ cropDetailRegion: mocks.crop }))
afterEach(() => { vi.restoreAllMocks(); delete window.artifactDesktop })

test.each(['生命值+4.1%(待激活)', '生命值+4.1%(待激活', '生命值+4.19%(待激活)'])('browser OCR preserves dormant state before numeric fast/recheck branches: %s', async pending => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })))
  const texts = ['止于荣礼的缎彩\n生之花', '生命值 717\n+0', '暴击率+3.1%', '攻击力+19', '暴击伤害+5.4%', pending, '影中沉凝的幻灭']
  const images = texts.map(text => new Blob([text]))
  mocks.prepare.mockResolvedValue(images.map((image, i) => ({ id: i === 0 ? 'title' : i === 6 ? 'set' : 'stats', image, subIndex: i >= 2 && i <= 5 ? i - 1 : undefined })))
  const symbols = [{ text: '+', bbox: { x0: 100, y0: 0, x1: 110, y1: 30 } }, { text: '4', bbox: { x0: 112, y0: 0, x1: 125, y1: 30 } }]
  mocks.createWorker.mockResolvedValue({ recognize: async (image: Blob, options?: { rectangle?: unknown }) => ({ data: { text: options?.rectangle ? '+4.1%' : texts[images.indexOf(image)], confidence: 95, blocks: [{ paragraphs: [{ lines: [{ words: [{ symbols }] }] }] }] } }), terminate: vi.fn(), setParameters: vi.fn(), reinitialize: vi.fn() })
  const session = await createOcrSession()
  try {
    const result = await session.recognize(new Blob(['frame']))
    expect(result.draft.subs).toEqual([{ key: 'critRate', value: 3.1 }, { key: 'atkFlat', value: 19 }, { key: 'critDamage', value: 5.4 }])
    expect(result.draft.pendingSubs).toEqual([{ key: 'hpPercent', value: pending.includes('4.19') ? 4.19 : 4.1 }])
    expect(getRecognitionProblems(result.draft).length > 0).toBe(pending.includes('4.19'))
    expect(result.identityEvidence).not.toContainEqual({ key: 'hpPercent', value: 4.1 })
  } finally { await session.dispose() }
})

function nativeRows(charge = '?元素充能效率+6.5%') {
  return ['止于荣礼的缎彩', '生之花', '生命值', '4,780', '★★★★★', '+20', '·攻击力+9.9%', charge, '·暴击伤害+28.0%', '·暴击率+6.2%', '影中沉凝的幻灭：(4)'].map((text, index) => {
    const y = [5, 110, 190, 190, 290, 380, 460, 530, 595, 665, 742][index], x = index === 3 ? 600 : 5
    return { text, score: .98, box: [[x, y], [x + (index === 3 ? 200 : 450), y], [x + (index === 3 ? 200 : 450), y + 50], [x, y + 50]], occluded: false }
  })
}
test('desktop defaults to native PP-OCRv5 and groups separate main label/value without filling from growth tables', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })))
  mocks.prepare.mockResolvedValue([{ id: 'title', image: new Blob() }])
  mocks.createWorker.mockResolvedValue({ recognize: async () => ({ data: { text: '旧引擎', confidence: 90 } }), terminate: vi.fn(), setParameters: vi.fn(), reinitialize: vi.fn() })
  Object.assign(window, { artifactDesktop: { nativeOcr: { open: async () => 'session-1', recognize: async () => ({ engine: 'PP-OCRv5-server', width: 911, height: 798, elapsedMs: 750, lines: nativeRows() }), close: async () => {} } } })
  const session = await createOcrSession()
  try {
    const result = await session.recognize(new Blob(['frame']))
    expect(result.draft.main).toEqual({ key: 'hpFlat', value: 4780 })
    expect(result.draft.subs).toEqual([{ key: 'atkPercent', value: 9.9 }, { key: 'energyRecharge', value: 6.5 }, { key: 'critDamage', value: 28 }, { key: 'critRate', value: 6.2 }])
    expect(getRecognitionProblems(result.draft)).toEqual([])
    expect(result.rawText).toContain('?元素充能效率+6.5%')
  } finally { await session.dispose() }
})
test('native desktop failures never silently fall back to the old worker', async () => {
  Object.assign(window, { artifactDesktop: { nativeOcr: { open: async () => { throw Error('native missing') }, recognize: vi.fn(), close: vi.fn() } } })
  await expect(createOcrSession()).rejects.toThrow('native missing')
})
test('conflicting observed digits from same-image routes cannot become confirmable', async () => {
  Object.assign(window, { artifactDesktop: { nativeOcr: { open: async () => 'conflict-session', recognize: async () => ({ engine: 'PP-OCRv5-server', width: 911, height: 798, elapsedMs: 750, lines: nativeRows(), route: 'mixed', modelId: 'ppocr-v5-server', conflicts: ['sub1'], fallbackReason: 'low-confidence-or-field-format', timings: { detMs: 20, recMs: 50 } }), close: async () => {} } } })
  const session = await createOcrSession()
  try {
    const result = await session.recognize(new Blob(['frame']))
    expect(result.route).toBe('mixed')
    expect(result.rawText).toContain('low-confidence-or-field-format')
    expect(getRecognitionProblems(result.draft).join(' ')).toContain('冲突')
  } finally { await session.dispose() }
})
test('a low-confidence lock icon on the slot row is not a numeric attribute', async () => {
  const lines = nativeRows()
  lines.push({ text: '6', score: .2, occluded: false, box: [[800,110],[850,110],[850,160],[800,160]] })
  Object.assign(window, { artifactDesktop: { nativeOcr: { open: async () => 'icon-session', recognize: async () => ({ engine: 'PP-OCRv5-server', width: 911, height: 798, elapsedMs: 10, lines }), close: async () => {} } } })
  const session = await createOcrSession()
  try { expect(getRecognitionProblems((await session.recognize(new Blob(['frame']))).draft)).toEqual([]) }
  finally { await session.dispose() }
})
test('an observed card main value below its standalone label is joined without growth-table filling', async () => {
  const lines = nativeRows()
  lines[3].box = [[5,250],[205,250],[205,280],[5,280]]
  Object.assign(window, { artifactDesktop: { nativeOcr: { open: async () => 'card-session', recognize: async () => ({ engine: 'PP-OCRv5-server', width: 911, height: 798, elapsedMs: 10, lines }), close: async () => {} } } })
  const session = await createOcrSession()
  try { expect((await session.recognize(new Blob(['frame']))).draft.main).toEqual({ key: 'hpFlat', value: 4780 }) }
  finally { await session.dispose() }
})
test('a leading OCR colon used for a substat bullet does not discard that observed stat', async () => {
  const lines = nativeRows(); lines[8].text = '：暴击伤害+28.0%'
  Object.assign(window, { artifactDesktop: { nativeOcr: { open: async () => 'session-3', recognize: async () => ({ engine: 'PP-OCRv5-server', width: 911, height: 798, elapsedMs: 750, lines }), close: async () => {} } } })
  const session = await createOcrSession()
  try { const result = await session.recognize(new Blob(['frame'])); expect(result.draft.subs).toContainEqual({ key: 'critDamage', value: 28 }); expect(getRecognitionProblems(result.draft)).toEqual([]); expect(result.rawText).toContain('：暴击伤害+28.0%') }
  finally { await session.dispose() }
})
test('native OCR keeps invalid extra numeric precision and rejected late results after disposal', async () => {
  let finish!: (value: unknown) => void
  let hold = false
  Object.assign(window, { artifactDesktop: { nativeOcr: { open: async () => 'session-2', recognize: async () => { const result = { engine: 'PP-OCRv5-server', width: 911, height: 798, elapsedMs: 750, lines: nativeRows('·元素充能效率+6.59%') }; return hold ? new Promise(resolve => { finish = resolve }) : result }, close: async () => {} } } })
  const session = await createOcrSession()
  const invalid = await session.recognize(new Blob(['frame']))
  expect(invalid.draft.subs).toContainEqual({ key: 'energyRecharge', value: 6.59 })
  expect(getRecognitionProblems(invalid.draft).join(' ')).toContain('6.59%')
  hold = true
  const late = session.recognize(new Blob(['frame'])), rejected = expect(late).rejects.toThrow('结束')
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
  await session.dispose(); finish({ engine: 'PP-OCRv5-server', width: 911, height: 798, elapsedMs: 750, lines: nativeRows() })
  await rejected
})
detail.detect.mockImplementation(async (image: Blob) => ({ image, roi: { x: 2870, y: 200, width: 850, height: 810 }, width: 3840, height: 2160 }))

test('full-frame OCR defaults to automatically detected detail and returns its preview, not the game screen', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })))
  mocks.prepare.mockResolvedValue([{ id: 'title', image: new Blob() }])
  mocks.createWorker.mockResolvedValue({ recognize: vi.fn(async () => ({ data: { text: '测试', confidence: 80 } })), terminate: vi.fn(), setParameters: vi.fn(), reinitialize: vi.fn() })
  const session = await createOcrSession(); const result = await session.recognize(new Blob(['frame']))
  expect(result).toMatchObject({ detailRoi: { x: 2870, y: 200, width: 850, height: 810 } })
  expect(result.detailImage).toBeInstanceOf(Blob)
  expect(result.timings).toMatchObject({ locateMs: expect.any(Number), prepareMs: expect.any(Number), ocrMs: expect.any(Number), parseMs: expect.any(Number), totalMs: expect.any(Number) })
  await session.dispose()
})
test('numeric retry includes a percent glyph even when the Chinese OCR misread it as a Chinese character', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })))
  mocks.prepare.mockResolvedValue([{ id: 'stats', image: new Blob(['main']) }, { id: 'stats', image: new Blob(['sub']) }])
  let ordinary = 0
  const symbols = [{ text: '+', bbox: { x0: 40, y0: 10, x1: 50, y1: 30 } }, { text: '6', bbox: { x0: 52, y0: 10, x1: 65, y1: 30 } }, { text: '.', bbox: { x0: 67, y0: 10, x1: 70, y1: 30 } }, { text: '5', bbox: { x0: 72, y0: 10, x1: 85, y1: 30 } }, { text: '硼', bbox: { x0: 87, y0: 10, x1: 110, y1: 30 } }]
  const recognize = vi.fn(async (_image, options) => options?.rectangle
    ? { data: { text: options.rectangle.left + options.rectangle.width >= 110 ? '6.5%' : '6.54', confidence: 95 } }
    : { data: { text: ++ordinary === 1 ? '攻击力 47' : '元素充能效率+6.5硼', confidence: 70, blocks: [{ paragraphs: [{ lines: [{ words: [{ symbols }] }] }] }] } })
  mocks.createWorker.mockResolvedValue({ recognize, terminate: vi.fn(), setParameters: vi.fn(), reinitialize: vi.fn() })
  const session = await createOcrSession(); const result = await session.recognize(new Blob())
  expect(result.draft.subs).toEqual([{ key: 'energyRecharge', value: 6.5 }])
  await session.dispose()
})

test('numeric recheck uses the canonical charge label and adopts observed 6.5 without rounding 6.54', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })))
  const texts = ['止于荣礼的缎彩\n生之花', '生命值 4780\n+20', '攻击力+9.9%', '元素苑能效率+6.54%', '暴击伤害+28.0%', '暴击率+6.2%', '影中沉凝的幻灭']
  const images = texts.map(text => new Blob([text]))
  mocks.prepare.mockResolvedValue(images.map((image, index) => ({ id: index === 0 ? 'title' : index === 6 ? 'set' : 'stats', image, width: 300, height: 70 })))
  const symbols = [{ text: '+', bbox: { x0: 150, y0: 10, x1: 160, y1: 30 } }, { text: '6', bbox: { x0: 162, y0: 10, x1: 175, y1: 30 } }]
  const recognize = vi.fn(async (image: Blob, options?: { rectangle?: unknown }) => ({ data: { text: options?.rectangle ? '+6.5%' : texts[images.indexOf(image)], confidence: 90, blocks: [{ paragraphs: [{ lines: [{ words: [{ symbols }] }] }] }] } }))
  mocks.createWorker.mockResolvedValue({ recognize, terminate: vi.fn(), setParameters: vi.fn(), reinitialize: vi.fn() })
  const session = await createOcrSession()
  try {
    const result = await session.recognize(new Blob())
    expect(result.draft.subs).toContainEqual({ key: 'energyRecharge', value: 6.5 })
    expect(getRecognitionProblems(result.draft)).toEqual([])
    expect(result.rawText).toContain('元素苑能效率+6.54%')
  } finally { await session.dispose() }
})
test('a clipped invalid main is recovered only from actual full-detail OCR for the same set and matching growth', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })))
  mocks.prepare.mockResolvedValue([{ id: 'title', image: new Blob() }, { id: 'stats', image: new Blob() }, { id: 'set', image: new Blob() }])
  let count = 0
  mocks.createWorker.mockResolvedValue({ recognize: vi.fn(async () => ({ data: { text: ['猎人的胸花\n生之花', '生命值 478\n+20', '逐影猎人', '猎人的胸花\n生之花\n生命值 4780\n+20\n逐影猎人'][count++] ?? '', confidence: 90 } })), terminate: vi.fn(), setParameters: vi.fn(), reinitialize: vi.fn() })
  const session = await createOcrSession(); const result = await session.recognize(new Blob())
  expect(result.draft.main).toEqual({ key: 'hpFlat', value: 4780 })
  await session.dispose()
})

test('initialization failure terminates its created worker rather than leaking it', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })))
  const terminate = vi.fn(async () => {})
  mocks.createWorker.mockResolvedValue({ terminate, setParameters: vi.fn(async () => { throw new Error('初始化失败') }) })
  await expect(createOcrSession()).rejects.toThrow('初始化失败')
  expect(terminate).toHaveBeenCalledTimes(1)
})
test('local paths only, serialized reuse and one termination', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })))
  let active = 0; let maximum = 0
  const recognize = vi.fn(async () => { maximum = Math.max(maximum, ++active); await Promise.resolve(); active--; return { data: { text: '', confidence: 10 } } })
  const terminate = vi.fn(); mocks.createWorker.mockResolvedValue({ recognize, terminate, setParameters: vi.fn(), reinitialize: vi.fn() })
  mocks.prepare.mockResolvedValue([{ id: 'title', image: new Blob() }, { id: 'stats', image: new Blob() }, { id: 'set', image: new Blob() }])
  const session = await createOcrSession()
  await Promise.all([session.recognize(new Blob()), session.recognize(new Blob())])
  expect(mocks.createWorker).toHaveBeenCalledTimes(1)
  const config = mocks.createWorker.mock.calls[0][2]
  for (const key of ['workerPath', 'corePath', 'langPath']) { expect(config[key]).toContain('/ocr/'); expect(config[key]).not.toMatch(/cdn|http.*tessdata/) }
  expect(maximum).toBe(1); expect(config.cacheMethod).toBe('none'); expect(config.gzip).toBe(false)
  await session.dispose(); await session.dispose(); expect(terminate).toHaveBeenCalledTimes(1)
  await expect(session.recognize(new Blob())).rejects.toThrow('结束')
})
test('missing local resources fail without creating a fallback worker', async () => {
  mocks.createWorker.mockClear(); vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
  await expect(createOcrSession()).rejects.toThrow('本地识别资源')
  expect(mocks.createWorker).not.toHaveBeenCalled()
})
test('unrecognized text never invents set, level or main', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })))
  mocks.createWorker.mockResolvedValue({ recognize: vi.fn(async () => ({ data: { text: '???', confidence: 8 } })), terminate: vi.fn(), setParameters: vi.fn(), reinitialize: vi.fn() })
  const session = await createOcrSession(); const result = await session.recognize(new Blob())
  expect(result.draft.setKey).toBeUndefined(); expect(result.draft.level).toBeUndefined(); expect(result.draft.main).toBeUndefined()
  expect(result.draft.issues.some(i => i.code === 'low-confidence')).toBe(true); await session.dispose()
})

test('clear valid levels and substats complete in one pass without redundant numeric OCR', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })))
  const texts = ['止于荣礼的缎彩\n生之花', '生命值 4,171', '+17', '暴击伤害+6.2%', '攻击力+27', '暴击率+3.5%', '元素精通+63', '影中沉凝的幻灭']
  const images = texts.map(text => new Blob([text]))
  mocks.prepare.mockResolvedValue(images.map((image, index) => ({ id: index === 0 ? 'title' : index === 7 ? 'set' : 'stats', image, numeric: index === 2, rawImage: image, width: 240, height: 60 })))
  const symbols = [{ text: '+', bbox: { x0: 100, y0: 10, x1: 110, y1: 30 } }, { text: '6', bbox: { x0: 112, y0: 10, x1: 125, y1: 30 } }]
  const recognize = vi.fn(async (image: Blob) => ({ data: { text: texts[images.indexOf(image)], confidence: 90, blocks: [{ paragraphs: [{ lines: [{ words: [{ symbols }] }] }] }] } }))
  mocks.createWorker.mockResolvedValue({ recognize, terminate: vi.fn(), setParameters: vi.fn(), reinitialize: vi.fn() })
  const session = await createOcrSession()
  try {
    const result = await session.recognize(new Blob())
    expect(getRecognitionProblems(result.draft)).toEqual([])
    expect(result.draft.level).toBe(17)
    expect(result.draft.main).toEqual({ key: 'hpFlat', value: 4171 })
    expect(recognize).toHaveBeenCalledTimes(8)
  } finally { await session.dispose() }
})

test('ambiguous digits after a percent sign cannot be silently dropped by the fast path', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })))
  const texts = ['止于荣礼的缎彩\n生之花', '生命值 4,171\n+17', '暴击伤害+6.2%', '攻击力+27', '暴击率+3.5%2', '元素精通+63', '影中沉凝的幻灭']
  const images = texts.map(text => new Blob([text]))
  mocks.prepare.mockResolvedValue(images.map((image, index) => ({ id: index === 0 ? 'title' : index === 6 ? 'set' : 'stats', image })))
  const recognize = vi.fn(async (image: Blob) => ({ data: { text: texts[images.indexOf(image)], confidence: 90 } }))
  mocks.createWorker.mockResolvedValue({ recognize, terminate: vi.fn(), setParameters: vi.fn(), reinitialize: vi.fn() })
  const session = await createOcrSession()
  try {
    const result = await session.recognize(new Blob())
    expect(getRecognitionProblems(result.draft).length).toBeGreaterThan(0)
    expect(result.draft.subs).not.toContainEqual({ key: 'critRate', value: 3.5 })
  } finally { await session.dispose() }
})
