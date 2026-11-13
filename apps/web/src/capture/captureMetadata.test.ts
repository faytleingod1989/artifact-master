import { expect, test } from 'vitest'
import { hasEquippedBannerInk, parseEquippedCharacter } from './captureMetadata'
test('only an exact verified character before the equipped marker can identify the source role', () => {
  expect(parseEquippedCharacter('雷 电 将 军 已 装 备')).toBe(10000052)
  expect(parseEquippedCharacter('雷电将军未装备')).toBeUndefined()
  expect(parseEquippedCharacter('雷神已装备')).toBeUndefined()
  expect(parseEquippedCharacter('未知角色已装备')).toBeUndefined()
})
test('hasEquippedBannerInk returns false on uniform empty background and true when high-contrast glyph edges exist', () => {
  const width = 200, height = 60, uniform = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < uniform.length; i += 4) { uniform[i] = 220; uniform[i + 1] = 215; uniform[i + 2] = 200; uniform[i + 3] = 255 }
  expect(hasEquippedBannerInk(uniform, width, height)).toBe(false)
  for (let y = 20; y < 38; y++) {
    for (let x = 40; x < 160; x += 4) {
      const idx = (y * width + x) * 4
      uniform[idx] = 45; uniform[idx + 1] = 45; uniform[idx + 2] = 45
    }
  }
  expect(hasEquippedBannerInk(uniform, width, height)).toBe(true)
})
