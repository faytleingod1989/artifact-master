import { expect, test } from 'vitest'
import { readNativeOcrMode, writeNativeOcrMode } from './ocrPreferences'
test('explicit general rollback survives reload while corrupt preferences fail closed', () => {
  localStorage.clear()
  expect(readNativeOcrMode()).toBe('auto')
  writeNativeOcrMode('general'); expect(readNativeOcrMode()).toBe('general')
  localStorage.setItem('artifact-master:ocr-route:v1', 'remote'); expect(readNativeOcrMode()).toBe('general')
  localStorage.clear()
})
