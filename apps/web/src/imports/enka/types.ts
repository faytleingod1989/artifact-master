import type { ArtifactDraft } from '../../artifacts/artifactDraft'
export type ShowcaseParseResult = { drafts: ArtifactDraft[]; skipped: { weapons: number; lowerRarity: number }; unknown: { characterId?: number; message: string }[]; empty: boolean }
export type EnkaQueryResult = { ok: true; payload: unknown; fetchedAt: number; refreshAt: number; cached: boolean } | { ok: false; code: 'invalid-uid' | 'not-found' | 'maintenance' | 'rate-limited' | 'unavailable' | 'offline' | 'timeout' | 'invalid-response' | 'unauthorized'; retryAt?: number }
