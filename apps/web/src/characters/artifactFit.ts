import type { ArtifactRecord } from '../artifacts/types'
import { findArtifactSetByName, FIVE_STAR_ARTIFACT_SETS } from '../artifacts/catalog'
import { parseStat, type StatKey } from '../artifacts/statModel'
import { scoreArtifact } from '../scoring'
import { CHARACTER_PROFILES } from './profiles'
import type { BuildProfile } from './profileTypes'
export type ArtifactRoleFit = { characterId: string; characterName: string; suggestedBuildId: string; setFit?: 'preferred-four' | 'alternative-four' | 'two-piece'; mainMatches: boolean; label: string; condition?: string }
export function artifactMainMatches(record: Pick<ArtifactRecord, 'slot' | 'main'>, build: BuildProfile): boolean {
  const main = parseStat(record.main)
  const desired: readonly StatKey[] = record.slot === '生之花' ? ['hpFlat'] : record.slot === '死之羽' ? ['atkFlat'] : build.mainStats[record.slot] ?? []
  return !!main && desired.includes(main.key)
}
export function getArtifactFitOptions(record: ArtifactRecord, query = ''): { recommended: ArtifactRoleFit[]; others: ArtifactRoleFit[] } {
  const key = record.set ? findArtifactSetByName(record.set)?.key : FIVE_STAR_ARTIFACT_SETS.find(row => row.key === record.setKey)?.key
  const ranked = CHARACTER_PROFILES.filter(profile => (profile.name + profile.id).toLowerCase().includes(query.trim().toLowerCase())).map((profile, order) => {
    const builds = profile.builds.map((build, buildOrder) => {
      const mainMatches = artifactMainMatches(record, build)
      const matches = build.sets.flatMap(plan => plan.pieces.filter(part => part.key === key).map(part => ({ plan, part, rank: part.count === 4 && plan.label === '首选' ? 0 : part.count === 4 && plan.label === '替代' ? 1 : 2 }))).sort((a, b) => a.rank - b.rank)
      const best = matches[0], rank = mainMatches && best ? best.rank : 3
      return { build, buildOrder, mainMatches, best, rank, score: scoreArtifact(record, profile.name, { buildId: build.id, includeSetBonuses: false }) }
    }).sort((a, b) => a.rank - b.rank || Number(b.mainMatches) - Number(a.mainMatches) || b.score - a.score || a.buildOrder - b.buildOrder)
    const best = builds[0]
    const row: ArtifactRoleFit = { characterId: profile.id, characterName: profile.name, suggestedBuildId: best.build.id, mainMatches: best.mainMatches, label: best.best ? best.best.part.count + '件' + best.best.plan.label : '其他玩法', condition: best.best?.plan.condition, setFit: best.best ? best.best.part.count === 2 ? 'two-piece' : best.best.rank === 0 ? 'preferred-four' : 'alternative-four' : undefined }
    return { row, rank: best.rank, score: best.score, order }
  }).sort((a, b) => a.rank - b.rank || b.score - a.score || a.order - b.order)
  return { recommended: ranked.filter(row => row.rank < 3).map(row => row.row), others: ranked.filter(row => row.rank === 3).map(row => row.row) }
}
