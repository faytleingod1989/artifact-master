import { DEFAULT_FILTERS, type WarehouseFilters, type WarehouseSort } from './warehouseModel'
export type WarehouseSession = { view: 'grid' | 'list'; filters: WarehouseFilters; sort: WarehouseSort; selectedIds: number[]; detailId?: number; comparing: boolean; evaluation?: { characterName: string; buildId: string } }
export function createWarehouseSession(): WarehouseSession {
  let view: 'grid' | 'list' = 'grid'
  try { if (localStorage.getItem('artifact-master:warehouse-view-v1') === 'list') view = 'list' } catch { /* Preferences are optional. */ }
  return { view, filters: { ...DEFAULT_FILTERS }, sort: 'level', selectedIds: [], comparing: false }
}
