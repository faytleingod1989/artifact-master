import type { NativeOcrBridge, NativeOcrLine } from './nativeOcrTypes'
import type { OcrSession, OcrDraftResult } from './ocrService'
import { detectArtifactDetail } from './detailDetection'
import { cropDetailRegion } from '../capture/captureRegion'
import { parseArtifactOcr } from './artifactOcr'
import { ocrToDraft } from '../imports/manualDraft'
import { parseStat, STAT_DEFINITIONS } from './statModel'
import { GAME_DATA } from './gameData'
import { unwrapOcrReply } from './ocrErrors'
import { detectArtifactFieldLayout } from './artifactFieldLayout'
import { readNativeOcrMode } from './ocrPreferences'
import { parseEquippedCharacter, prepareEquippedFooter } from '../capture/captureMetadata'

const cleanBullet = (text: string) => text.replace(/^[·•・?？:：\s]+/u, '').trim()
export function groupedText(lines: NativeOcrLine[]): { text: string; ignored: string[]; ignoredLines: NativeOcrLine[] } {
  const groups: Array<{ y: number; height: number; lines: NativeOcrLine[] }> = []
  for (const line of [...lines].sort((a, b) => Math.min(...a.box.map(p => p[1])) - Math.min(...b.box.map(p => p[1])))) {
    const top = Math.min(...line.box.map(p => p[1])), bottom = Math.max(...line.box.map(p => p[1])), y = (top + bottom) / 2, height = bottom - top
    const last = groups.at(-1)
    if (last && Math.abs(last.y - y) <= Math.min(last.height, height) * .5) last.lines.push(line)
    else groups.push({ y, height, lines: [line] })
  }
  const ignored: string[] = [], ignoredLines: NativeOcrLine[] = []
  const rows = groups.map(group => {
    const words = group.lines.sort((a,b) => Math.min(...a.box.map(p => p[0])) - Math.min(...b.box.map(p => p[0]))).map(line => cleanBullet(line.text))
    // Only a separate, observed single-glyph fragment beside a complete stat;
    // never trim embedded characters, digits, units, or dormant annotations.
    if (words.length === 2 && words[1] === '可' && parseStat(words[0])) { ignored.push(words[1]); ignoredLines.push(group.lines[1]); return words[0] }
    return words.join(' ')
  })
  const levelIndex = rows.findIndex(text => /^\+\d{1,2}$/.test(text.trim()))
  const labels = new Set(Object.values(STAT_DEFINITIONS).map(stat => stat.label))
  for (let i = 0; i < rows.length - 1 && (levelIndex < 0 || i < levelIndex); i++) {
    const label = rows[i].replace(/[：:\s]+$/, '')
    if (labels.has(label) && /^\d[\d,]*(?:\.\d+)?%?$/.test(rows[i + 1].trim())) { rows.splice(i, 2, `${label} ${rows[i + 1].trim()}`); break }
  }
  return { text: rows.join('\n'), ignored, ignoredLines }
}
function withoutSlotIcons(lines: NativeOcrLine[], width: number): NativeOcrLine[] {
  const slot = lines.find(line => /^(生之花|死之羽|时之沙|空之杯|理之冠)$/.test(line.text.trim()))
  if (!slot) return lines
  const center = (line: NativeOcrLine) => line.box.reduce((sum, point) => sum + point[1], 0) / 4
  const slotHeight = Math.max(...slot.box.map(p => p[1])) - Math.min(...slot.box.map(p => p[1]))
  return lines.filter(line => !(line !== slot && /^[\d☆★⭐🌟]+$/u.test(line.text.trim()) && Math.min(...line.box.map(p => p[0])) > width * .65 && Math.abs(center(line) - center(slot)) < slotHeight * .6))
}
function asDataUrl(image: Blob): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(Error('无法准备本地 OCR 图像。')); reader.readAsDataURL(new Blob([image], { type: 'image/png' })) })
}
export async function createNativeOcrSession(bridge: NativeOcrBridge, options: { mode?: 'auto' | 'general'; captureMetadata?: boolean } = {}): Promise<OcrSession> {
  const session = unwrapOcrReply(await bridge.open())
  const mode = options.mode ?? readNativeOcrMode()
  let disposed = false, tail: Promise<unknown> = Promise.resolve()
  return {
    recognize(image, roi) {
      const job = tail.catch(() => {}).then(async (): Promise<OcrDraftResult> => {
        if (disposed) throw Error('识别会话已经结束。')
        const started = performance.now()
        const located = roi ? { image: await cropDetailRegion(image, roi), roi } : await detectArtifactDetail(image)
        const locatedAt = performance.now()
        const layout = mode === 'auto' ? await detectArtifactFieldLayout(located.image).catch(() => null) : null
        const encoded = await asDataUrl(located.image), preparedAt = performance.now()
        if (disposed) throw Error('识别会话已经结束。')
        const result = unwrapOcrReply(await bridge.recognize(session, encoded, { protocolVersion: 2, mode, ...(layout ? { layout } : {}) })), recognizedAt = performance.now()
        if (disposed) throw Error('识别会话已经结束。')
        const semanticLines = withoutSlotIcons(result.lines, result.width)
        const grouped = groupedText(semanticLines), text = grouped.text, draft = ocrToDraft(parseArtifactOcr({ title: text.split('\n').slice(0, 2).join('\n'), stats: text, set: text }), 'screenshot')
        for (const glyph of grouped.ignored) draft.issues.push({ field: 'source', code: 'ocr-fragment', severity: 'warning', message: `词条旁的独立字符“${glyph}”未并入数值，请对照原图核实。` })
        const occluded = semanticLines.filter(line => line.occluded)
        for (const field of result.conflicts ?? []) draft.issues.push({ field: 'source', code: 'ocr-conflict', severity: 'error', message: `同图识别数值存在冲突（${field}），未自动选择其中一个数值，请重新采集。` })
        for (const line of occluded) draft.issues.push({ field: 'source', code: 'occluded', severity: 'error', message: `文字被亮光或特效遮挡，未采用本帧数值：${line.text}` })
        for (const line of semanticLines.filter(line => !grouped.ignoredLines.includes(line) && line.score < .75 && /[\u3400-\u9fff\d]/.test(line.text))) draft.issues.push({ field: 'source', code: 'low-confidence', severity: 'error', message: `识别置信度不足，请重新采集：${line.text}` })
        const identityEvidence = result.lines.filter(line => !line.occluded && line.score >= .75).flatMap(line => {
          if (!/[+＋]/.test(line.text)) return []
          const stat = parseStat(cleanBullet(line.text)), bounds = stat ? GAME_DATA.subBounds[stat.key] : undefined
          const precision = stat && STAT_DEFINITIONS[stat.key].percent ? 10 : 1
          return stat && bounds && stat.value >= bounds.min && stat.value <= bounds.max && Math.abs(stat.value * precision - Math.round(stat.value * precision)) < 1e-6 ? [stat] : []
        })
        let footerText = '', metadataMs = 0
        if (options.captureMetadata) {
          const metadataStarted = performance.now()
          try {
            const footer = await prepareEquippedFooter(image)
            if (footer && !disposed) {
              const metadata = unwrapOcrReply(await bridge.recognize(session, await asDataUrl(footer), { protocolVersion: 2, mode: 'general' }))
              footerText = metadata.lines.map(line => line.text).join(' ')
              const role = metadata.lines.filter(line => line.score >= .92 && !line.occluded).map(line => parseEquippedCharacter(line.text)).filter((id): id is number => id !== undefined)
              if (role.length === 1) draft.sourceCharacterId = role[0]
            }
          } catch (error) {
            if (error && typeof error === 'object' && 'kind' in error && error.kind === 'engine-unavailable') throw error
            footerText = '装备角色未确认（不影响核心词条）'
          }
          metadataMs = Math.round(performance.now() - metadataStarted)
          if (disposed) throw Error('识别会话已经结束。')
        }
        const ended = performance.now()
        return { draft, rawText: `【引擎】PP-OCRv5-server（本地 CPU）\n【路径】${result.route ?? 'general'}${result.fallbackReason ? `；复核：${result.fallbackReason}` : ''}\n【分组识别】\n${text}\n【区域原始识别记录】\n${result.lines.map(line => line.text).join('\n')}${result.primaryLines ? `\n【快速路径原始字段】\n${result.primaryLines.map(line => `${line.text} [${line.score.toFixed(3)}]`).join('\n')}` : ''}${options.captureMetadata ? `\n【同帧装备角色】\n${footerText || '未知'}` : ''}`, engine: 'PP-OCRv5-server', route: result.route ?? 'general', fallbackReason: result.fallbackReason, confidence: result.lines.length ? result.lines.reduce((sum,line) => sum + line.score, 0) / result.lines.length * 100 : 0, detailImage: located.image, detailRoi: located.roi, identityEvidence,
          timings: { locateMs: Math.round(locatedAt - started), prepareMs: Math.round(preparedAt - locatedAt), ocrMs: Math.round(recognizedAt - preparedAt), parseMs: Math.max(0, Math.round(ended - recognizedAt) - metadataMs), totalMs: Math.round(ended - started), ...result.timings, ...(options.captureMetadata ? { metadataMs } : {}) }, ...(occluded.length ? { retryHint: 'occluded' as const } : {}) }
      })
      tail = job; return job
    },
    async dispose() { if (!disposed) { disposed = true; await bridge.close(session) } },
  }
}
