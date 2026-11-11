import { FIVE_STAR_ARTIFACT_SETS } from '../artifacts/catalog'
import type { ArtifactSetKey, ArtifactSlot } from '../artifacts/types'

export type CatalogState = { search: string; setKey: ArtifactSetKey; slot: ArtifactSlot; level: number }
export function createCatalogState(): CatalogState {
  return { search: '', setKey: FIVE_STAR_ARTIFACT_SETS[0].key, slot: '生之花', level: 20 }
}
