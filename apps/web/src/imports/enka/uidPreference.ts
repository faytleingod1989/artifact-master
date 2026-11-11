const KEY = 'artifact-master:remembered-uid-v1'
export function normalizedUid(value: string): string | null { return ![...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) && /^[1-9]\d{8,9}$/.test(value.trim()) ? value.trim() : null }
export function readRememberedUid(): string | null { try { return normalizedUid(localStorage.getItem(KEY) ?? '') } catch { return null } }
export function writeRememberedUid(uid: string | null): void {
  if (uid !== null && !normalizedUid(uid)) throw new Error('UID格式无效。')
  try { if (uid === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, normalizedUid(uid)!) } catch { throw new Error('无法保存UID偏好，查询仍可进行。') }
}
