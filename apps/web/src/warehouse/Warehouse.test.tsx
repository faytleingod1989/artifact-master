import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { Warehouse, type WarehouseProps } from './Warehouse'
import type { ArtifactRecord } from '../artifacts/types'

const records: ArtifactRecord[] = [
  { id: 1, name: '甲', set: '逐影猎人', setKey: 'zhuying-lieren', slot: '理之冠', level: 20, main: '暴击伤害 62.2%', subs: ['暴击率 +3.9%'], locked: true, hue: 'blue', score: 0 },
  { id: 2, name: '乙', set: '黑曜秘典', setKey: 'heiyao-midian', slot: '生之花', level: 0, main: '生命值 717', subs: ['攻击力 +16'], locked: false, hue: 'blue', score: 0 },
]
const props = (): WarehouseProps => ({ records, scope: 'all', onScopeChange: vi.fn(), onEdit: vi.fn(), onCopy: vi.fn(), onToggleLock: vi.fn(), onBulkTrash: vi.fn(), onQueue: vi.fn() })
beforeEach(() => localStorage.clear())
afterEach(cleanup)
test('view changes retain filters sorting selection and detail; preference survives remount', async () => {
  const user = userEvent.setup()
  const view = render(<Warehouse {...props()} />)
  await user.type(screen.getByLabelText('搜索圣遗物'), '甲')
  await user.selectOptions(screen.getByLabelText('排序方式'), 'cv')
  await user.click(screen.getByLabelText('选择甲'))
  await user.click(screen.getByRole('button', { name: '列表视图' }))
  expect(screen.getByLabelText('搜索圣遗物')).toHaveValue('甲')
  expect(screen.getByLabelText('排序方式')).toHaveValue('cv')
  expect(screen.getByLabelText('选择甲')).toBeChecked()
  expect(screen.getByTestId('warehouse-list')).toBeInTheDocument()
  expect(within(screen.getByLabelText('圣遗物详情')).getByText('甲')).toBeInTheDocument()
  expect(screen.getByText('已选 1 件')).toBeInTheDocument()
  view.unmount()
  render(<Warehouse {...props()} />)
  expect(screen.getByTestId('warehouse-list')).toBeInTheDocument()
})
test('empty filters do not display old details and hidden selections are explicit', async () => {
  const user = userEvent.setup()
  render(<Warehouse {...props()} />)
  await user.click(screen.getByLabelText('选择甲'))
  await user.type(screen.getByLabelText('搜索圣遗物'), '不存在')
  expect(screen.queryByLabelText('圣遗物详情')).not.toBeInTheDocument()
  expect(screen.getByText('其中 1 件被筛选隐藏')).toBeInTheDocument()
  expect(screen.getByText('没有符合条件的圣遗物')).toBeInTheDocument()
})
test('batch trash confirms the total, excludes locked items, and disables batch actions when selection is hidden', async () => {
  const user = userEvent.setup()
  const p = props()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  render(<Warehouse {...p} />)
  expect(within(screen.getByLabelText('圣遗物详情')).getByRole('button', { name: '回收' })).toBeDisabled()
  await user.click(screen.getByLabelText('选择甲'))
  expect(screen.getByRole('button', { name: '批量移入回收站' })).toBeDisabled()
  await user.click(screen.getByLabelText('选择乙'))
  await user.click(screen.getByRole('button', { name: '对比所选' }))
  expect(screen.getByText(/部位不同/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '批量移入回收站' }))
  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('1 件'))
  expect(p.onBulkTrash).toHaveBeenCalledWith([2])
  await user.type(screen.getByLabelText('搜索圣遗物'), '不存在')
  expect(screen.getByText('其中 1 件被筛选隐藏')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '对比所选' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '加入队列' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '批量移入回收站' })).toBeDisabled()
  vi.restoreAllMocks()
})
test('empty database has no fake details or four-star option', () => {
  render(<Warehouse {...props()} records={[]} />)
  expect(screen.queryByLabelText('圣遗物详情')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '4星' })).not.toBeInTheDocument()
  expect(screen.getByText(/共 0 件/)).toBeInTheDocument()
})
