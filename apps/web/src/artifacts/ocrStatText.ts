import definitions from './statDefinitions.json'

export const STAT_LABELS = [...new Set(Object.values(definitions).map(item => item.label))].sort((a, b) => b.length - a.length)
export function normalizeStatOcrText(input: string): { text: string; changes: string[] } {
  let text = input.replace(/(?<=[\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g, '').replace(/^[\s·•●。，.'"“”*°>—|_-]+/, '').trim()
  const changes: string[] = []
  const prefix = text.match(/^([\u3400-\u9fff]+)(.*)$/s)
  if (prefix && !STAT_LABELS.includes(prefix[1])) {
    const matches = STAT_LABELS.filter(label => label.length >= 3 && label.length === prefix[1].length && [...label].filter((char, index) => char !== prefix[1][index]).length === 1)
    if (matches.length === 1) { text = matches[0] + prefix[2]; changes.push(`词条类型字典匹配：${prefix[1]} → ${matches[0]}，数字未改动。`) }
  }
  // Only discard decoration after ONE syntactically complete numeric token.
  // Extra digits, a second %, missing units, or Chinese suffixes stay visible
  // for the normal parser/validator; never round or trim them into legal values.
  const decorated = text.match(new RegExp(`^(${STAT_LABELS.join('|')})\\s*([+＋]?\\d[\\d,]*(?:\\.\\d+)?[%％]?)([\\s|_，。'"“”\\-–—]+)$`))
  if (decorated) { text = `${decorated[1]} ${decorated[2]}`; changes.push('已忽略词条末尾装饰符，数字和单位未改动，请对照原图。') }
  return { text, changes }
}
