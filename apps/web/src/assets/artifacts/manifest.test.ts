import { expect, test } from 'vitest'
import { FIVE_STAR_ARTIFACT_SET_KEYS, FIVE_STAR_ARTIFACT_SETS } from '../../artifacts/catalog'
import {
  ALL_ARTIFACT_SET_KEYS,
  ARTIFACT_SLOTS,
  artifactArtworkBySet,
  assertArtifactManifestComplete,
} from './manifest'

test('declares every catalog set with all five slots', () => {
  expect(ALL_ARTIFACT_SET_KEYS).toEqual(FIVE_STAR_ARTIFACT_SET_KEYS)
  expect(Object.keys(artifactArtworkBySet)).toEqual(FIVE_STAR_ARTIFACT_SET_KEYS)
  for (const entry of FIVE_STAR_ARTIFACT_SETS) {
    const setKey = entry.key
    expect(Object.keys(artifactArtworkBySet[setKey])).toEqual(ARTIFACT_SLOTS)
  }
  expect(() => assertArtifactManifestComplete({ requireReady: false })).not.toThrow()
})

test('never claims all artwork ready while the two additional sets are missing', () => {
  expect(() => assertArtifactManifestComplete({ requireReady: true })).toThrow('10 项')
})

test('keeps all four legacy sets fully ready', () => {
  for (const setKey of ['shenlang-zhongqu', 'heiyao-midian', 'zhuying-lieren', 'xishi-zhige'] as const) {
    for (const slot of ARTIFACT_SLOTS) {
      expect(artifactArtworkBySet[setKey][slot]).toMatchObject({ setKey, slot, status: 'ready' })
    }
  }
})
