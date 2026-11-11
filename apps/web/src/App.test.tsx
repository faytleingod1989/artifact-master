import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { get, set } from 'idb-keyval'
import App from './App'
import { readStoredAssetMap } from './assetStorage'
import { FIVE_STAR_ARTIFACT_SETS } from './artifacts/catalog'
import { legacyLibrary } from './test/legacyLibrary'
import { parseLibraryBackup } from './storage/libraryValidation'

// jsdom has no module Worker; keep the real potential algorithm while isolating
// the browser transport here. Transport + actual worker have their own tests.
vi.mock('./potential/potentialClient', async () => {
  const { calculatePotential } = await import('./potential/scorePotential')
  return { createPotentialClient: () => ({ evaluate: async (input: Parameters<typeof calculatePotential>[0]) => calculatePotential(input), dispose() {} }) }
})

const ocrBoundary = vi.hoisted(() => ({
  texts: ['司信者的圣冕\n理之冠\n+20', '暴击伤害 62.2%\n元素精通 +40\n防御力 +16\n暴击率 +3.9%\n元素充能效率 +22.7%', '柔灯挽歌'],
  rejectAt: -1,
  terminate: vi.fn(),
}))

vi.mock('./artifacts/ocrService', async () => {
  const { parseArtifactOcr } = await import('./artifacts/artifactOcr')
  const { ocrToDraft } = await import('./imports/manualDraft')
  return { createOcrSession: vi.fn(async () => ({ recognize: vi.fn(async () => {
    const text = { title: ocrBoundary.texts[0], stats: ocrBoundary.rejectAt === 1 ? '' : ocrBoundary.texts[1], set: ocrBoundary.texts[2] }
    return { draft: ocrToDraft(parseArtifactOcr(text), 'screenshot'), rawText: `【名称与部位】\n${text.title}\n\n【属性】\n${text.stats}\n\n【套装】\n${text.set}`, confidence: 90 }
  }), dispose: vi.fn(async () => { ocrBoundary.terminate() }) })) }
})

vi.mock('idb-keyval', () => {
  const read = vi.fn()
  const write = vi.fn()
  return { get: read, set: write,
    getMany: vi.fn((keys: string[]) => Promise.all(keys.map(key => read(key)))),
    setMany: vi.fn((entries: [string, unknown][]) => Promise.all(entries.map(([key, value]) => write(key, value)))),
  }
})

const getStoredValue = vi.mocked(get)
const setStoredValue = vi.mocked(set)

beforeEach(() => {
  localStorage.clear()
  getStoredValue.mockReset()
  getStoredValue.mockImplementation(async (key) => key === 'artifact-master:artifacts' ? structuredClone(legacyLibrary) : key === 'artifact-master:queue' ? [1, 2, 3] : undefined)
  setStoredValue.mockReset()
  setStoredValue.mockResolvedValue(undefined)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.spyOn(window, 'alert').mockImplementation(() => undefined)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  ocrBoundary.rejectAt = -1
  ocrBoundary.terminate.mockClear()
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 3840, height: 2160, close: vi.fn() })))
  URL.createObjectURL = vi.fn(() => 'blob:app-ocr'); URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function goPage(name: string) {
  await userEvent.setup().click(within(screen.getByRole('navigation', { name: '主导航' })).getByRole('button', { name }))
}

test('ten character tabs use their own game portrait instead of three cycling generic faces', async () => {
  render(<App />)
  await screen.findByText('已保存', { exact: true })
  await goPage('角色配装')
  for (const [name, icon] of [
    ['月之少女·哥伦比娅', 'Columbina'], ['木偶·桑多涅', 'MarionetteNew'], ['兹白', 'Zibai'], ['杜林', 'Durin'], ['法尔伽', 'Varka'],
    ['奈芙尔', 'Nefer'], ['雷电将军', 'Shougun'], ['那维莱特', 'Neuvillette'], ['芙宁娜', 'Furina'], ['阿蕾奇诺', 'Arlecchino'],
  ]) expect(screen.getByRole('img', { name: `${name} 的头像` })).toHaveAttribute('src', expect.stringContaining(`UI_AvatarIcon_${icon}.png`))
  await goPage('圣遗物仓库')
  expect(screen.getByRole('button', { name: '手动录入' })).toBeEnabled()
})

test('custom character portrait remains preferred in tabs and the local asset panel', async () => {
  const custom = 'data:image/png;base64,custom-avatar'
  localStorage.setItem('artifact-master-assets-v2', JSON.stringify({ 'character:芙宁娜': custom }))
  render(<App />)
  await screen.findByText('已保存', { exact: true })
  await goPage('角色配装')
  expect(screen.getByRole('img', { name: '芙宁娜 的头像' })).toHaveAttribute('src', custom)
  await goPage('本地素材')
  expect(screen.getByRole('img', { name: '芙宁娜' })).toHaveAttribute('src', custom)
  expect(screen.getByRole('img', { name: '雷电将军' })).toHaveAttribute('src', expect.stringContaining('UI_AvatarIcon_Shougun.png'))
  expect(JSON.parse(localStorage.getItem('artifact-master-assets-v2')!)).toEqual({ 'character:芙宁娜': custom })
})

