import { resolveArtifactSetKey } from '../assets/artifacts/manifest'
import type { ArtifactRecord } from './types'

type MigrationReport = {
  ignoredArtifactOverrideIds: number[]
  unresolvedArtifactIds: number[]
}

type MigrateArtifactLibraryInput = {
  artifacts: ArtifactRecord[]
  assets: Record<string, string>
}

export function isLegacyArtifactAssetKey(key: string): boolean {
  return key.startsWith('artifact:')
}

export function getLegacyArtifactAssetStats(assets: Record<string, string>): { count: number; totalBytes: number } {
  let count = 0
  let totalBytes = 0
  for (const [key, value] of Object.entries(assets)) {
    if (!isLegacyArtifactAssetKey(key) || typeof value !== 'string') continue
    count++
    totalBytes += value.length
  }
  return { count, totalBytes }
}

export function cleanupIgnoredArtifactAssets(assets: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(assets).filter(([key]) => !isLegacyArtifactAssetKey(key)))
}

export function mergeRetainedCharacterAssets({ retainedAssets, currentAssets }: {
  retainedAssets: Record<string, string>
  currentAssets: Record<string, string>
}): Record<string, string> {
  return {
    ...retainedAssets,
    ...Object.fromEntries(Object.entries(currentAssets).filter(([key]) => key.startsWith('character:'))),
  }
}

export function migrateArtifactLibrary({ artifacts, assets }: MigrateArtifactLibraryInput): {
  artifacts: ArtifactRecord[]
  migrationReport: MigrationReport
  retainedAssets: Record<string, string>
} {
  const unresolvedArtifactIds: number[] = []
  const migratedArtifacts = artifacts.map((artifact) => {
    const setKey = resolveArtifactSetKey(artifact.set)
    const { setKey: _legacySetKey, ...artifactWithoutSetKey } = artifact

    if (!setKey) {
      unresolvedArtifactIds.push(artifact.id)
      return artifactWithoutSetKey
    }

    return { ...artifactWithoutSetKey, setKey }
  })

  const ignoredArtifactOverrideIds = Object.keys(assets).flatMap((key) => {
    const match = /^artifact:(\d+)$/.exec(key)
    return match ? [Number(match[1])] : []
  })

  const retainedAssets = Object.fromEntries(
    Object.entries(assets).filter(([key, value]) => (key.startsWith('character:') || isLegacyArtifactAssetKey(key)) && typeof value === 'string'),
  )

  return {
    artifacts: migratedArtifacts,
    migrationReport: { ignoredArtifactOverrideIds, unresolvedArtifactIds },
    retainedAssets,
  }
}
