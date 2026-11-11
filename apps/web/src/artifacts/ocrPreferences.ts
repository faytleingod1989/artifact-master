const KEY = 'artifact-master:ocr-route:v1'
export function readNativeOcrMode(): 'auto' | 'general' {
  try { const value = localStorage.getItem(KEY); return value === null || value === 'auto' ? 'auto' : 'general' }
  catch { return 'general' }
}
export function writeNativeOcrMode(mode: 'auto' | 'general'): void { try { localStorage.setItem(KEY, mode) } catch { /* Storage failure cannot change inventory. */ } }