test('broken game portrait becomes an explicit placeholder, not another character face', async () => {
  render(<App />)
  await screen.findByText('已保存', { exact: true })
  await goPage('角色配装')
  fireEvent.error(screen.getByRole('img', { name: '雷电将军 的头像' }))
  expect(screen.getByRole('img', { name: '雷电将军 的头像' })).not.toHaveAttribute('src')
  expect(screen.getByRole('img', { name: '雷电将军 的头像' })).toHaveAttribute('title', '雷电将军：原版头像未提供或加载失败')
  await goPage('圣遗物仓库')
  expect(screen.getByRole('button', { name: '手动录入' })).toBeEnabled()
})

function latestPersistedArtifacts() {
  const calls = setStoredValue.mock.calls.filter(([key]) => key === 'artifact-master:artifacts')
  return calls.at(-1)?.[1] as Array<{ id: number; setKey?: string }> | undefined
}

function jsonLibraryFile(payload: unknown, name: string) {
  const raw = JSON.stringify(payload)
  const file = new File([raw], name, { type: 'application/json' })
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(raw) })
  return file
}

async function openManual(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => expect(screen.getByRole('button', { name: '手动录入' })).toBeEnabled())
  await user.click(screen.getByRole('button', { name: '手动录入' }))
  return screen.getByRole('dialog', { name: '手动录入圣遗物' })
}
async function fillPlume(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement, setKey = 'zhuying-lieren') {
  await user.selectOptions(within(dialog).getByLabelText('套装'), setKey)
  await user.selectOptions(within(dialog).getByLabelText('部位'), '死之羽')
  await user.type(within(dialog).getByLabelText('等级'), '20')
  await user.click(within(dialog).getByRole('button', { name: /使用成长表/ }))
}
async function screenshotReview(user: ReturnType<typeof userEvent.setup>, expectReview = true) {
  await waitFor(() => expect(screen.getByRole('button', { name: '手动录入' })).toBeEnabled())
  await user.click(screen.getByText('更多录入'))
  await user.click(screen.getByRole('button', { name: '识别截图' }))
  await user.upload(screen.getByLabelText('选择圣遗物截图'), new File(['screenshot'], 'artifact.png', { type: 'image/png' }))
  if (!expectReview) return await screen.findByRole('dialog', { name: '识别圣遗物截图' })
  const review = await screen.findByRole('dialog', { name: '确认入库' })
  const edit = within(review).queryByRole('button', { name: '修改识别信息' })
  if (edit) await user.click(edit)
  return review
}

test('keeps an explicitly saved empty warehouse empty after loading', async () => {
  getStoredValue.mockImplementation(async (key) => key === 'artifact-master:artifacts' ? [] : undefined)
  render(<App />)
  await waitFor(() => expect(screen.getByText(/共 0 件/)).toBeInTheDocument())
  expect(screen.queryByRole('button', { name: '编辑当前圣遗物' })).not.toBeInTheDocument()
})

test('does not overwrite stored records when reading the warehouse fails', async () => {
  getStoredValue.mockRejectedValue(new Error('storage unavailable'))
  render(<App />)
  await screen.findByText(/读取.*失败/)
  expect(setStoredValue).not.toHaveBeenCalled()
})

test('disables entry while loading and ignores a read completed after unmount', async () => {
  let finish!: (value: unknown) => void
  getStoredValue.mockImplementation((key) => key === 'artifact-master:artifacts' ? new Promise(resolve => { finish = resolve }) : Promise.resolve(undefined))
  const view = render(<App />)
  expect(screen.getByRole('button', { name: '手动录入' })).toBeDisabled()
  view.unmount()
  finish(legacyLibrary)
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(setStoredValue).not.toHaveBeenCalled()
})

test('restores an explicitly empty JSON backup without reintroducing demo items', async () => {
  const user = userEvent.setup()
  render(<App />)
  await screen.findByRole('button', { name: '编辑当前圣遗物' })
  const input = screen.getByText('导入 JSON').closest('label')!.querySelector('input')!
  await user.upload(input, jsonLibraryFile({ version: 1, artifacts: [], trash: [] }, 'empty.json'))
  await waitFor(() => expect(latestPersistedArtifacts()).toEqual([]))
  expect(screen.queryByRole('button', { name: '编辑当前圣遗物' })).not.toBeInTheDocument()
})

