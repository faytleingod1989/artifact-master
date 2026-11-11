import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { ManualEntry } from './ManualEntry'
import { createManualDraft } from './manualDraft'
afterEach(cleanup)
test('flower and plume only allow their fixed main; valid zero-level three subs can be reviewed', async () => {
  const user = userEvent.setup()
  const onReview = vi.fn()
  render(<ManualEntry initial={createManualDraft('zhuying-lieren', '生之花')} onReview={onReview} onCancel={vi.fn()} />)
  expect(within(screen.getByLabelText('主词条类型')).getAllByRole('option').map(option => option.getAttribute('value'))).toEqual(['hpFlat'])
  await user.selectOptions(screen.getByLabelText('部位'), '死之羽')
  expect(within(screen.getByLabelText('主词条类型')).getAllByRole('option').map(option => option.getAttribute('value'))).toEqual(['atkFlat'])
  await user.type(screen.getByLabelText('等级'), '0')
  await user.click(screen.getByRole('button', { name: /使用成长表/ }))
  for (const [i, key, value] of [[1, 'critRate', '3.9'], [2, 'critDamage', '7.8'], [3, 'energyRecharge', '5.2']] as const) {
    await user.click(screen.getByRole('button', { name: '增加副词条' }))
    await user.selectOptions(screen.getByLabelText(`副词条${i}类型`), key)
    await user.type(screen.getByLabelText(`副词条${i}数值`), value)
  }
  await user.click(screen.getByRole('button', { name: '保存并继续' }))
  expect(onReview).toHaveBeenCalledWith(expect.objectContaining({ slot: '死之羽', level: 0, main: { key: 'atkFlat', value: 47 }, subs: expect.any(Array) }), true)
})
test('invalid numeric values cannot reach review and cancel emits no review', async () => {
  const user = userEvent.setup()
  const onReview = vi.fn(); const onCancel = vi.fn()
  render(<ManualEntry onReview={onReview} onCancel={onCancel} />)
  expect(screen.getByRole('button', { name: '保存圣遗物' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: '取消' }))
  expect(onCancel).toHaveBeenCalledOnce()
  expect(onReview).not.toHaveBeenCalled()
})
test('an unparsed legacy substat stays visible when a new row is added until explicitly acknowledged', async () => {
  const user = userEvent.setup()
  render(<ManualEntry initial={{ ...createManualDraft('zhuying-lieren', '生之花'), issues: [{ field: 'subs.0', code: 'unparsed', message: '旧副词条待修正：旧神秘词条', severity: 'error' }] }} onReview={vi.fn()} onCancel={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: '增加副词条' }))
  expect(screen.getAllByText(/旧神秘词条/).length).toBeGreaterThan(0)
  await user.click(screen.getByRole('button', { name: '已核实，按当前字段保存' }))
  expect(screen.queryByText(/旧神秘词条/)).not.toBeInTheDocument()
})
