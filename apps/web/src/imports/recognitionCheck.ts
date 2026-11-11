import { validateDraft, type ArtifactDraft } from '../artifacts/artifactDraft'
import { STAT_DEFINITIONS } from '../artifacts/statModel'
import { GAME_DATA } from '../artifacts/gameData'
export function getRecognitionProblems(draft: ArtifactDraft): string[] {
  const errors = validateDraft(draft).filter(issue => issue.severity === 'error').map(issue => {
    const index = issue.field.match(/^subs\.(\d+)$/)?.[1]
    const stat = index === undefined ? undefined : draft.subs[Number(index)]
    if (stat && issue.code === 'invalid' && issue.message.includes('合法范围')) {
      const definition = STAT_DEFINITIONS[stat.key], bounds = GAME_DATA.subBounds[stat.key]
      if (definition && bounds) return `${definition.label}：OCR 识别为 ${stat.value}${definition.percent ? '%' : ''}，超出五星副词条范围 ${bounds.min}～${bounds.max}；请重新识别。`
    }
    return issue.message
  })
  if (draft.subs.length < (draft.level !== undefined && draft.level >= 4 ? 4 : 3)) errors.push('副词条未识别完整。')
  for (const stat of [...(draft.main ? [draft.main] : []), ...draft.subs]) {
    const definition = STAT_DEFINITIONS[stat.key]
    if (!definition || !Number.isFinite(stat.value)) continue
    const scaled = stat.value * (definition.percent ? 10 : 1)
    if (Math.abs(scaled - Math.round(scaled)) > 1e-6) errors.push(`${definition.label}：OCR 识别为 ${stat.value}${definition.percent ? '%' : ''}，游戏显示应为${definition.percent ? '一位小数' : '整数'}；请重新识别，不会自动四舍五入。`)
  }
  return errors
}
