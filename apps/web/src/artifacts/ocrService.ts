import { createWorker } from 'tesseract.js'
import { cropDetailRegion, type CaptureRoi } from '../capture/captureRegion'
import { ocrToDraft } from '../imports/manualDraft'
import type { ArtifactDraft } from './artifactDraft'
import { parseArtifactOcr, type ArtifactOcrText } from './artifactOcr'
import { formatArtifactOcrText, prepareDetailOcrImages } from './artifactOcrImage'
import { parseStat, STAT_DEFINITIONS, getExpectedMain, type StatValue } from './statModel'
import { detectArtifactDetail } from './detailDetection'
import { GAME_DATA } from './gameData'
import { normalizeStatOcrText } from './ocrStatText'
import { createNativeOcrSession } from './nativeOcrService'
import type { NativeOcrRoute } from './nativeOcrTypes'
export type OcrTimings = { locateMs: number; prepareMs: number; ocrMs: number; parseMs: number; totalMs: number; decodeMs?: number; detMs?: number; recMs?: number; metadataMs?: number }
export type OcrDraftResult = { draft: ArtifactDraft; rawText: string; confidence: number; detailImage?: Blob; detailRoi?: CaptureRoi; retryHint?: 'occluded'; timings?: OcrTimings; identityEvidence?: StatValue[]; engine?: 'PP-OCRv5-server'; route?: NativeOcrRoute; fallbackReason?: string }
export type OcrSession = { recognize: (image: Blob, roi?: CaptureRoi) => Promise<OcrDraftResult>; dispose: () => Promise<void> }
export async function createOcrSession(options: { captureMetadata?: boolean } = {}): Promise<OcrSession> {
  if (window.artifactDesktop?.nativeOcr) return createNativeOcrSession(window.artifactDesktop.nativeOcr, options)
  const base = new URL(`${import.meta.env.BASE_URL}ocr/`, document.baseURI)
  const local = (relative: string) => new URL(relative, base).href
  try {
    const checks = await Promise.all(['resources.json', 'worker/worker.min.js', 'core/tesseract-core-lstm.wasm.js', 'lang/chi_sim.traineddata', 'lang/eng.traineddata'].map(path => fetch(local(path), { method: 'HEAD' })))
    if (checks.some(response => !response.ok)) throw new Error('missing')
  } catch { throw new Error('本地识别资源缺失或无法读取，请使用完整离线安装包；不会回退在线下载。') }
  // The v7 relaxed-SIMD float-model path currently aborts (upstream #1080).
  // Use the portable local core explicitly; do not switch models or fetch a CDN.
  const worker = await createWorker('chi_sim+eng', 1, { workerPath: local('worker/worker.min.js'), corePath: local('core/tesseract-core-lstm.wasm.js'), langPath: local('lang/'), workerBlobURL: false, gzip: false, cacheMethod: 'none' })
  let disposed = false; let terminated: Promise<unknown> | undefined; let tail: Promise<unknown> = Promise.resolve()
  try { await worker.setParameters({ tessedit_pageseg_mode: '7' as never, preserve_interword_spaces: '1' }) }
  catch (error) { await worker.terminate(); throw error }
  let language = 'chi_sim+eng'
  return {
    recognize(image, roi) {
      if (disposed) return Promise.reject(new Error('识别会话已经结束。'))
      const job = tail.catch(() => {}).then(async () => {
        if (disposed) throw new Error('识别会话已经结束。')
        const started = performance.now()
        const located = roi ? { image: await cropDetailRegion(image, roi), roi } : await detectArtifactDetail(image)
        const locatedAt = performance.now()
        const detail = located.image
        const regions = await prepareDetailOcrImages(detail)
        const preparedAt = performance.now()
        const text: ArtifactOcrText = { title: '', stats: '', set: '' }; const confidence: number[] = []
        const diagnostics: string[] = []
        const textCorrections: string[] = []
        const identityEvidence: StatValue[] = []
        const mainNumbers: string[] = []; let restoredPercentUnit = false
        for (const region of regions) {
          if (disposed) throw new Error('识别会话已经结束。')
          const requested = region.numeric ? 'eng' : 'chi_sim'
          if (language !== requested) { await worker.reinitialize(requested, 1); language = requested }
          await worker.setParameters({ tessedit_pageseg_mode: '7' as never, preserve_interword_spaces: '1', tessedit_char_whitelist: region.numeric ? '0123456789.,%+' : '' })
          const result = await worker.recognize(region.image, {}, { text: true, blocks: true })
          diagnostics.push(`${region.id}：${result.data.text}`)
          let recognizedText = result.data.text
          if (region.id === 'stats' && !region.numeric) {
            const normalized = normalizeStatOcrText(recognizedText)
            recognizedText = normalized.text; textCorrections.push(...normalized.changes)
          }
          const clearLevel = region.numeric && !region.join && /^\+\d{1,2}$/.test(recognizedText.trim()) && Number(recognizedText.trim().slice(1)) <= 20
          if (region.numeric && !clearLevel) {
            await worker.setParameters({ tessedit_pageseg_mode: '13' as never })
            const alternate = await worker.recognize(region.image)
            const clean = (text: string) => text.trim().replace(/\s/g, '').replace(/^[^+\d]+/, '')
            const primaryText = clean(recognizedText), alternateText = clean(alternate.data.text)
            if (region.join) mainNumbers.push(primaryText, alternateText)
            diagnostics.push(`数字整行复核：${alternate.data.text}`)
            const validNumber = (value: string) => /^[+]?\d[\d,]*(?:\.\d+)?$/.test(value) || /^[+]?\d+\.\d%$/.test(value)
            if (validNumber(alternateText) && (!validNumber(primaryText) || alternate.data.confidence > result.data.confidence)) recognizedText = alternateText + '\n'
            else recognizedText = primaryText + '\n'
            if (region.rawImage) {
              await worker.setParameters({ tessedit_pageseg_mode: '7' as never })
              const native = await worker.recognize(region.rawImage)
              const nativeText = clean(native.data.text)
              if (region.join) mainNumbers.push(nativeText)
              diagnostics.push(`原色数字复核：${native.data.text}`)
              if (validNumber(nativeText) && (!validNumber(recognizedText.trim()) || native.data.confidence >= Math.max(result.data.confidence, alternate.data.confidence))) recognizedText = nativeText + '\n'
            }
          }
          // A second number after '%' is ambiguous text, not harmless OCR
          // punctuation. Keep it intact so parsing rejects it instead of
          // silently turning, for example, 3.5%2 into an accepted 3.5%.
          const ambiguousNumber = /[%％][^\u3400-\u9fff]*\d/.test(recognizedText)
          // Never reconstruct away dormant-state annotations while simplifying
          // or rechecking a numeric row. Keep its observed digits for strict
          // pending-stat parsing, including invalid extra decimal places.
          const dormantRow = /待\s*激\s*活/.test(recognizedText)
          if (region.id === 'stats' && !region.numeric && !ambiguousNumber && !dormantRow) {
            const direct = recognizedText.match(/^\s*[^\u3400-\u9fff]*([\u3400-\u9fff]{3,8})\s*[+＋]\s*(\d[\d,]*(?:\.\d+)?%?)/)
            const directStat = direct ? parseStat(`${direct[1]} ${direct[2]}`) : null
            const bounds = directStat ? GAME_DATA.subBounds[directStat.key] : undefined
            const precision = directStat && STAT_DEFINITIONS[directStat.key].percent ? 10 : 1
            if (directStat && bounds && directStat.value >= bounds.min && directStat.value <= bounds.max && Math.abs(directStat.value * precision - Math.round(directStat.value * precision)) < 1e-6) {
              recognizedText = `${direct![1]} +${direct![2]}\n`
            } else {
              const symbols = result.data.blocks?.flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines.flatMap(line => line.words.flatMap(word => word.symbols)))) ?? []
              const plus = symbols.findIndex(symbol => symbol.text === '+' || symbol.text === '＋')
              const prefix = recognizedText.match(/^\s*[^\u3400-\u9fff]*([\u3400-\u9fff]{3,8})\s*[+＋]/)?.[1]
              if (plus >= 0 && prefix) {
                const numeric = symbols.slice(plus).filter(symbol => /^[+＋\d.,%]$/.test(symbol.text))
                if (numeric.length >= 2) {
                  // Keep contiguous glyphs after '+', including a % misread as Chinese.
                  // Filtering before measuring used to cut that glyph out of the retry image.
                  const span = [symbols[plus]]
                  for (const symbol of symbols.slice(plus + 1)) {
                    const last = span.at(-1)!
                    if (symbol.bbox.x0 - last.bbox.x1 > Math.max(12, last.bbox.y1 - last.bbox.y0)) break
                    span.push(symbol)
                  }
                  const left = Math.max(0, numeric[0].bbox.x0 - 4)
                  const top = region.height ? 0 : Math.max(0, Math.min(...span.map(symbol => symbol.bbox.y0)) - 4)
                  const bottom = region.height ?? Math.max(...span.map(symbol => symbol.bbox.y1)) + 4
                  const right = Math.min(region.width ?? Infinity, Math.max(...span.map(symbol => symbol.bbox.x1)) + Math.max(4, Math.round((bottom - top) * .6)))
                  await worker.reinitialize('eng', 1); language = 'eng'
                  await worker.setParameters({ tessedit_pageseg_mode: '7' as never, tessedit_char_whitelist: '0123456789.,%+' })
                  const numbers = await worker.recognize(region.image, { rectangle: { left, top, width: right - left, height: bottom - top } })
                  const normalizeUnit = (candidate: string) => {
                    const definitions = Object.values(STAT_DEFINITIONS).filter(definition => definition.label === prefix)
                    if (definitions.length && definitions.every(definition => definition.percent) && /^[+]?\d+\.\d$/.test(candidate)) { restoredPercentUnit = true; return candidate + '%' }
                    return candidate
                  }
                  let value = normalizeUnit(numbers.data.text.trim().replace(/\s/g, ''))
                  diagnostics.push(`数字区域候选：${numbers.data.text}`)
                  const originalNumber = recognizedText.match(/[+＋]\s*(\d[\d,]*(?:\.\d+)?%?)/)?.[1]
                  const original = originalNumber ? parseStat(`${prefix} ${originalNumber}`) : null
                  const displayPrecisionValid = original && (STAT_DEFINITIONS[original.key].percent ? Number.isInteger(Math.round(original.value * 1000) / 100) : Number.isInteger(original.value))
                  if (displayPrecisionValid) recognizedText = `${prefix} +${originalNumber}\n`
                  else {
                    await worker.setParameters({ tessedit_pageseg_mode: '13' as never })
                    const alternate = await worker.recognize(region.image, { rectangle: { left, top, width: right - left, height: bottom - top } })
                    diagnostics.push(`数字区域复核：${alternate.data.text}`)
                    const valid = (candidate: string) => { const stat = parseStat(`${prefix} ${candidate}`); return Boolean(stat && (STAT_DEFINITIONS[stat.key].percent ? /^\+?\d+\.\d%$/.test(candidate) : Number.isInteger(stat.value))) }
                    const alternative = normalizeUnit(alternate.data.text.trim().replace(/\s/g, ''))
                    if (valid(alternative) && (!valid(value) || alternate.data.confidence > numbers.data.confidence)) value = alternative
                    if (region.rawImage) {
                      await worker.setParameters({ tessedit_pageseg_mode: '7' as never })
                      const native = await worker.recognize(region.rawImage, { rectangle: { left, top, width: right - left, height: bottom - top } })
                      diagnostics.push(`原色词条数字复核：${native.data.text}`)
                      const nativeValue = normalizeUnit(native.data.text.trim().replace(/\s/g, ''))
                      if (valid(nativeValue) && (!valid(value) || native.data.confidence >= Math.max(numbers.data.confidence, alternate.data.confidence))) value = nativeValue
                    }
                    if (valid(value)) recognizedText = `${prefix} ${value}\n`
                  }
                }
              }
            }
          }
          // Comparison evidence only: visible rows with a known type and legal
          // display precision. A mismatch rejects the retry; these values are
          // never copied into the supplementary frame's result.
          if (region.subIndex && !region.occluded) {
            const sub = parseStat(recognizedText.trim()), bounds = sub ? GAME_DATA.subBounds[sub.key] : undefined
            const precision = sub && STAT_DEFINITIONS[sub.key].percent ? 10 : 1
            if (sub && bounds && sub.value >= bounds.min && sub.value <= bounds.max && Math.abs(sub.value * precision - Math.round(sub.value * precision)) < 1e-6) identityEvidence.push(sub)
          }
          if (region.join) text[region.id] = text[region.id].trimEnd() + ' '
          text[region.id] += recognizedText + '\n'; confidence.push(result.data.confidence)
        }
        if (disposed) throw new Error('识别会话已经结束。')
        const score = confidence.reduce((sum, value) => sum + value, 0) / confidence.length
        const parseStarted = performance.now()
        const draft = ocrToDraft(parseArtifactOcr(text), 'screenshot')
        const occludedRows = [...new Set(regions.filter(region => region.occluded && region.subIndex).map(region => region.subIndex!))]
        for (const row of occludedRows) draft.issues.push({ field: `subs.${row - 1}`, code: 'occluded', severity: 'error', message: `第${row}条副词条被亮光或特效遮挡，未采用本帧数值。` })
        for (const message of [...new Set(textCorrections)]) draft.issues.push({ field: 'source', code: 'text-normalized', severity: 'warning', message })
        if (draft.slot && draft.level !== undefined) {
          const compact = text.stats.replace(/\s/g, '')
          const label = Object.values(STAT_DEFINITIONS).map(definition => definition.label).find(label => compact.startsWith(label))
          if (label) for (const number of mainNumbers) {
            const parsed = parseArtifactOcr({ title: '', stats: label + ' ' + number, set: '' }).main
            const candidate = parsed ? parseStat(parsed) : null
            if (candidate && getExpectedMain(draft.slot, candidate.key, draft.level) === candidate.value) { draft.main = candidate; break }
          }
        }
        if (restoredPercentUnit) draft.issues.push({ field: 'subs', code: 'percent-unit', severity: 'warning', message: '百分比单位按已识别的词条类型标注，数字字符未改动，请对照原图核实。' })
        let parseMs = performance.now() - parseStarted
        if (draft.setKey && draft.slot && draft.level !== undefined && (!draft.main || getExpectedMain(draft.slot, draft.main.key, draft.level) !== draft.main.value)) {
          await worker.reinitialize('chi_sim+eng', 1); language = 'chi_sim+eng'
          await worker.setParameters({ tessedit_pageseg_mode: '6' as never, tessedit_char_whitelist: '' })
          const whole = await worker.recognize(detail)
          diagnostics.push(`完整详情主词条复核：${whole.data.text}`)
          const recheckParseStarted = performance.now()
          const candidate = ocrToDraft(parseArtifactOcr({ title: whole.data.text.split('\n').slice(0, 2).join('\n'), stats: whole.data.text, set: whole.data.text }), 'screenshot')
          if (candidate.setKey === draft.setKey && candidate.main && getExpectedMain(draft.slot, candidate.main.key, draft.level) === candidate.main.value) {
            draft.main = candidate.main
            draft.issues.push({ field: 'main', code: 'full-detail-recheck', severity: 'warning', message: '主词条通过同一详情的完整识别复核补充，请对照原图确认。' })
          }
          parseMs += performance.now() - recheckParseStarted
        }
        if (!Number.isFinite(score) || score < 70) draft.issues.push({ field: 'source', code: 'low-confidence', severity: 'warning', message: '识别置信度较低，请对照原图核实，不要直接接受数值。' })
        const ended = performance.now()
        const timings = { locateMs: Math.round(locatedAt - started), prepareMs: Math.round(preparedAt - locatedAt), ocrMs: Math.round(Math.max(0, ended - preparedAt - parseMs)), parseMs: Math.round(parseMs), totalMs: Math.round(ended - started) }
        return { draft, rawText: formatArtifactOcrText(text) + '\n【区域原始识别记录】\n' + diagnostics.join('\n'), confidence: Number.isFinite(score) ? score : 0, detailImage: detail, detailRoi: located.roi, timings, identityEvidence, ...(occludedRows.length ? { retryHint: 'occluded' as const } : {}) }
      })
      tail = job; return job
    },
    async dispose() { disposed = true; terminated ??= Promise.resolve(worker.terminate()); await terminated },
  }
}