test('reads the current asset map, otherwise falls back to v1, and rejects malformed JSON', () => {
  localStorage.setItem('artifact-master-assets-v1', JSON.stringify({ 'character:legacy': 'data:image/png;base64,legacy' }))
  localStorage.setItem('artifact-master-assets-v2', JSON.stringify({ 'character:current': 'data:image/png;base64,current' }))
  expect(readStoredAssetMap()).toEqual({ 'character:current': 'data:image/png;base64,current' })

  localStorage.removeItem('artifact-master-assets-v2')
  expect(readStoredAssetMap()).toEqual({ 'character:legacy': 'data:image/png;base64,legacy' })

  localStorage.setItem('artifact-master-assets-v1', '{malformed')
  expect(readStoredAssetMap()).toEqual({})
})

test('removes artifact upload and gives a manually entered set-slot its glyph', async () => {
  const user = userEvent.setup(); render(<App />)
  expect(screen.queryByText('导入此圣遗物图标')).not.toBeInTheDocument()
  const dialog = await openManual(user); await fillPlume(user, dialog)
  expect(within(dialog).queryByLabelText('名称')).not.toBeInTheDocument()
  await user.click(within(dialog).getByRole('button', { name: '保存圣遗物' }))
  expect(latestPersistedArtifacts()).toHaveLength(8)
  await user.click(screen.getByRole('button', { name: '确认并入库' }))
  await waitFor(() => expect(latestPersistedArtifacts()?.at(-1)).toMatchObject({ setKey: 'zhuying-lieren', slot: '死之羽', main: '攻击力 311' }))
  expect((await screen.findAllByRole('img', { name: '逐影猎人·死之羽原版图标' })).length).toBeGreaterThan(0)
})

test('lists a catalog set outside the original four in manual entry', async () => {
  const user = userEvent.setup(); render(<App />)
  const dialog = await openManual(user)
  const set = FIVE_STAR_ARTIFACT_SETS.find(set => !['深廊终曲', '黑曜秘典', '逐影猎人', '昔时之歌'].includes(set.name))!
  expect(within(dialog).getByRole('option', { name: set.name })).toBeInTheDocument()
  await user.type(within(dialog).getByLabelText('套装搜索'), set.name)
  expect(within(dialog).queryByRole('option', { name: '逐影猎人' })).not.toBeInTheDocument()
})

test('uses the catalog set detected by OCR text', async () => {
  const user = userEvent.setup(); render(<App />)
  const review = await screenshotReview(user)
  expect(within(review).getByLabelText('套装')).toHaveValue('silken-moons-serenade')
  await user.click(within(review).getByRole('button', { name: '确认并入库' }))
  await waitFor(() => expect(latestPersistedArtifacts()?.at(-1)).toMatchObject({ setKey: 'silken-moons-serenade' }))
})

test('derives the glyph identity when an edited artifact changes set and slot', async () => {
  const user = userEvent.setup(); render(<App />)
  await user.click(await screen.findByRole('button', { name: '编辑当前圣遗物' }))
  const dialog = screen.getByRole('dialog', { name: '手动录入圣遗物' })
  await user.selectOptions(within(dialog).getByLabelText('套装'), 'zhuying-lieren')
  await user.selectOptions(within(dialog).getByLabelText('部位'), '死之羽')
  await user.click(within(dialog).getByRole('button', { name: /使用成长表/ }))
  await user.click(within(dialog).getByRole('button', { name: '移除副词条4' }))
  await user.click(within(dialog).getByRole('button', { name: '保存圣遗物' }))
  const review = screen.getByRole('dialog', { name: '确认入库' })
  expect(within(review).getByLabelText('处理方式1')).toHaveValue('update')
  expect(within(review).getByLabelText('更新目标1')).toHaveValue('1')
  await user.click(within(review).getByRole('button', { name: '确认并入库' }))
  await waitFor(() => expect(latestPersistedArtifacts()?.find(a => a.id === 1)).toMatchObject({ setKey: 'zhuying-lieren', slot: '死之羽', locked: true }))
  expect(latestPersistedArtifacts()).toHaveLength(8)
})

test('derives the glyph identity for an OCR-confirmed artifact', async () => {
  const user = userEvent.setup(); render(<App />)
  const review = await screenshotReview(user)
  await user.selectOptions(within(review).getByLabelText('套装'), 'heiyao-midian')
  await user.click(within(review).getByRole('button', { name: '确认并入库' }))
  await waitFor(() => expect(latestPersistedArtifacts()?.at(-1)).toMatchObject({ setKey: 'heiyao-midian', slot: '理之冠' }))
  expect((await screen.findAllByRole('img', { name: '黑曜秘典·理之冠原版图标' })).length).toBeGreaterThan(0)
})

