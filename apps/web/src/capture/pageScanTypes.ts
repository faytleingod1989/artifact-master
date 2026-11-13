import type { CapturedArtifactFrame } from '../realtimeCapture'
import type { CaptureRequestOutcome } from './captureQueueTypes'
export type PageCell = Readonly<{ id: string; row: number; col: number; rarity: 5; selected: boolean }>
export type PageCellMismatch = Readonly<{ id: string; branch: string; referenceEmphasized: boolean; currentEmphasized: boolean; pose?: number; raw?: readonly number[]; norm?: readonly number[] }>
export type PageStatus = 'SAME' | 'TRANSIENT' | 'CHANGED' | 'UNKNOWN'
export type PageObservation = Readonly<{ sourceId: string; width: number; height: number; geometryKey: string; frameSequence: number; foreground: boolean; validLayout: boolean; emergencyStop: boolean; hasFourStar?: boolean; pageSignature: string; gridSignature?: string; detailSignature: string; scrollAnchor?: string; rowSignatures?: readonly string[]; selectedCellId?: string; cells: readonly PageCell[]; pageStatus?: PageStatus; scriptVersion?: string; matcherVersion?: string; layoutIssue?: string; selection?: Readonly<{ best: number; runnerUp: number; candidate?: string }>; timing?: Readonly<{ grabMs: number; analyzeMs: number }>; mismatches?: readonly PageCellMismatch[] }>
export type PageScanState = 'idle' | 'armed' | 'scanning' | 'scrolling' | 'pausing' | 'paused' | 'emergency_stopped' | 'page-complete' | 'completed' | 'stopped'
export type PageScanSnapshot = Readonly<{ pageId: string; state: PageScanState; reason?: string; cells: readonly { id: string; state: 'waiting' | 'captured'; jobId?: string }[] }>
export type PageScanDriver = {
  observe: () => Promise<PageObservation>; select: (cellId: string) => Promise<void>
  scrollDown?: (ticks?: number) => Promise<void>
  freeze: (cellId: string) => Promise<CapturedArtifactFrame>
  resume: () => Promise<void>; pause: () => Promise<void>; close: () => Promise<void>
  prepare: () => Promise<void>
  anchor: () => Promise<void>; resetPage: () => Promise<void>
}
export type PageScanOptions = {
  sourceId: string; driver: PageScanDriver; canCapture: () => boolean
  enqueue: (frame: CapturedArtifactFrame, pageId: string, cellId: string) => { outcome: CaptureRequestOutcome; jobId?: string }
  onState: (snapshot: PageScanSnapshot) => void
  autoScroll?: () => boolean
  stopRequested?: () => string | undefined
  sleep?: (ms: number) => Promise<void>; now?: () => number; random?: () => number; maxPages?: number
}
