import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { ScreenshotImport } from './ScreenshotImport'
import { createManualDraft } from './manualDraft'
const mocks = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('../artifacts/ocrService', () => ({ createOcrSession: mocks.create }))
afterEach(() => { cleanup(); vi.restoreAllMocks() })
test('selecting a screenshot automatically recognizes it and shows a retry action instead of crop inputs on failure', async () => {
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 3840, height: 2160, close: vi.fn() })))
  mocks.create.mockResolvedValue({ recognize: vi.fn(async () => { throw new Error('未找到完整详情') }), dispose: vi.fn(async () => {}) })
  const user = userEvent.setup()
  render(<ScreenshotImport existing={[]} onConfirm={vi.fn()} onClose={vi.fn()} />)
  await user.upload(screen.getByLabelText('选择圣遗物截图'), new File(['png'], 'auto.png', { type: 'image/png' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('未找到完整详情')
  expect(screen.queryByLabelText('区域X')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '重新识别当前截图' })).toBeEnabled()
  expect(screen.queryByRole('dialog', { name: '确认入库' })).not.toBeInTheDocument()
})

test('a failed screenshot recognition releases its worker and keeps the original file for automatic retry', async () => {
  const user = userEvent.setup(); const dispose = vi.fn(async () => {})
  mocks.create.mockResolvedValue({ recognize: vi.fn(async () => { throw new Error('识别引擎失败') }), dispose })
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 3840, height: 2160, close: vi.fn() })))
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() })
  render(<ScreenshotImport existing={[]} onConfirm={vi.fn()} onClose={vi.fn()} />)
  await user.upload(screen.getByLabelText('选择圣遗物截图'), new File(['png'], 'frame.png', { type: 'image/png' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('识别引擎失败')
  await waitFor(() => expect(dispose).toHaveBeenCalledTimes(1))
  expect(screen.getByRole('button', { name: '重新识别当前截图' })).toBeEnabled()
  await user.click(screen.getByRole('button', { name: '重新识别当前截图' }))
  await waitFor(() => expect(dispose).toHaveBeenCalledTimes(2))
})
test('screenshot automatically recognizes details, never registers F8 or writes before review', async () => {
  const user = userEvent.setup(); const confirm = vi.fn(); const dispose = vi.fn(async () => {})
  const recognize = vi.fn(async () => ({ draft: { ...createManualDraft('zhuying-lieren', '生之花'), level: 0, main: { key: 'hpFlat', value: 717 }, subs: [{ key: 'atkFlat', value: 14 }, { key: 'defFlat', value: 16 }, { key: 'elementalMastery', value: 23 }] }, rawText: 'recognized', confidence: 90 }))
  mocks.create.mockResolvedValue({ recognize, dispose }); vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 3840, height: 2160, close: vi.fn() })))
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() })
  const close = vi.fn(); const view = render(<ScreenshotImport existing={[]} onConfirm={confirm} onClose={close} />)
  await user.upload(screen.getByLabelText('选择圣遗物截图'), new File(['png'], 'frame.png', { type: 'image/png' }))
  await screen.findByRole('dialog', { name: '确认入库' }); expect(confirm).not.toHaveBeenCalled()
  expect(recognize).toHaveBeenCalledWith(expect.any(Blob))
  await user.click(screen.getByRole('button', { name: '取消' })); view.unmount()
  await waitFor(() => expect(dispose).toHaveBeenCalledTimes(1)); expect(URL.revokeObjectURL).toHaveBeenCalled()
})
