import type { ArtifactSetKey, ArtifactSlot } from './types'
import type { StatValue } from './statModel'
import type { CaptureRoi } from '../capture/captureRegion'
import type { OcrSession } from './ocrService'
import { getRecognitionProblems } from '../imports/recognitionCheck'
import { isOcrImageRejection } from './ocrImageRejection'
export type OcrBenchmarkExpected = { setKey: ArtifactSetKey; slot: ArtifactSlot; name?: string; level: number; main: StatValue; subs: StatValue[]; pendingSubs?: StatValue[] }
export type OcrBenchmarkCase = { id: string; image: Blob; roi: CaptureRoi; expected?: OcrBenchmarkExpected; shouldReject?: boolean }
export async function runOcrBenchmark(cases: OcrBenchmarkCase[], session: OcrSession) {
  const failures: { id: string; fields: string[] }[] = []
  let exact = 0, accepted = 0, rejected = 0, falseAccepted = 0, negativePassed = 0
  for (const item of cases) {
    if (!item.expected && item.shouldReject !== true) throw Error('基准样本缺少期望字段或拒识声明。')
    const fields: string[] = []
    try {
      const { draft } = await session.recognize(item.image, item.roi)
      const ready = getRecognitionProblems(draft).length === 0
      if (ready) accepted++; else rejected++
      if (item.shouldReject) {
        if (ready) { falseAccepted++; fields.push('negative-accepted') } else negativePassed++
      } else {
        const expected = item.expected!
        if (expected.name !== undefined && draft.name !== expected.name) fields.push('name')
        for (const field of ['setKey', 'slot', 'level'] as const) if (draft[field] !== expected[field]) fields.push(field)
        if (draft.main?.key !== expected.main.key || draft.main.value !== expected.main.value) fields.push('main')
        for (const stat of expected.subs) if (draft.subs.filter(sub => sub.key === stat.key && sub.value === stat.value).length !== 1) fields.push(`subs.${stat.key}`)
        if (draft.subs.length !== expected.subs.length || draft.subs.some(sub => !expected.subs.some(stat => sub.key === stat.key && sub.value === stat.value))) fields.push('subs')
        const pending = draft.pendingSubs ?? [], wanted = expected.pendingSubs ?? []
        if (pending.length !== wanted.length || pending.some(sub => wanted.filter(stat => sub.key === stat.key && sub.value === stat.value).length !== 1)) fields.push('pendingSubs')
        if (!ready) fields.push('not-confirmable')
        if (!fields.length) exact++
        else if (ready) falseAccepted++
      }
    } catch (error) {
      rejected++
      if (item.shouldReject && isOcrImageRejection(error)) negativePassed++
      else fields.push(`recognize: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (fields.length) failures.push({ id: item.id, fields })
  }
  return { total: cases.length, readable: cases.filter(item => !item.shouldReject).length, exact, accepted, rejected, falseAccepted, negativePassed, failures }
}
