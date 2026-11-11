import type { ArtifactDraft } from '../artifacts/artifactDraft'
import type { ArtifactSetKey, ArtifactSlot } from '../artifacts/types'
import type { ParsedArtifactOcr } from '../artifacts/artifactOcr'
import { findArtifactSetByName } from '../artifacts/catalog'
import { parseStat } from '../artifacts/statModel'
export function createManualDraft(setKey?: ArtifactSetKey, slot?: ArtifactSlot): ArtifactDraft {
  return { draftId: crypto.randomUUID(), setKey, slot, rarity: 5, subs: [], source: 'manual', issues: [] }
}
export function ocrToDraft(parsed: ParsedArtifactOcr, source: 'realtime' | 'screenshot'): ArtifactDraft {
  const draft = createManualDraft(findArtifactSetByName(parsed.set ?? '')?.key, parsed.slot)
  draft.source = source; draft.name = parsed.name; draft.level = parsed.level
  draft.main = parsed.main ? parseStat(parsed.main) ?? undefined : undefined
  draft.subs = parsed.subs.flatMap((text, index) => {
    const stat = parseStat(text)
    if (stat) return [stat]
    draft.issues.push({ field: `subs.${index}`, code: 'unparsed', severity: 'error', message: `未识别副词条，请核实原文：${text}` })
    return []
  })
  if (parsed.pendingSubs?.length) draft.pendingSubs = parsed.pendingSubs.flatMap((text, index) => {
    const stat = parseStat(text)
    if (stat) return [stat]
    draft.issues.push({ field: `pendingSubs.${index}`, code: 'unparsed', severity: 'error', message: `未识别待激活副词条，请核实原文：${text}` })
    return []
  })
  draft.issues.push({ field: 'source', code: 'ocr-review', severity: 'warning', message: 'OCR 结果需逐项核实，未经确认不会入库。' })
  for (const message of parsed.warnings ?? []) draft.issues.push({ field: 'source', code: 'dictionary-match', severity: 'warning', message })
  return draft
}
