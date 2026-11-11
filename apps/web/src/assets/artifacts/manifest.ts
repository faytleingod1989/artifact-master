import { FIVE_STAR_ARTIFACT_SETS, FIVE_STAR_ARTIFACT_SET_KEYS, findArtifactSetByName } from '../../artifacts/catalog'
import { ARTIFACT_SLOTS, type ArtifactSetKey, type ArtifactSlot, type ArtworkStatus } from '../../artifacts/types'
import placeholderMissing from './placeholder-missing.svg'

export { ARTIFACT_SLOTS }

type ArtifactArtwork = {
  src: string
  status: ArtworkStatus
  setKey: ArtifactSetKey
  setName: string
  slot: ArtifactSlot
  alt: string
  missingReason?: 'missing-asset'
}

type LocalArtworkFile = 'flower' | 'plume' | 'sands' | 'goblet' | 'circlet'

// Private originals are permitted only for development and explicit local builds.
// Vite eliminates this import in the public production bundle.
const localArtworkByPath = (import.meta.env.DEV || import.meta.env.MODE === 'personal'
  ? (await import('./localArtwork.dev')).localArtworkByPath
  : {}) as Record<string, string>

export const ALL_ARTIFACT_SET_KEYS = FIVE_STAR_ARTIFACT_SET_KEYS

export const artifactSetNames = Object.fromEntries(
  FIVE_STAR_ARTIFACT_SETS.map(({ key, name }) => [key, name]),
) as Record<ArtifactSetKey, string>

const localFileBySlot: Record<ArtifactSlot, LocalArtworkFile> = {
  '生之花': 'flower',
  '死之羽': 'plume',
  '时之沙': 'sands',
  '空之杯': 'goblet',
  '理之冠': 'circlet',
}

const localArtworkDirectory = atob('Li9vcmlnaW5hbHM=')

function createArtwork(setKey: ArtifactSetKey, slot: ArtifactSlot): ArtifactArtwork {
  const localPath = `${localArtworkDirectory}/${setKey}/${localFileBySlot[slot]}`
  const src = localArtworkByPath[`${localPath}.webp`] ?? localArtworkByPath[`${localPath}.png`]
  const base = {
    src: src ?? placeholderMissing,
    status: (src ? 'ready' : 'missing') as ArtworkStatus,
    setKey,
    setName: artifactSetNames[setKey],
    slot,
    alt: `${artifactSetNames[setKey]}·${slot}原版图标`,
  }

  return src ? base : { ...base, missingReason: 'missing-asset' }
}

export const artifactArtworkBySet = Object.fromEntries(
  FIVE_STAR_ARTIFACT_SETS.map(({ key }) => [
    key,
    Object.fromEntries(ARTIFACT_SLOTS.map((slot) => [slot, createArtwork(key, slot)])),
  ]),
) as Record<ArtifactSetKey, Record<ArtifactSlot, ArtifactArtwork>>

export function resolveArtifactSetKey(setName: string): ArtifactSetKey | undefined {
  return findArtifactSetByName(setName)?.key
}

export function assertArtifactManifestComplete({ requireReady }: { requireReady: boolean }): void {
  const setKeys = Object.keys(artifactArtworkBySet)
  if (setKeys.length !== FIVE_STAR_ARTIFACT_SET_KEYS.length || setKeys.some((setKey, index) => setKey !== FIVE_STAR_ARTIFACT_SET_KEYS[index])) {
    throw new Error('圣遗物套装清单不完整')
  }

  const missing: ArtifactArtwork[] = []
  for (const setKey of FIVE_STAR_ARTIFACT_SET_KEYS) {
    const artworkBySlot = artifactArtworkBySet[setKey]
    const slots = Object.keys(artworkBySlot)
    if (slots.length !== ARTIFACT_SLOTS.length || slots.some((slot, index) => slot !== ARTIFACT_SLOTS[index])) {
      throw new Error(`圣遗物部位清单不完整：${setKey}`)
    }

    for (const slot of ARTIFACT_SLOTS) {
      const artwork = artworkBySlot[slot]
      if (artwork.setKey !== setKey || artwork.slot !== slot) {
        throw new Error(`圣遗物素材身份不匹配：${setKey}/${slot}`)
      }
      if (artwork.status !== 'ready') missing.push(artwork)
    }
  }

  if (requireReady && missing.length) {
    throw new Error(`尚有 ${missing.length} 项圣遗物原版素材未签收`)
  }
}
