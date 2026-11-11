import { expect, test, vi } from 'vitest'
import { createCaptureResources } from './captureResources'
test('source budget accepts the exact limits, rejects excess and releases slots independently', () => {
  const resources = createCaptureResources(16, 128)
  for (let i = 0; i < 8; i++) expect(resources.hold(String(i), new Blob([new Uint8Array(16)]))).toBe(true)
  expect(resources.bytes()).toBe(128)
  expect(resources.hold('excess', new Blob(['x']))).toBe(false)
  resources.release('0'); expect(resources.hold('too-big', new Blob([new Uint8Array(17)]))).toBe(false)
  expect(resources.hold('new', new Blob([new Uint8Array(16)]))).toBe(true)
  resources.clear(); expect(resources.bytes()).toBe(0)
})
test('resource previews are replaced and revoked exactly once including clear', () => {
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  const make = vi.spyOn(URL, 'createObjectURL').mockReturnValueOnce('blob:1').mockReturnValueOnce('blob:2')
  const resources = createCaptureResources()
  expect(resources.preview('A', new Blob())).toBe('blob:1')
  expect(resources.preview('A', new Blob())).toBe('blob:2')
  resources.clear(); resources.clear()
  expect(revoke.mock.calls).toEqual([['blob:1'], ['blob:2']]); revoke.mockRestore(); make.mockRestore()
})
