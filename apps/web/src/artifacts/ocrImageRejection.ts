// Image-content rejection is distinct from worker, transport or canvas failure.
export class OcrImageRejectedError extends Error {
  readonly kind='image-rejected'
}
export function isOcrImageRejection(error:unknown):boolean {
  return error instanceof OcrImageRejectedError
}