test('migrates imported Chinese set names, retains only character assets, and records the migration', async () => {
  const user = userEvent.setup()
  render(<App />)
  await screen.findByRole('button', { name: '编辑当前圣遗物' })
  const importedArtifact = {
    id: 99, name: '导入羽毛', set: '逐影猎人', setKey: 'shenlang-zhongqu', slot: '死之羽', level: 20, score: 1,
    main: '攻击力 311', subs: [], locked: false, hue: 'blue',
  }
  const payload = jsonLibraryFile({
    artifacts: [importedArtifact],
    assets: { 'artifact:99': 'data:image/png;base64,old-artwork', 'character:芙宁娜': 'data:image/png;base64,avatar' },
  }, 'library.json')
  const importInput = screen.getByText('导入 JSON').closest('label')?.querySelector('input')
  expect(importInput).not.toBeNull()
  if (!importInput) throw new Error('Import input was not rendered')

  await user.upload(importInput, payload)

  expect((await screen.findAllByRole('img', { name: '逐影猎人·死之羽原版图标' })).length).toBeGreaterThan(0)
  await waitFor(() => expect(latestPersistedArtifacts()).toEqual([expect.objectContaining({ id: 99, setKey: 'zhuying-lieren' })]))
  expect(JSON.parse(localStorage.getItem('artifact-master-assets-v2') ?? '{}')).toEqual({ 'character:芙宁娜': 'data:image/png;base64,avatar' })
  expect(JSON.parse(localStorage.getItem('artifact-master-artwork-migration-v1') ?? '{}')).toMatchObject({ ignoredArtifactOverrideIds: [99], unresolvedArtifactIds: [] })
})

test('uses the missing glyph for an imported unknown set', async () => {
  const user = userEvent.setup()
  render(<App />)
  await screen.findByRole('button', { name: '编辑当前圣遗物' })
  const payload = jsonLibraryFile({
    artifacts: [{ id: 100, name: '未知套装', set: '未知套装', slot: '理之冠', level: 0, score: 0, main: '暴击率 4.7%', subs: [], locked: false, hue: 'blue' }],
  }, 'unknown-library.json')
  const importInput = screen.getByText('导入 JSON').closest('label')?.querySelector('input')
  expect(importInput).not.toBeNull()
  if (!importInput) throw new Error('Import input was not rendered')

  await user.upload(importInput, payload)

  expect((await screen.findAllByRole('img', { name: '未知套装·理之冠原版图标' })).length).toBeGreaterThan(0)
})

test('uses the same glyph identity in the queue and trash', async () => {
  const user = userEvent.setup()
  render(<App />)
  await screen.findByText('已保存', { exact: true })
  await goPage('强化队列')

  const queue = document.getElementById('upgrade-queue')
  expect(queue).not.toBeNull()
  if (!queue) throw new Error('Upgrade queue was not rendered')
  expect(await within(queue).findByRole('img', { name: '深廊终曲·时之沙原版图标' })).toBeInTheDocument()

  await goPage('圣遗物仓库')
  await user.click(screen.getByTitle('移入回收站'))
  const trashButton = screen.getAllByRole('button', { name: /回收站/ }).find((button) => button.classList.contains('nav-item'))
  expect(trashButton).toBeDefined()
  if (!trashButton) throw new Error('Trash navigation button was not rendered')
  await user.click(trashButton)
  expect(await screen.findByRole('img', { name: '深廊终曲·时之沙原版图标' })).toBeInTheDocument()
})

test('prefills regional OCR fields and persists only after confirmation', async () => {
  const user = userEvent.setup(); render(<App />)
  const review = await screenshotReview(user)
  expect(within(review).getByLabelText('套装')).toHaveValue('silken-moons-serenade')
  expect(within(review).getByLabelText('部位')).toHaveValue('理之冠')
  expect(within(review).getByLabelText('等级')).toHaveValue(20)
  expect(within(review).getByLabelText('主词条类型')).toHaveValue('critDamage')
  expect(within(review).getByLabelText('主词条数值')).toHaveValue(62.2)
  expect(within(review).getByLabelText('副词条1数值')).toHaveValue(40)
  expect(within(review).getByLabelText('副词条3类型')).toHaveValue('critRate')
  expect(within(review).getByLabelText('副词条3数值')).toHaveValue(3.9)
  expect(latestPersistedArtifacts()).toHaveLength(8)
  await user.click(within(review).getByRole('button', { name: '确认并入库' }))
  await waitFor(() => expect(latestPersistedArtifacts()?.at(-1)).toMatchObject({ name: '司信者的圣冕', set: '纺月的夜歌', slot: '理之冠', level: 20, main: '暴击伤害 62.2%', subs: ['元素精通 +40', '防御力 +16', '暴击率 +3.9%', '元素充能效率 +22.7%'] }))
})

test('resolves historical OCR set alias to formal catalog name', async () => {
  const user = userEvent.setup(); render(<App />)
  const review = await screenshotReview(user)
  expect(within(review).getByLabelText('套装')).toHaveValue('silken-moons-serenade')
  await user.click(within(review).getByText('查看 OCR 原文'))
  expect(within(review).getByText(/柔灯挽歌/)).toBeInTheDocument()
})

