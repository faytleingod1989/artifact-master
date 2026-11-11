import type { ArtifactFieldLayout } from './artifactFieldLayout'
export type NativeOcrLine = { text: string; score: number; box: number[][]; occluded: boolean }
export type NativeOcrRequest = { protocolVersion: 2; mode: 'auto' | 'general'; layout?: ArtifactFieldLayout }
export type NativeOcrRoute = 'general' | 'line' | 'specialized' | 'mixed'
export type NativeOcrResult = { engine: 'PP-OCRv5-server'; width: number; height: number; elapsedMs: number; lines: NativeOcrLine[]; primaryLines?: NativeOcrLine[]; route?: NativeOcrRoute; modelId?: string; fallbackReason?: string; conflicts?: string[]; timings?: { decodeMs?: number; detMs: number; recMs: number } }
export type NativeOcrEngineFailure = { ok: false; code: 'OCR_ENGINE_UNAVAILABLE'; message: string }
export type NativeOcrBridge = { open: () => Promise<string | NativeOcrEngineFailure>; recognize: (session: string, image: string, request?: NativeOcrRequest) => Promise<NativeOcrResult | NativeOcrEngineFailure>; close: (session: string) => Promise<void> }
