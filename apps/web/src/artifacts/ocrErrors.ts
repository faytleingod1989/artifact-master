import type { NativeOcrEngineFailure } from './nativeOcrTypes'
export class OcrEngineError extends Error {
  readonly kind = 'engine-unavailable'
}
export function unwrapOcrReply<T>(value: T | NativeOcrEngineFailure): T {
  if (value && typeof value === 'object' && 'code' in value && value.code === 'OCR_ENGINE_UNAVAILABLE') throw new OcrEngineError('message' in value && typeof value.message === 'string' ? value.message : '本地OCR引擎不可用。')
  return value as T
}
