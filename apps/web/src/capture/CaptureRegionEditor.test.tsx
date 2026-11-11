import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { CaptureRegionEditor } from './CaptureRegionEditor'
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
test('explicit native-pixel region is required and preview URL is released on closing', async () => {
  const createObjectURL = vi.fn(() => 'blob:frame'); const revokeObjectURL = vi.fn()
  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
  const user = userEvent.setup(); const onConfirm = vi.fn()
  const view = render(<CaptureRegionEditor frame={new Blob(['frame'])} width={3840} height={2160} onConfirm={onConfirm} onCancel={vi.fn()} />)
  expect(screen.getByText(/3840 × 2160/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '确认详情区域' })).toBeDisabled()
  for (const [label, value] of [['区域X', '3000'], ['区域Y', '100'], ['区域宽度', '800'], ['区域高度', '1000']]) await user.type(screen.getByLabelText(label), value)
  await user.click(screen.getByRole('button', { name: '确认详情区域' }))
  expect(onConfirm).toHaveBeenCalledWith({ x: 3000, y: 100, width: 800, height: 1000 })
  view.unmount(); expect(revokeObjectURL).toHaveBeenCalledWith('blob:frame')
})
