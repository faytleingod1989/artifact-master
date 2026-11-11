import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import fixture from './enka/fixtures/showcase.json'
import { UidShowcaseImport } from './UidShowcaseImport'
import type { EnkaQueryResult } from './enka/types'
const query = vi.fn<(uid: string) => Promise<EnkaQueryResult>>()
beforeEach(() => { localStorage.clear(); query.mockReset(); query.mockResolvedValue({ ok: true, payload: fixture, fetchedAt: Date.now(), refreshAt: Date.now() + 60000, cached: false }); window.artifactDesktop = { queryShowcase: query, listCaptureSources: vi.fn(async () => []), setRealtimeShortcut: vi.fn(async () => true), onRealtimeCapture: vi.fn(() => () => {}) } })
afterEach(() => { cleanup(); delete window.artifactDesktop })
test('typing does not query; disclosure precedes query, valid subset proceeds, default does not remember', async () => {
  const user = userEvent.setup(); const onConfirm = vi.fn(async () => {})
  render(<UidShowcaseImport existing={[]} onConfirm={onConfirm} onClose={vi.fn()} />)
  expect(screen.getByText(/第三方 Enka/)).toHaveTextContent('不是整个背包')
  await user.type(screen.getByLabelText('公开展柜 UID'), '123456789')
  expect(query).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '查询公开展柜' }))
  expect(await screen.findByText(/5 件五星/)).toBeInTheDocument()
  expect(screen.getByText(/名称、套装或部位无法/)).toBeInTheDocument()
  expect(localStorage.getItem('artifact-master:remembered-uid-v1')).toBeNull()
  await user.click(screen.getByRole('button', { name: '核对所选圣遗物' }))
  const review = screen.getByRole('dialog', { name: '确认入库' })
  await user.click(within(review).getByRole('button', { name: '确认并入库' }))
  expect(onConfirm).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ action: 'add' })]))
})
test('remembering is opt-in and can be removed; cancelling does not import', async () => {
  const user = userEvent.setup(); const onConfirm = vi.fn(); const onClose = vi.fn()
  render(<UidShowcaseImport existing={[]} onConfirm={onConfirm} onClose={onClose} />)
  await user.type(screen.getByLabelText('公开展柜 UID'), '123456789')
  await user.click(screen.getByLabelText('仅在此设备记住 UID'))
  expect(localStorage.getItem('artifact-master:remembered-uid-v1')).toBe('123456789')
  await user.click(screen.getByLabelText('仅在此设备记住 UID'))
  expect(localStorage.getItem('artifact-master:remembered-uid-v1')).toBeNull()
  await user.click(screen.getByRole('button', { name: '关闭 UID 导入' }))
  expect(onClose).toHaveBeenCalledOnce(); expect(onConfirm).not.toHaveBeenCalled()
})
test('a response from an older input cannot appear in the current query', async () => {
  let finish!: (result: EnkaQueryResult) => void
  query.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const user = userEvent.setup(); render(<UidShowcaseImport existing={[]} onConfirm={vi.fn()} onClose={vi.fn()} />)
  await user.type(screen.getByLabelText('公开展柜 UID'), '123456789')
  await user.click(screen.getByRole('button', { name: '查询公开展柜' }))
  await user.clear(screen.getByLabelText('公开展柜 UID'))
  finish({ ok: true, payload: fixture, fetchedAt: 1, refreshAt: 2, cached: false })
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(screen.queryByText(/5 件五星/)).not.toBeInTheDocument()
})
test('empty showcase, retry countdown, offline and unsupported browser are explicit', async () => {
  const user = userEvent.setup()
  query.mockResolvedValue({ ok: true, payload: {}, fetchedAt: Date.now(), refreshAt: Date.now() + 60000, cached: true })
  const view = render(<UidShowcaseImport existing={[]} onConfirm={vi.fn()} onClose={vi.fn()} />)
  await user.type(screen.getByLabelText('公开展柜 UID'), '123456789')
  await user.click(screen.getByRole('button', { name: '查询公开展柜' }))
  expect(await screen.findByText(/未开放或没有公开角色/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '查询公开展柜' })).toBeDisabled()
  expect(screen.getByText(/缓存结果/)).toBeInTheDocument()
  view.unmount(); delete window.artifactDesktop
  render(<UidShowcaseImport existing={[]} onConfirm={vi.fn()} onClose={vi.fn()} />)
  expect(screen.getByText(/Windows 桌面程序/)).toBeInTheDocument()
})
test.each(['invalid-uid', 'not-found', 'maintenance', 'rate-limited', 'unavailable', 'offline', 'timeout', 'invalid-response', 'unauthorized'] as const)('error %s never calls the library writer', async code => {
  query.mockResolvedValue({ ok: false, code, ...(code === 'rate-limited' ? { retryAt: Date.now() + 60000 } : {}) })
  const user = userEvent.setup(); const onConfirm = vi.fn()
  render(<UidShowcaseImport existing={[]} onConfirm={onConfirm} onClose={vi.fn()} />)
  await user.type(screen.getByLabelText('公开展柜 UID'), '123456789')
  await user.click(screen.getByRole('button', { name: '查询公开展柜' }))
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(onConfirm).not.toHaveBeenCalled()
  if (code === 'rate-limited') expect(screen.getByRole('button', { name: '查询公开展柜' })).toBeDisabled()
})

test('confirmation pauses countdown and returning refreshes the elapsed cooldown without a request', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
  try {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    query.mockResolvedValue({ ok: true, payload: fixture, fetchedAt: Date.now(), refreshAt: Date.now() + 60000, cached: false })
    render(<UidShowcaseImport existing={[]} onConfirm={vi.fn()} onClose={vi.fn()} />)
    await user.type(screen.getByLabelText('公开展柜 UID'), '123456789')
    await user.click(screen.getByRole('button', { name: '查询公开展柜' }))
    expect(vi.getTimerCount()).toBe(1)
    await user.click(screen.getByRole('button', { name: '核对所选圣遗物' }))
    expect(screen.getByRole('dialog', { name: '确认入库' })).toBeInTheDocument()
    expect(vi.getTimerCount()).toBe(0)
    await act(() => vi.advanceTimersByTime(61000))
    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.getByRole('button', { name: '查询公开展柜' })).toBeEnabled()
    expect(query).toHaveBeenCalledTimes(1)
  } finally { cleanup(); vi.useRealTimers() }
})
