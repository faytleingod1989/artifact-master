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
test('completed auto-commit scan shows streaming summary card with review and rollback buttons', async () => {
  const user = userEvent.setup()
  const onReview = vi.fn(), onRollback = vi.fn(), onToggleCommit = vi.fn()
  render(<PageScanPanel
    snapshot={{ pageId: 'page', state: 'page-complete', cells: [{ id: 'r0c0', state: 'captured' }] }}
    disabled={false}
    autoScroll={true} onAutoScrollChange={vi.fn()}
    autoCommit={true} onAutoCommitChange={onToggleCommit}
    stopOnZeroLevel={false} onStopOnZeroLevelChange={vi.fn()}
    totalCaptured={12} autoCommittedCount={10} pendingReviewCount={2}
    onReviewPending={onReview} onRollbackBatch={onRollback}
    onStart={vi.fn()} onResume={vi.fn()} onPause={vi.fn()} onNext={vi.fn()}
  />)
  expect(screen.getByText(/本次全自动扫描完成：共采集 12 件，已自动入库 10 件，另有 2 件需要你核对/)).toBeVisible()
  await user.click(screen.getByRole('button', { name: /查看并处理 2 件待核对/ }))
  expect(onReview).toHaveBeenCalledTimes(1)
  await user.click(screen.getByRole('button', { name: /撤销本次自动入库的 10 件/ }))
  expect(onRollback).toHaveBeenCalledTimes(1)
  await user.click(screen.getByRole('checkbox', { name: /校验通过自动入库/ }))
  expect(onToggleCommit).toHaveBeenCalledWith(false)
})
