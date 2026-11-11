export function createCaptureResources(singleLimit = 16 * 1024 * 1024, totalLimit = 128 * 1024 * 1024) {
  const images = new Map<string, Blob>(), urls = new Map<string, string>()
  let bytes = 0
  const releaseSource = (id: string) => { const image = images.get(id); if (image) bytes -= image.size; images.delete(id) }
  const release = (id: string) => { releaseSource(id); const url = urls.get(id); if (url) URL.revokeObjectURL(url); urls.delete(id) }
  return {
    hold(id: string, blob: Blob) {
      if (blob.size > singleLimit || bytes - (images.get(id)?.size ?? 0) + blob.size > totalLimit) return false
      releaseSource(id); images.set(id, blob); bytes += blob.size; return true
    },
    get: (id: string) => images.get(id),
    preview(id: string, image: Blob) {
      const next = URL.createObjectURL(image), previous = urls.get(id)
      urls.set(id, next); if (previous) URL.revokeObjectURL(previous); return next
    },
    releaseSource, release, bytes: () => bytes,
    clear() { for (const id of new Set([...images.keys(), ...urls.keys()])) release(id) },
  }
}
