export type CaptureSoundPreferences = { captured: boolean; recognized: boolean }
const KEY = 'artifact-master:capture-sound-preferences:v2'
export function readCaptureSoundPreferences(): CaptureSoundPreferences {
  try {
    const stored = localStorage.getItem(KEY)
    if (stored) { try { const value = JSON.parse(stored); if (typeof value?.captured === 'boolean' && typeof value?.recognized === 'boolean') return value } catch { /* Use legacy mute. */ } }
    const enabled = localStorage.getItem('artifact-master:capture-success-sound:v1') !== 'off'
    return { captured: enabled, recognized: enabled }
  } catch { return { captured: true, recognized: true } }
}
export function writeCaptureSoundPreferences(value: CaptureSoundPreferences) { try { localStorage.setItem(KEY, JSON.stringify(value)) } catch { /* Optional preference. */ } }
