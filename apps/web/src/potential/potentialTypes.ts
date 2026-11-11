import type { ArtifactRecord } from '../artifacts/types'
import type { ScoringOptions } from '../scoring'
export type PotentialInput = { record: ArtifactRecord; characterName: string; options: ScoringOptions }
export type PotentialResult = { status: 'ready'; current: number; min: number; max: number; remainingEvents: number; fourth: 'known' | 'unknown' | 'none'; maxed: boolean; ruleVersion: string } | { status: 'needs-verification'; reasons: string[] }
