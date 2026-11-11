import { beforeEach, expect, test } from 'vitest'
import { readRememberedUid, writeRememberedUid } from './uidPreference'
beforeEach(() => localStorage.clear())
test('only explicitly remembered valid UID is retained; null removes it', () => {
  expect(readRememberedUid()).toBeNull()
  writeRememberedUid('123456789'); expect(readRememberedUid()).toBe('123456789')
  writeRememberedUid(null); expect(localStorage.getItem('artifact-master:remembered-uid-v1')).toBeNull()
  localStorage.setItem('artifact-master:remembered-uid-v1', 'https://bad')
  expect(readRememberedUid()).toBeNull()
})
