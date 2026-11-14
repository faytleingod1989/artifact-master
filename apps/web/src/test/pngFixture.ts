const BASE_1X1_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let c = 0xffffffff
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function decodeBase(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function encodeBase64(bytes: Uint8Array): string {
  const parts: string[] = []
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)))
  }
  return btoa(parts.join(''))
}

export function makeTestPngBytes(tag?: string, padBytes = 0): Uint8Array {
  const base = decodeBase(BASE_1X1_PNG_B64)
  if (!tag && padBytes <= 0) return base
  const textBody = `Comment\0${tag ?? 'png'}${'a'.repeat(Math.max(0, padBytes))}`
  const textLen = textBody.length
  const chunk = new Uint8Array(12 + textLen)
  chunk[0] = (textLen >>> 24) & 0xff
  chunk[1] = (textLen >>> 16) & 0xff
  chunk[2] = (textLen >>> 8) & 0xff
  chunk[3] = textLen & 0xff
  chunk[4] = 0x74 // t
  chunk[5] = 0x45 // E
  chunk[6] = 0x58 // X
  chunk[7] = 0x74 // t
  for (let i = 0; i < textLen; i++) chunk[8 + i] = textBody.charCodeAt(i)
  const crc = crc32(chunk, 4, 8 + textLen)
  chunk[8 + textLen] = (crc >>> 24) & 0xff
  chunk[9 + textLen] = (crc >>> 16) & 0xff
  chunk[10 + textLen] = (crc >>> 8) & 0xff
  chunk[11 + textLen] = crc & 0xff
  const prefix = base.subarray(0, base.length - 12)
  const iend = base.subarray(base.length - 12)
  const result = new Uint8Array(prefix.length + chunk.length + iend.length)
  result.set(prefix, 0)
  result.set(chunk, prefix.length)
  result.set(iend, prefix.length + chunk.length)
  return result
}

export function makeTestPngDataUrl(tag?: string, padBytes = 0): string {
  return `data:image/png;base64,${encodeBase64(makeTestPngBytes(tag, padBytes))}`
}

export function makeTestPngFile(name: string, tag?: string, padBytes = 0): File {
  const bytes = makeTestPngBytes(tag, padBytes)
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return new File([copy], name, { type: 'image/png' })
}
