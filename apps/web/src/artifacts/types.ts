export const ARTIFACT_SLOTS = ['生之花', '死之羽', '时之沙', '空之杯', '理之冠'] as const
export type ArtifactSlot = (typeof ARTIFACT_SLOTS)[number]
import type { ArtifactSetKey } from './catalog'
export type { ArtifactSetKey } from './catalog'
export type ArtworkStatus = 'ready' | 'missing'
export type ArtifactRecord = {
  id: number; name: string; set: string; setKey?: ArtifactSetKey; slot: ArtifactSlot
  level: number; score: number; main: string; subs: string[]; locked: boolean; hue: string
  pendingSubs?: string[]
  source?: { kind: 'manual' | 'realtime' | 'screenshot' | 'uid'; characterId?: number; fetchedAt?: number }
}
