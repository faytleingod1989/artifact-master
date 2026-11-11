import { expect, test } from 'vitest'
import { createNativeOcrSession } from './nativeOcrService'
test('a cloneable IPC engine failure becomes the typed failure the queue pauses on, before any image work', async () => {
  await expect(createNativeOcrSession({ open: async () => ({ ok: false, code: 'OCR_ENGINE_UNAVAILABLE', message: 'engine stopped' }), recognize: async () => { throw new Error('must not recognize') }, close: async () => {} })).rejects.toMatchObject({ kind: 'engine-unavailable', message: 'engine stopped' })
})
