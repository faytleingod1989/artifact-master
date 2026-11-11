import type { StatKey } from '../artifacts/statModel'
import type { ArtifactSetKey } from '../artifacts/types'

export type StatWeights = Partial<Record<StatKey, number>>
export type SetPlan = {
  label: '首选' | '替代' | '过渡'
  pieces: { key: ArtifactSetKey; count: 2 | 4 }[]
  condition: string
}
export type BuildProfile = {
  id: string; label: string; description: string
  element?: string
  mainStats: Record<'时之沙' | '空之杯' | '理之冠', StatKey[]>
  weights: StatWeights
  recharge: { min: number; max: number; note: string }
  sets: SetPlan[]
  notes: string[]
  assumedWeapon?: { name: string; energyRecharge: number; critRate: number }
}
export type CharacterProfile = {
  id: string; name: string; version: string; rarity: 4 | 5
  element: string; weapon: string; role: string; ascensionCritRate: number
  critRateAdjustment?: number
  ascensionEnergyRecharge: number
  builds: BuildProfile[]
  sources: { title: string; url: string }[]
  reviewedAt: string
  elements?: string[]
  releaseOrder?: string
}
