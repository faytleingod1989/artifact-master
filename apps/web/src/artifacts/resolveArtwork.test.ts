import { expect, test, vi } from 'vitest'
import { getArtifactArtwork } from './resolveArtwork'

const base = { id: 1, name: '测试', set: '深廊终曲', setKey: 'shenlang-zhongqu', slot: '生之花', level: 0, score: 0, main: '生命值 717', subs: [], locked: false, hue: 'blue' } as const

test('resolves audited artwork by set key and slot', () => {
  expect(getArtifactArtwork(base)).toMatchObject({ status: 'ready', alt: '深廊终曲·生之花原版图标' })
})

test('does not use a different set when a set is unknown', () => {
  expect(getArtifactArtwork({ ...base, set: '未知套装', setKey: undefined })).toMatchObject({ status: 'missing', missingReason: 'unregistered-set' })
})

test('does not use a valid key when the set name is unknown', () => {
  expect(getArtifactArtwork({ ...base, set: '未知套装', setKey: 'shenlang-zhongqu' })).toMatchObject({
    status: 'missing',
    missingReason: 'unregistered-set',
  })
})

test('does not use a different key when the set name is known', () => {
  expect(getArtifactArtwork({ ...base, set: '黑曜秘典', setKey: 'shenlang-zhongqu' })).toMatchObject({
    status: 'missing',
    missingReason: 'identity-mismatch',
  })
})

test('returns the neutral placeholder for an unregistered slot', () => {
  const invalidSlotArtifact = { ...base, slot: '未知部位' } as unknown as typeof base
  expect(getArtifactArtwork(invalidSlotArtifact)).toMatchObject({ status: 'missing', missingReason: 'unregistered-slot' })
})

test('warns with locatable fields in development', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  getArtifactArtwork({ ...base, set: '未知套装', setKey: undefined })
  expect(warn).toHaveBeenCalledWith('[artifact-artwork:missing]', expect.objectContaining({ set: '未知套装', slot: '生之花', reason: 'unregistered-set' }))
})
