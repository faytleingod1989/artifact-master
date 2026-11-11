import {
  ARTIFACT_SLOTS,
  artifactArtworkBySet,
  resolveArtifactSetKey,
} from '../assets/artifacts/manifest'
import placeholderMissing from '../assets/artifacts/placeholder-missing.svg'
import type { ArtifactRecord, ArtifactSetKey, ArtworkStatus } from './types'

type ArtifactArtworkResult = {
  src: string
  alt: string
  status: ArtworkStatus
  missingReason?: 'missing-asset' | 'unregistered-set' | 'unregistered-slot' | 'identity-mismatch'
  setKey?: ArtifactSetKey
}

type ArtifactArtworkInput = Pick<ArtifactRecord, 'set' | 'setKey' | 'slot'>

function warnAboutMissingArtwork(artifact: ArtifactArtworkInput, reason: NonNullable<ArtifactArtworkResult['missingReason']>): void {
  if (import.meta.env.DEV) {
    console.warn('[artifact-artwork:missing]', { setKey: artifact.setKey, set: artifact.set, slot: artifact.slot, reason })
  }
}

function toArtworkResult(artwork: {
  src: string
  alt: string
  status: ArtworkStatus
  missingReason?: 'missing-asset'
  setKey: ArtifactSetKey
}): ArtifactArtworkResult {
  return {
    src: artwork.src,
    alt: artwork.alt,
    status: artwork.status,
    missingReason: artwork.missingReason,
    setKey: artwork.setKey,
  }
}

function missingArtwork(artifact: ArtifactArtworkInput, missingReason: 'unregistered-set' | 'unregistered-slot' | 'identity-mismatch' = 'unregistered-set'): ArtifactArtworkResult {
  warnAboutMissingArtwork(artifact, missingReason)
  return {
    src: placeholderMissing,
    alt: `${artifact.set || '未登记套装'}·${artifact.slot || '未知部位'}原版图标`,
    status: 'missing',
    missingReason,
  }
}

export function getArtifactArtwork(artifact: ArtifactArtworkInput): ArtifactArtworkResult {
  const hasSetName = artifact.set.trim().length > 0
  const resolvedSetKey = hasSetName ? resolveArtifactSetKey(artifact.set) : undefined
  if (hasSetName && !resolvedSetKey) {
    return missingArtwork(artifact, 'unregistered-set')
  }
  if (artifact.setKey && resolvedSetKey && artifact.setKey !== resolvedSetKey) {
    return missingArtwork(artifact, 'identity-mismatch')
  }

  const setKey = resolvedSetKey ?? artifact.setKey
  if (!setKey || !Object.prototype.hasOwnProperty.call(artifactArtworkBySet, setKey)) {
    return missingArtwork(artifact)
  }
  if (!ARTIFACT_SLOTS.includes(artifact.slot)) {
    return missingArtwork(artifact, 'unregistered-slot')
  }

  const result = toArtworkResult(artifactArtworkBySet[setKey][artifact.slot])
  if (result.status === 'missing') {
    warnAboutMissingArtwork(artifact, result.missingReason ?? 'missing-asset')
  }
  return result
}
