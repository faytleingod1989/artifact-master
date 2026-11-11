import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { ImportReview } from './ImportReview'
import { draftToRecord, type ArtifactDraft } from '../artifacts/artifactDraft'
const draft: ArtifactDraft = { draftId: 'a', rarity: 5, setKey: 'zhuying-lieren', slot: '生之花', level: 0, main: { key: 'hpFlat', value: 717 }, subs: [], source: 'manual', issues: [] }
afterEach(cleanup)

test('recognized dormant substat stays labelled and editable without becoming active on confirmation', async () => {
  const user = userEvent.setup(), onConfirm = vi.fn(async () => {})
  const recognized = { ...draft, source: 'realtime' as const, subs: [{ key: 'critRate' as const, value: 3.1 }, { key: 'atkFlat' as const, value: 19 }, { key: 'critDamage' as const, value: 5.4 }], pendingSubs: [{ key: 'hpPercent' as const, value: 4.1 }] }
  render(<ImportReview items={[{ draft: recognized }]} existing={[]} onConfirm={onConfirm} onCancel={vi.fn()} />)
  expect(screen.getByText(/生命值 4.1%.*待激活/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '修改识别信息' }))
  const input = screen.getByLabelText('待激活副词条1数值')
  expect(input).toHaveValue(4.1)
  await user.clear(input); await user.type(input, '4.7')
  await user.click(screen.getByRole('button', { name: '确认并入库' }))
  expect(onConfirm).toHaveBeenCalledWith([expect.objectContaining({ draft: expect.objectContaining({ pendingSubs: [{ key: 'hpPercent', value: 4.7 }], subs: recognized.subs }) })])
})
test('a complete recognized draft opens as a populated summary, editable only on request', async () => {
  const recognized: ArtifactDraft = { ...draft, source: 'realtime', subs: [{ key: 'atkFlat', value: 14 }, { key: 'defFlat', value: 16 }, { key: 'elementalMastery', value: 23 }] }
  const user = userEvent.setup()
  render(<ImportReview items={[{ draft: recognized }]} existing={[]} onConfirm={vi.fn()} onCancel={vi.fn()} />)
  expect(screen.getByText('生命值 717')).toBeInTheDocument()
  expect(screen.queryByLabelText('主词条数值')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '修改识别信息' }))
  expect(screen.getByLabelText('主词条数值')).toHaveValue(717)
})
test('duplicates default to skip; explicit adding same stats creates a separate item', async () => {
  const user = userEvent.setup(); const onConfirm = vi.fn(async () => {})
  render(<ImportReview items={[{ draft }]} existing={[draftToRecord(draft, 1)]} onConfirm={onConfirm} onCancel={vi.fn()} />)
  expect(screen.getByLabelText('处理方式1')).toHaveValue('skip')
  await user.selectOptions(screen.getByLabelText('处理方式1'), 'add')
  await user.click(screen.getByRole('button', { name: '确认并入库' }))
  expect(onConfirm).toHaveBeenCalledWith([expect.objectContaining({ action: 'add' })])
})
test('double confirmation makes one async call; failure retains preview and draft', async () => {
  const user = userEvent.setup(); let fail!: (error: Error) => void
  const onConfirm = vi.fn(() => new Promise<void>((_, reject) => { fail = reject }))
  render(<ImportReview items={[{ draft, previewUrl: 'data:image/png;base64,a' }]} existing={[]} onConfirm={onConfirm} onCancel={vi.fn()} />)
  await user.dblClick(screen.getByRole('button', { name: '确认并入库' }))
  expect(onConfirm).toHaveBeenCalledTimes(1)
  fail(new Error('保存失败'))
  expect(await screen.findByRole('alert')).toHaveTextContent('保存失败')
  expect(screen.getByRole('img', { name: '来源截图预览1' })).toBeInTheDocument()
})
test('update requires an explicit target, errors block add but can be skipped', async () => {
  const user = userEvent.setup()
  render(<ImportReview items={[{ draft }]} existing={[draftToRecord(draft, 1)]} onConfirm={vi.fn()} onCancel={vi.fn()} />)
  await user.selectOptions(screen.getByLabelText('处理方式1'), 'update')
  expect(screen.getByRole('button', { name: '确认并入库' })).toBeDisabled()
  await user.selectOptions(screen.getByLabelText('更新目标1'), '1')
  expect(screen.getByRole('button', { name: '确认并入库' })).toBeEnabled()
})

test('editing a draft reuses the unchanged inventory duplicate index', async () => {
  const user = userEvent.setup()
  let parsedMainReads = 0
  const original = draftToRecord(draft, 7)
  const existing = [{ ...original, get main() { parsedMainReads++; return original.main } }]
  render(<ImportReview items={[{ draft }, { draft: { ...draft, draftId: 'b' } }]} existing={existing} onConfirm={vi.fn()} onCancel={vi.fn()} />)
  expect(screen.getAllByText(/疑似重复：本地记录 7/)).toHaveLength(2)
  parsedMainReads = 0
  await user.selectOptions(screen.getByLabelText('处理方式1'), 'add')
  expect(parsedMainReads).toBe(0)
  expect(screen.getByLabelText('处理方式2')).toHaveValue('skip')
})

