import snapshot from './gameData.snapshot.json'
import type { ArtifactSetKey, ArtifactSlot } from './types'
import type { StatKey } from './statModel'

export type GameData = {
  version: string; sourceCommit: string; sourceHashes: Record<string, string>
  setHashes: Record<string, ArtifactSetKey>
  pieceHashes: Record<string, { setKey: ArtifactSetKey; slot: ArtifactSlot; name: string }>
  characters: Record<string, { name: string }>
  mainGrowth: Partial<Record<StatKey, number[]>>
  subBounds: Partial<Record<StatKey, { min: number; max: number }>>
}
export const GAME_DATA = snapshot as GameData
export function getPieceName(setKey: ArtifactSetKey, slot: ArtifactSlot): string | null {
  return Object.values(GAME_DATA.pieceHashes).find(piece => piece.setKey === setKey && piece.slot === slot)?.name ?? null
}
