import { afterEach, expect, test, vi } from 'vitest'
import { ARTIFACT_SLOTS } from '../../artifacts/types'
import { FIVE_STAR_ARTIFACT_SET_KEYS } from '../../artifacts/catalog'
import placeholderMissing from './placeholder-missing.svg'

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })
test('uses the shared missing placeholder for every artwork in production mode', async () => {
  vi.stubEnv('MODE', 'production')
  vi.stubEnv('DEV', false)
  vi.resetModules()
  const { artifactArtworkBySet } = await import('./manifest')
  for (const setKey of FIVE_STAR_ARTIFACT_SET_KEYS) {
    for (const slot of ARTIFACT_SLOTS) {
      expect(artifactArtworkBySet[setKey][slot]).toMatchObject({
        src: placeholderMissing,
        status: 'missing',
        setKey,
        slot,
      })
    }
  }
})
