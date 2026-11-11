import { useState } from 'react'
import placeholderMissing from '../assets/artifacts/placeholder-missing.svg'
import { getArtifactArtwork } from '../artifacts/resolveArtwork'
import type { ArtifactRecord } from '../artifacts/types'

export function ArtifactGlyph({ artifact }: { artifact: ArtifactRecord }) {
  const artwork = getArtifactArtwork(artifact)
  const artworkIdentity = `${artwork.setKey ?? artifact.set}:${artifact.slot}:${artwork.src}`
  const [failedArtworkIdentity, setFailedArtworkIdentity] = useState<string | null>(null)
  const imageFailed = failedArtworkIdentity === artworkIdentity
  const status = imageFailed ? 'missing' : artwork.status

  return (
    <div className={`artifact-glyph ${artifact.hue}`} data-artwork-status={status}>
      <img src={imageFailed ? placeholderMissing : artwork.src} alt={artwork.alt} onError={() => setFailedArtworkIdentity(artworkIdentity)} />
    </div>
  )
}
