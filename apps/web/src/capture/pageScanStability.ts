import type { PageObservation } from './pageScanTypes'
export function createPageStability() {
  let signature = '', sequence = 0, count = 0, since = 0
  return (observation: PageObservation, cellId: string | undefined, now: number): boolean => {
    if (observation.frameSequence <= sequence) return false
    sequence = observation.frameSequence
    const next = (cellId === undefined || observation.selectedCellId === cellId) && observation.pageSignature && observation.detailSignature ? JSON.stringify([cellId,observation.pageSignature,observation.detailSignature]) : ''
    if (!next || next !== signature) { signature = next; count = next ? 1 : 0; since = now; return false }
    count++
    return count >= 3 && now - since >= 120
  }
}
