import type { DraftReviewItem } from '../imports/ImportReview'
import type { CaptureDiagnostic } from './captureController'
import type { CaptureRoi } from './captureRegion'
export const MANUAL_BATCH_LIMIT = 20
export const PAGE_BATCH_LIMIT = 60
export type CaptureTrigger = 'manual' | 'automatic' | 'page'
export type CaptureJobState = 'capturing' | 'queued' | 'recognizing' | 'failed' | 'pending' | 'cancelled'
export type CaptureJobSnapshot = Readonly<{
  id: string; batchId: string; sequence: number; sourceId: string; trigger: CaptureTrigger
  capturedAt?: number; state: CaptureJobState; previewUrl?: string; item?: DraftReviewItem
  error?: string; diagnostic?: CaptureDiagnostic; width?: number; height?: number; roi?: CaptureRoi
  capturePath?: 'native-window' | 'window-snapshot'; captureFallbackReason?: string
  pageId?: string; cellId?: string
  gameLocked?: boolean
}>
export type CaptureQueueSnapshot = Readonly<{
  batchId: string; accepting: boolean; capturing: boolean; ocrPaused: boolean
  heldSourceBytes: number; jobs: readonly CaptureJobSnapshot[]
}>
export type CaptureRequestOutcome = 'started' | 'inactive' | 'capture-busy' | 'capacity' | 'engine-paused'
