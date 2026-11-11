import { AUDITED_FIVE_STAR_ARTIFACT_ROWS } from './catalog.snapshot'
import { ARTIFACT_SET_NAME_ALIASES } from './catalog.aliases'

export type ArtifactSet = { key: ArtifactSetKey; name: string; sourceName: string }
export type ArtifactSetKey = (typeof AUDITED_FIVE_STAR_ARTIFACT_ROWS)[number][0]
export const FIVE_STAR_ARTIFACT_SETS: readonly ArtifactSet[] = AUDITED_FIVE_STAR_ARTIFACT_ROWS.map(([key, name, sourceName]) => ({ key, name, sourceName }))

export const FIVE_STAR_ARTIFACT_SET_KEYS = FIVE_STAR_ARTIFACT_SETS.map(({ key }) => key) as ArtifactSetKey[]
export const findArtifactSetByName = (name: string) => {
  const formalName = ARTIFACT_SET_NAME_ALIASES[name] ?? name
  return FIVE_STAR_ARTIFACT_SETS.find((entry) => entry.name === formalName)
}
