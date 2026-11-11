import type { PageObservation } from './pageScanTypes'
export function validatePageObservation(value: PageObservation, sourceId: string): void {
  if (!value || value.sourceId !== sourceId || ![value.width, value.height, value.frameSequence].every(Number.isSafeInteger) || value.width < 1 || value.height < 1 || value.width > 8192 || value.height > 8192 || value.width * value.height > 33554432 || value.frameSequence < 1 || typeof value.geometryKey !== 'string' || value.geometryKey.length > 128 || typeof value.pageSignature !== 'string' || value.pageSignature.length > 128 || typeof value.detailSignature !== 'string' || value.detailSignature.length > 128 || !Array.isArray(value.cells) || value.cells.length > 60) throw Error('窗口来源或页面布局无效。')
  const seen = new Set<string>()
  for (const cell of value.cells) {
    if (!/^r\d{1,2}c\d{1,2}$/.test(cell.id) || seen.has(cell.id) || !Number.isInteger(cell.row) || !Number.isInteger(cell.col) || cell.row < 0 || cell.col < 0 || cell.row > 15 || cell.col > 15 || cell.id !== `r${cell.row}c${cell.col}` || cell.rarity !== 5 || typeof cell.selected !== 'boolean') throw Error('页面格位无效，只采集五星。')
    seen.add(cell.id)
  }
  if (value.selectedCellId !== undefined && !seen.has(value.selectedCellId)) throw Error('选中格位不属于当前页面。')
}
