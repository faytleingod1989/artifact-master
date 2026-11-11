import { expect, test } from 'vitest'
import { parseEquippedCharacter } from './captureMetadata'
test('only an exact verified character before the equipped marker can identify the source role', () => {
  expect(parseEquippedCharacter('雷 电 将 军 已 装 备')).toBe(10000052)
  expect(parseEquippedCharacter('雷电将军未装备')).toBeUndefined()
  expect(parseEquippedCharacter('雷神已装备')).toBeUndefined()
  expect(parseEquippedCharacter('未知角色已装备')).toBeUndefined()
})