test('terminates the shared OCR worker after successful regional recognition', async () => {
  const user = userEvent.setup(); render(<App />)
  await screenshotReview(user)
  expect(ocrBoundary.terminate).toHaveBeenCalledTimes(1)
})

test('incomplete OCR cannot open an empty manual form or save; retry recognizes the retained screenshot', async () => {
  ocrBoundary.rejectAt = 1
  const user = userEvent.setup(); render(<App />)
  await screenshotReview(user, false)
  expect(await screen.findByRole('alert')).toHaveTextContent('主词条未识别')
  expect(screen.queryByRole('dialog', { name: '确认入库' })).not.toBeInTheDocument()
  expect(latestPersistedArtifacts()).toHaveLength(8)
  expect(ocrBoundary.terminate).toHaveBeenCalledTimes(1)
  ocrBoundary.rejectAt = -1
  await user.click(screen.getByRole('button', { name: '重新识别当前截图' }))
  const review = await screen.findByRole('dialog', { name: '确认入库' })
  expect(within(review).getByText('暴击伤害 62.2%')).toBeInTheDocument()
  expect(latestPersistedArtifacts()).toHaveLength(8)
})

test('one confirmed import persists once even on double click; cancelling never writes', async () => {
  const user = userEvent.setup(); render(<App />)
  await screen.findByRole('button', { name: '编辑当前圣遗物' })
  await waitFor(() => expect(latestPersistedArtifacts()).toHaveLength(8))
  const dialog = await openManual(user); await fillPlume(user, dialog)
  await user.click(within(dialog).getByRole('button', { name: '保存圣遗物' }))
  setStoredValue.mockClear()
  await user.dblClick(screen.getByRole('button', { name: '确认并入库' }))
  await screen.findByText(/已完成：新增 1 件/)
  expect(setStoredValue.mock.calls.filter(([key]) => key === 'artifact-master:artifacts')).toHaveLength(1)
  await user.click(screen.getByRole('button', { name: '完成' }))
  await openManual(user)
  setStoredValue.mockClear()
  await user.click(screen.getByRole('button', { name: '取消' }))
  expect(setStoredValue).not.toHaveBeenCalled()
})
test('save failure keeps the draft and does not update the inventory before a retry', async () => {
  const user = userEvent.setup(); render(<App />)
  const dialog = await openManual(user); await fillPlume(user, dialog)
  await user.click(within(dialog).getByRole('button', { name: '保存圣遗物' }))
  setStoredValue.mockRejectedValueOnce(new Error('写入失败'))
  await user.click(screen.getByRole('button', { name: '确认并入库' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('写入失败')
  expect(screen.getByText('共 8 件 / 库存 8 件')).toBeInTheDocument()
  expect(screen.getByLabelText('主词条数值')).toHaveValue(311)
  await user.click(screen.getByRole('button', { name: '确认并入库' }))
  await screen.findByText(/已完成：新增 1 件/)
  expect(screen.getByText('共 9 件 / 库存 9 件')).toBeInTheDocument()
})
test('save and continue clears numbers after committing and preserves set-slot only', async () => {
  const user = userEvent.setup(); render(<App />)
  const dialog = await openManual(user); await fillPlume(user, dialog)
  await user.click(within(dialog).getByRole('button', { name: '保存并继续' }))
  await user.click(screen.getByRole('button', { name: '确认并入库' }))
  await screen.findByText(/已完成：新增 1 件/)
  await user.click(screen.getByRole('button', { name: '完成' }))
  const nextDialog = screen.getByRole('dialog', { name: '手动录入圣遗物' })
  expect(within(nextDialog).getByLabelText('套装')).toHaveValue('zhuying-lieren')
  expect(within(nextDialog).getByLabelText('部位')).toHaveValue('死之羽')
  expect(within(nextDialog).getByLabelText('等级')).toHaveValue(null)
  expect(within(nextDialog).getByLabelText('主词条数值')).toHaveValue(null)
  expect(within(nextDialog).queryByLabelText('副词条1数值')).not.toBeInTheDocument()
})

async function readyApp() {
  render(<App />)
  await screen.findByRole('button', { name: '编辑当前圣遗物' })
  await waitFor(() => expect(latestPersistedArtifacts()).toHaveLength(8))
  await screen.findByText('已保存', { exact: true })
  return screen.getByText('导入 JSON').closest('label')!.querySelector('input')!
}

test.each([
  ['fractional ID', { ...legacyLibrary[0], id: 42.5 }, [], /库存第 1 件.*编号/],
  ['non-string substat', { ...legacyLibrary[0], subs: [null] }, [], /库存第 1 件.*副词条/],
  ['duplicate ID in trash', legacyLibrary[0], [legacyLibrary[0]], /回收站第 1 件.*1/],
  ['malformed trash record', legacyLibrary[0], [{ ...legacyLibrary[1], subs: [false] }], /回收站第 1 件.*副词条/],
])('rejects backup with %s and leaves the current warehouse untouched', async (_, record, importedTrash, error) => {
  const input = await readyApp()
  setStoredValue.mockClear()
  await userEvent.setup().upload(input, jsonLibraryFile({ artifacts: [record], trash: importedTrash }, 'invalid.json'))
  await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringMatching(error)))
  expect(screen.getByText('共 8 件 / 库存 8 件')).toBeInTheDocument()
  expect(setStoredValue).not.toHaveBeenCalled()
})

test('failed backup transaction keeps warehouse, queue and portraits unchanged', async () => {
  localStorage.setItem('artifact-master-assets-v2', JSON.stringify({ 'character:芙宁娜': 'data:image/png;base64,current' }))
  const input = await readyApp()
  setStoredValue.mockRejectedValueOnce(new Error('transaction failed'))
  await userEvent.setup().upload(input, jsonLibraryFile({ version: 2, artifacts: [legacyLibrary[7]], trash: [], queueIds: [8], assets: { 'character:芙宁娜': 'data:image/png;base64,backup' } }, 'restore.json'))
  await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringMatching(/保存失败/)))
  expect(screen.getByText('共 8 件 / 库存 8 件')).toBeInTheDocument()
  await goPage('强化队列')
  expect(within(document.getElementById('upgrade-queue')!).getByText('3/5')).toBeInTheDocument()
  await goPage('角色配装')
  expect(screen.getByRole('img', { name: '芙宁娜 的头像' })).toHaveAttribute('src', 'data:image/png;base64,current')
})

