import { afterEach, expect, test, vi } from 'vitest'

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })
test.each([
  ['personal', 'ready'], ['local', 'missing'], ['production', 'missing'], ['staging', 'missing'],
])('restricts private icons to approved mode: %s', async (mode, status) => {
  vi.stubEnv('MODE', mode)
  vi.stubEnv('DEV', false)
  vi.resetModules()
  const { artifactArtworkBySet } = await import('./manifest')
  const entries = Object.values(artifactArtworkBySet).flatMap(Object.values)
  expect(entries).toHaveLength(230)
  const oldEntries = entries.filter(entry => !['heart-of-the-furnace', 'scarlet-proof'].includes(entry.setKey))
  expect(oldEntries).toHaveLength(220)
  expect(oldEntries.every(entry => entry.status === status)).toBe(true)
  expect(entries.filter(entry => ['heart-of-the-furnace', 'scarlet-proof'].includes(entry.setKey)).every(entry => entry.status === 'missing')).toBe(true)
})
