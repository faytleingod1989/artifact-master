import { afterEach, expect, test } from 'vitest'
import { readCaptureSoundPreferences, writeCaptureSoundPreferences } from './captureSoundPreferences'
afterEach(() => localStorage.clear())
test('legacy mute disables both sounds, while a later independent choice is retained', () => {
  localStorage.setItem('artifact-master:capture-success-sound:v1', 'off')
  expect(readCaptureSoundPreferences()).toEqual({ captured: false, recognized: false })
  writeCaptureSoundPreferences({ captured: true, recognized: false })
  expect(readCaptureSoundPreferences()).toEqual({ captured: true, recognized: false })
})
test('invalid new preference falls back to legacy rather than defeating mute', () => {
  localStorage.setItem('artifact-master:capture-success-sound:v1', 'off')
  localStorage.setItem('artifact-master:capture-sound-preferences:v2', '{bad')
  expect(readCaptureSoundPreferences()).toEqual({ captured: false, recognized: false })
})