test('retry saves the current unsaved edit without reloading old records and clears its error', async () => {
  await readyApp()
  const reads = getStoredValue.mock.calls.length
  setStoredValue.mockRejectedValueOnce(new Error('temporarily unavailable'))
  await userEvent.setup().click(screen.getByRole('button', { name: '解锁' }))
  const retry = await screen.findByRole('button', { name: '重试保存当前修改' })
  expect(screen.getByRole('button', { name: '锁定' })).toBeInTheDocument()
  await userEvent.setup().click(retry)
  await waitFor(() => expect(screen.queryByText(/本地保存失败/)).not.toBeInTheDocument())
  expect(getStoredValue.mock.calls).toHaveLength(reads)
  expect(latestPersistedArtifacts()?.find(item => item.id === 1)).toMatchObject({ locked: false })
})

test('old backup clears an unrelated queue even when its IDs are reused', async () => {
  const input = await readyApp()
  await userEvent.setup().upload(input, jsonLibraryFile({ version: 1, artifacts: [{ ...legacyLibrary[0], name: '另一件藏品' }] }, 'old.json'))
  await waitFor(() => expect(screen.getByText('共 1 件 / 库存 1 件')).toBeInTheDocument())
  await goPage('强化队列')
  expect(within(document.getElementById('upgrade-queue')!).getByText('0/5')).toBeInTheDocument()
  expect(setStoredValue.mock.calls.filter(([key]) => key === 'artifact-master:queue').at(-1)?.[1]).toEqual([])
})

test('versioned backup restores its queue including existing level-20 items and prefers backup portraits', async () => {
  localStorage.setItem('artifact-master-assets-v2', JSON.stringify({ 'character:芙宁娜': 'data:image/png;base64,current' }))
  const input = await readyApp()
  await userEvent.setup().upload(input, jsonLibraryFile({ version: 2, artifacts: [legacyLibrary[0], legacyLibrary[7]], trash: [], queueIds: [8, 1], assets: { 'character:芙宁娜': 'data:image/png;base64,backup' } }, 'new.json'))
  await waitFor(() => expect(screen.getByText('共 2 件 / 库存 2 件')).toBeInTheDocument())
  await goPage('强化队列')
  expect(within(document.getElementById('upgrade-queue')!).getByText('2/5')).toBeInTheDocument()
  expect(setStoredValue.mock.calls.filter(([key]) => key === 'artifact-master:queue').at(-1)?.[1]).toEqual([8, 1])
  await goPage('角色配装')
  expect(screen.getByRole('img', { name: '芙宁娜 的头像' })).toHaveAttribute('src', 'data:image/png;base64,backup')
})

test.each([{ queue: [99] }, { queue: [1, 1] }, { queue: [1, 2, 3, 4, 5, 6] }, { queue: [1.5] }, { queue: null }])('rejects malformed backup queue $queue without replacing records', async ({ queue }) => {
  const input = await readyApp()
  setStoredValue.mockClear()
  await userEvent.setup().upload(input, jsonLibraryFile({ version: 2, artifacts: legacyLibrary, queueIds: queue }, 'queue.json'))
  await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringMatching(/队列/)))
  expect(screen.getByText('共 8 件 / 库存 8 件')).toBeInTheDocument()
  expect(setStoredValue).not.toHaveBeenCalled()
})

