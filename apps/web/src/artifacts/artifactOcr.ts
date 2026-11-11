import { ARTIFACT_SET_NAME_ALIASES } from './catalog.aliases'
import { FIVE_STAR_ARTIFACT_SETS, findArtifactSetByName } from './catalog'
import { ARTIFACT_SLOTS, type ArtifactSlot } from './types'
import { GAME_DATA } from './gameData'
import { STAT_LABELS, normalizeStatOcrText } from './ocrStatText'

export type ArtifactOcrRegion = { id: 'title' | 'stats' | 'set'; x: number; y: number; width: number; height: number }
export type ArtifactOcrText = { title: string; stats: string; set: string }
export type ParsedArtifactOcr = { name?: string; set?: string; slot?: ArtifactSlot; level?: number; main?: string; subs: string[]; pendingSubs?: string[]; warnings?: string[] }

const RELATIVE_REGIONS: Array<[ArtifactOcrRegion['id'], number, number, number, number]> = [
  ['title', .61, .01, .38, .18],
  ['stats', .61, .17, .38, .30],
  ['set', .61, .44, .38, .14],
]

export function getArtifactOcrRegions(width: number, height: number): ArtifactOcrRegion[] | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width / height < 1.3) return null
  return RELATIVE_REGIONS.map(([id, xRatio, yRatio, widthRatio, heightRatio]) => {
    const x = Math.round(width * xRatio)
    const y = Math.round(height * yRatio)
    const regionWidth = Math.min(Math.round(width * widthRatio), width - x)
    const regionHeight = Math.min(Math.round(height * heightRatio), height - y)
    return { id, x, y, width: regionWidth, height: regionHeight }
  })
}

const STAT_PATTERN = new RegExp(`^(${STAT_LABELS.join('|')})\\s*([+＋-]?\\d[\\d,]*(?:\\.\\d+)?%?)$`)

function lines(text: string): string[] {
  return text.split(/\r?\n/).map((line) => line.replace(/(?<=[\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g, '').replace(/^[\s·•●。，.'"“”*°>—-]+/, '').replace(/\s+/g, ' ').trim()).filter(Boolean)
}

function parseLevel(titleLines: string[]): number | undefined {
  const tokens = titleLines.join(' ').match(/[+＋]\s*\d{1,3}/g) ?? []
  if (tokens.some((token) => Number(token.replace(/[+＋\s]/g, '')) > 20)) return undefined
  const valid = tokens.map((token) => Number(token.replace(/[+＋\s]/g, ''))).find((value) => value >= 0 && value <= 20)
  return valid
}

function findSet(text: string): string | undefined {
  const candidates = [...FIVE_STAR_ARTIFACT_SETS.map((entry) => entry.name), ...Object.keys(ARTIFACT_SET_NAME_ALIASES)]
    .sort((left, right) => right.length - left.length)
  const match = candidates.find((candidate) => text.includes(candidate))
  return match ? findArtifactSetByName(match)?.name : undefined
}

export function parseArtifactOcr(text: ArtifactOcrText): ParsedArtifactOcr {
  const warnings: string[] = []
  const titleLines = lines(text.title)
  const statsLines = lines(text.stats)
  const set = findSet(lines(text.set).join('\n'))
  const setKey = findArtifactSetByName(set ?? '')?.key
  let slot = ARTIFACT_SLOTS.find((candidate) => titleLines.some((line) => line.includes(candidate)))
  let name = titleLines.find((line) => !ARTIFACT_SLOTS.some((candidate) => line.includes(candidate)) && !/^[+＋]\s*\d{1,3}$/.test(line))
  const pieces = Object.values(GAME_DATA.pieceHashes).filter(piece => !setKey || piece.setKey === setKey)
  const named = uniqueNear(name ?? '', pieces.map(piece => piece.name))
  if (named) {
    const piece = pieces.find(piece => piece.name === named)!
    if (name !== named) warnings.push(`名称字典匹配：${name} → ${named}，请对照原图核实。`)
    name = named
    if (!slot) { slot = piece.slot; warnings.push('部位按已匹配单件名称核实，请对照原图。') }
  }
  if (!slot) for (const line of titleLines.slice(1)) { const matched = uniqueNear(line, [...ARTIFACT_SLOTS]); if (matched) { slot = matched as ArtifactSlot; warnings.push(`部位字典匹配：${line} → ${matched}，请核实。`); break } }
  const pendingSubs: string[] = []
  const statLines = statsLines.flatMap((line) => {
    const result = normalizeStatOcrText(line)
    warnings.push(...result.changes)
    let normalized = result.text.replace(/[|_，。'"“”\s]+$/, '').replace(/^[，。]+/, '')
    normalized = normalized.replace(/(?<=[\u3400-\u9fff])\s+[.:：]\s+(?=\d)/, ' ')
    const grouped = normalized.match(/^(生命值|攻击力|防御力)\s*([+＋]?\d{1,2})\.(\d{3})$/)
    if (grouped) { normalized = `${grouped[1]} ${grouped[2]},${grouped[3]}`; warnings.push('整数词条的千位分隔符格式匹配（数字字符未变），请对照原图核实。') }
    const prefix = normalized.match(/^([\u3400-\u9fff]+)(.*)$/)
    if (prefix && !STAT_LABELS.includes(prefix[1])) {
      const matched = uniqueNear(prefix[1], STAT_LABELS)
      if (matched) { normalized = matched + prefix[2]; warnings.push(`词条类型字典匹配：${prefix[1]} → ${matched}，数字未改动。`) }
    }
    const pending = /[（(]\s*待激活\s*[）)]?\s*$/.test(normalized)
    if (pending) normalized = normalized.replace(/[（(]\s*待激活\s*[）)]?\s*$/, '').trim()
    const match = normalized.match(STAT_PATTERN)
    const values = match ? [`${match[1]} ${match[2].replace(/＋/g, '+')}`] : STAT_LABELS.some(label => normalized.startsWith(label)) && /\d/.test(normalized) ? [normalized] : []
    if (pending) { pendingSubs.push(...(values.length ? values : [normalized])); return [] }
    return values
  })
  return {
    ...(name ? { name } : {}),
    ...(set ? { set } : {}),
    ...(slot ? { slot } : {}),
    level: parseLevel([
      ...titleLines,
      ...statsLines.filter((line) => /^[+＋]\s*\d{1,3}$/.test(line)),
    ]),
    ...(statLines[0] ? { main: statLines[0] } : {}),
    subs: statLines.slice(1),
    ...(pendingSubs.length ? { pendingSubs } : {}),
    ...(warnings.length ? { warnings } : {}),
  }
}

function uniqueNear(input: string, choices: readonly string[]): string | undefined {
  const compact = input.replace(/[^\u3400-\u9fff]/g, '')
  const exact = choices.find(choice => compact === choice)
  if (exact) return exact
  const near = [...new Set(choices)].filter(choice => compact.length >= 3 && compact.length === choice.length && [...choice].filter((char, index) => char !== compact[index]).length <= 1)
  return near.length === 1 ? near[0] : undefined
}
