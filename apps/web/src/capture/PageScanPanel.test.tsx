import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { PageScanPanel } from './PageScanPanel'
afterEach(cleanup)
test('paused page explains that continuation is for the same page and never offers automatic scrolling', async () => {
  const resume = vi.fn()
  render(<PageScanPanel snapshot={{ pageId: 'page', state: 'paused', reason: '队列已满，请核对', cells: [{ id: 'r0c0', state: 'captured', jobId: 'one' }, { id: 'r0c1', state: 'waiting' }] }} disabled={false} onStart={vi.fn()} onResume={resume} onPause={vi.fn()} onNext={vi.fn()} />)
  expect(screen.getByText(/队列已满/)).toBeVisible()
  expect(screen.getByText(/1 \/ 2/)).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: /确认未翻页，继续/ }))
  expect(resume).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('button', { name: /自动翻页/ })).not.toBeInTheDocument()
})
test('active scan offers an immediate pause while the next-page action requires completion', () => {
  render(<PageScanPanel snapshot={{ pageId: 'page', state: 'scanning', cells: [{ id: 'r0c0', state: 'waiting' }] }} disabled={false} onStart={vi.fn()} onResume={vi.fn()} onPause={vi.fn()} onNext={vi.fn()} />)
  expect(screen.getByRole('button', { name: /暂停自动点击/ })).toBeEnabled()
  expect(screen.queryByRole('button', { name: /下一页继续/ })).not.toBeInTheDocument()
})