test('shows all five queued records and removes or clears only queue membership', async () => {
  getStoredValue.mockImplementation(async key => key === 'artifact-master:artifacts' ? structuredClone(legacyLibrary) : key === 'artifact-master:queue' ? [1, 2, 3, 4, 5] : undefined)
  await readyApp()
  const user = userEvent.setup()
  await goPage('强化队列')
  const queue = within(document.getElementById('upgrade-queue')!)
  expect(queue.getByText('誓约之杯')).toBeInTheDocument()
  expect(queue.getByText('静谧冠冕')).toBeInTheDocument()
  await user.click(queue.getByRole('button', { name: '移出队列：誓约之杯' }))
  expect(queue.getByText('4/5')).toBeInTheDocument()
  await user.click(queue.getByRole('button', { name: '清空队列' }))
  expect(queue.getByText('0/5')).toBeInTheDocument()
  await goPage('圣遗物仓库')
  expect(screen.getByText('共 8 件 / 库存 8 件')).toBeInTheDocument()
})

test('rejects explicitly null trash rather than silently restoring an empty trash', async () => {
  const input = await readyApp()
  setStoredValue.mockClear()
  await userEvent.setup().upload(input, jsonLibraryFile({ version: 2, artifacts: [], trash: null, queueIds: [] }, 'null-trash.json'))
  await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringMatching(/回收站必须是数组/)))
  expect(screen.getByText('共 8 件 / 库存 8 件')).toBeInTheDocument()
  expect(setStoredValue).not.toHaveBeenCalled()
})

test('a reverted edit is saved after its intermediate write finishes', async () => {
  await readyApp()
  setStoredValue.mockClear()
  let finish!: () => void
  setStoredValue.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '解锁' }))
  await waitFor(() => expect(setStoredValue.mock.calls.filter(([key]) => key === 'artifact-master:artifacts')).toHaveLength(1))
  await user.click(screen.getByRole('button', { name: '锁定' }))
  await act(async () => { finish() })
  await screen.findByText('已保存', { exact: true })
  expect(latestPersistedArtifacts()?.find(item => item.id === 1)).toMatchObject({ locked: true })
  expect(setStoredValue.mock.calls.filter(([key]) => key === 'artifact-master:artifacts')).toHaveLength(2)
})

test('a delayed failure from an older snapshot does not mark the latest successful edit as failed', async () => {
  await readyApp()
  let fail!: (error: Error) => void
  setStoredValue.mockImplementationOnce(() => new Promise<void>((_, reject) => { fail = reject }))
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '解锁' }))
  await waitFor(() => expect(fail).toBeDefined())
  await user.click(screen.getByRole('button', { name: '锁定' }))
  await act(async () => { fail(new Error('old write failed')) })
  await screen.findByText('已保存', { exact: true })
  expect(screen.queryByText(/本地保存失败/)).not.toBeInTheDocument()
  expect(latestPersistedArtifacts()?.find(item => item.id === 1)).toMatchObject({ locked: true })
})

test('an avatar read started before restore cannot replace the restored portrait afterwards', async () => {
  await readyApp()
  const readers: FileReader[] = []
  vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (this: FileReader) { readers.push(this) })
  const user = userEvent.setup()
  await goPage('本地素材')
  const avatarInput = screen.getByRole('img', { name: '芙宁娜' }).closest('label')!.querySelector('input')!
  await user.upload(avatarInput, new File(['old-avatar'], 'old.png', { type: 'image/png' }))
  await goPage('圣遗物仓库')
  const input = screen.getByText('导入 JSON').closest('label')!.querySelector('input')!
  await user.upload(input, jsonLibraryFile({ version: 2, artifacts: [legacyLibrary[0]], queueIds: [], assets: { 'character:芙宁娜': 'data:image/png;base64,backup' } }, 'restore-avatar.json'))
  await waitFor(() => expect(screen.getByText('共 1 件 / 库存 1 件')).toBeInTheDocument())
  Object.defineProperty(readers[0], 'result', { value: 'data:image/png;base64,old-reader' })
  await act(async () => { readers[0].dispatchEvent(new Event('load')) })
  await goPage('角色配装')
  expect(screen.getByRole('img', { name: '芙宁娜 的头像' })).toHaveAttribute('src', 'data:image/png;base64,backup')
})

