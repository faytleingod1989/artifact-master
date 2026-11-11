export function readStoredAssetMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem('artifact-master-assets-v2') ?? localStorage.getItem('artifact-master-assets-v1')
    if (raw === null) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Object.values(parsed).every((value) => typeof value === 'string')) return {}
    return parsed as Record<string, string>
  } catch {
    return {}
  }
}