test('newly imported avatar is saved to the canonical warehouse and survives reopening', async () => {
  await readyApp()
  const user = userEvent.setup()
  await goPage('本地素材')
  const avatarInput = screen.getByRole('img', { name: '芙宁娜' }).closest('label')!.querySelector('input')!
  await user.upload(avatarInput, new File(['new-avatar'], 'new.png', { type: 'image/png' }))
  await waitFor(() => expect(setStoredValue.mock.calls.filter(([key]) => key === 'artifact-master:assets').at(-1)?.[1]).toEqual({ 'character:芙宁娜': 'data:image/png;base64,bmV3LWF2YXRhcg==' }))
  await screen.findByText('已保存', { exact: true })
  const savedAssets = setStoredValue.mock.calls.filter(([key]) => key === 'artifact-master:assets').at(-1)![1]
  cleanup()
  localStorage.setItem('artifact-master-assets-v2', JSON.stringify({ 'character:芙宁娜': 'data:image/png;base64,stale-cache' }))
  getStoredValue.mockImplementation(async key => key === 'artifact-master:artifacts' ? structuredClone(legacyLibrary) : key === 'artifact-master:assets' ? savedAssets : undefined)
  render(<App />)
  await screen.findByText('已保存', { exact: true })
  await goPage('角色配装')
  expect(screen.getByRole('img', { name: '芙宁娜 的头像' })).toHaveAttribute('src', 'data:image/png;base64,bmV3LWF2YXRhcg==')
})

test('restore waits for atomic persistence and blocks warehouse changes while committing', async () => {
  const input = await readyApp()
  let finish!: () => void
  setStoredValue.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
  const user = userEvent.setup()
  await user.upload(input, jsonLibraryFile({ version: 2, artifacts: [legacyLibrary[7]], queueIds: [8] }, 'atomic.json'))
  await waitFor(() => expect(finish).toBeDefined())
  expect(screen.getByText('共 8 件 / 库存 8 件')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '解锁' })).toBeDisabled()
  await goPage('强化队列')
  expect(screen.getByRole('button', { name: '清空队列' })).toBeDisabled()
  await act(async () => { finish() })
  await screen.findByText('已保存', { exact: true })
  expect(within(document.getElementById('upgrade-queue')!).getByText('1/5')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '清空队列' })).toBeEnabled()
  await goPage('圣遗物仓库')
  expect(screen.getByText('共 1 件 / 库存 1 件')).toBeInTheDocument()
})

test('a compatibility cache failure after restore does not claim the committed warehouse was unchanged', async () => {
  const input = await readyApp()
  const realSetItem = Storage.prototype.setItem
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key === 'artifact-master-assets-v2') throw new Error('quota exceeded')
    realSetItem.call(this, key, value)
  })
  await userEvent.setup().upload(input, jsonLibraryFile({ version: 2, artifacts: [legacyLibrary[0]], queueIds: [], assets: { 'character:芙宁娜': 'data:image/png;base64,backup' } }, 'cache-fails.json'))
  await screen.findByText('已保存', { exact: true })
  expect(screen.getByText('共 1 件 / 库存 1 件')).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('头像兼容缓存写入失败')
  expect(window.alert).not.toHaveBeenCalled()
  expect(setStoredValue.mock.calls.filter(([key]) => key === 'artifact-master:assets').at(-1)?.[1]).toEqual({ 'character:芙宁娜': 'data:image/png;base64,backup' })
})

test('blocked compatibility cache reads cannot prevent a canonical warehouse from loading', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('cache unavailable') })
  render(<App />)
  await screen.findByText('已保存', { exact: true })
  expect(screen.getByText('共 8 件 / 库存 8 件')).toBeInTheDocument()
  expect(screen.queryByText(/读取本地仓库失败/)).not.toBeInTheDocument()
})

test('export makes a restorable queue from stale legacy references without changing the local queue', async () => {
  const legacyQueue = [1, 999, 1, 2, 3, 4, 5, 6]
  getStoredValue.mockImplementation(async key => key === 'artifact-master:artifacts' ? structuredClone(legacyLibrary) : key === 'artifact-master:queue' ? legacyQueue : undefined)
  await readyApp()
  const backups: Blob[] = []
  vi.mocked(URL.createObjectURL).mockImplementation(blob => { backups.push(blob as Blob); return 'blob:backup' })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
  const user = userEvent.setup()
  await user.click(screen.getByText('仓库备份'))
  await user.click(screen.getByRole('button', { name: '导出 JSON' }))
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result)); reader.onerror = reject
    reader.readAsText(backups[0])
  })
  expect(JSON.parse(raw)).toMatchObject({ version: 2, queueIds: [1, 2, 3, 4, 5] })
  expect(parseLibraryBackup(raw).queueIds).toEqual([1, 2, 3, 4, 5])
  expect(setStoredValue.mock.calls.filter(([key]) => key === 'artifact-master:queue').at(-1)?.[1]).toEqual(legacyQueue)
  expect(screen.getByText(/导出.*忽略.*库存.*队列未改变/)).toBeInTheDocument()
})

