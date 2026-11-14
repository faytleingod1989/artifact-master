import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { Grid2X2, List } from 'lucide-react'
import type { ArtifactRecord } from '../artifacts/types'
import { ArtifactGrid } from './ArtifactGrid'
import { ArtifactList } from './ArtifactList'
import type { ScoringOptions } from '../scoring'
import { ArtifactDetails } from './ArtifactDetails'
import { ArtifactCompare } from './ArtifactCompare'
import { WarehouseFilters } from './WarehouseFilters'
import { filterAndSort, type WarehouseSort } from './warehouseModel'
import { createWarehouseSession, type WarehouseSession } from './warehouseSession'
export type WarehouseProps = { records: ArtifactRecord[]; scope: 'all' | 'character'; characterName?: string; scoringOptions?: ScoringOptions; onScopeChange: (scope: 'all' | 'character') => void; onEdit: (id: number) => void; onCopy: (id: number) => void; onToggleLock: (id: number) => void; onBulkTrash: (ids: number[]) => void; onQueue: (ids: number[]) => void; session?: WarehouseSession; onSessionChange?: Dispatch<SetStateAction<WarehouseSession>> }
export function Warehouse(props: WarehouseProps) {
  const [localSession, setLocalSession] = useState(createWarehouseSession)
  const { view, filters, sort, selectedIds, detailId, comparing, evaluation } = props.session ?? localSession
  const changeSession = props.onSessionChange ?? setLocalSession
  const setView = (view: WarehouseSession['view']) => changeSession(current => ({ ...current, view }))
  const setFilters = (filters: WarehouseSession['filters']) => changeSession(current => ({ ...current, filters }))
  const setSort = (sort: WarehouseSort) => changeSession(current => ({ ...current, sort }))
  const setSelectedIds = (next: number[] | ((ids: number[]) => number[])) => changeSession(current => ({ ...current, selectedIds: typeof next === 'function' ? next(current.selectedIds) : next }))
  const setDetailId = (detailId: number) => changeSession(current => ({ ...current, detailId }))
  const setComparing = (comparing: boolean) => changeSession(current => ({ ...current, comparing }))
  const visible = useMemo(() => filterAndSort(props.records, filters, sort), [props.records, filters, sort])
  const selected = props.records.filter(record => selectedIds.includes(record.id))
  const visibleSelected = visible.filter(record => selectedIds.includes(record.id))
  const unlockedVisibleSelected = visibleSelected.filter(record => !record.locked)
  const detail = detailId === undefined ? visible[0] : visible.find(record => record.id === detailId)
  const hidden = selected.filter(record => !visible.some(item => item.id === record.id)).length
  const changeView = (value: 'grid' | 'list') => { setView(value); try { localStorage.setItem('artifact-master:warehouse-view-v1', value) } catch { /* UI remains usable with unavailable preferences. */ } }
  const trash = (ids: number[]) => {
    const eligible = visible.filter(record => ids.includes(record.id) && !record.locked).map(record => record.id)
    if (!eligible.length) return
    if (window.confirm(`将当前可见且未锁定的 ${eligible.length} 件圣遗物移入回收站？可在回收站恢复。`)) {
      props.onBulkTrash(eligible)
      setSelectedIds(current => current.filter(id => !eligible.includes(id)))
      setComparing(false)
    }
  }
  const collectionProps = { records: visible, selectedIds: selected.map(item => item.id), detailId: detail?.id, onDetail: setDetailId, onSelect: (id: number) => setSelectedIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]) }
  return <section className="warehouse-shell" id="inventory"><WarehouseFilters value={filters} onChange={setFilters} /><div className="warehouse-center"><div className="warehouse-inventory-head"><div><h2>库存藏品</h2><p>共 {visible.length} 件 / 库存 {props.records.length} 件</p></div><div className="warehouse-view-switch"><button aria-label="图标视图" aria-pressed={view === 'grid'} onClick={() => changeView('grid')}><Grid2X2 size={18} /></button><button aria-label="列表视图" aria-pressed={view === 'list'} onClick={() => changeView('list')}><List size={18} /></button></div></div><div className="warehouse-sort-row"><div className="warehouse-scope"><button aria-pressed={props.scope === 'all'} onClick={() => props.onScopeChange('all')}>全部库存</button><button aria-pressed={props.scope === 'character'} onClick={() => props.onScopeChange('character')}>按角色查看</button></div><label>排序方式<select value={sort} onChange={e => setSort(e.target.value as WarehouseSort)}><option value="level">等级降序</option><option value="cv">副词条双暴降序</option><option value="recharge">副词条充能降序</option></select></label></div>{props.scope === 'character' && <p className="warehouse-note">{props.characterName} · 规则初评候选（不代表最优配装）</p>}<div className="warehouse-collection">{visible.length ? view === 'grid' ? <ArtifactGrid {...collectionProps} /> : <ArtifactList {...collectionProps} /> : <div className="warehouse-empty">没有符合条件的圣遗物<p>{props.records.length ? '试试重置筛选条件。' : '通过实时采集、手动录入或 UID 展柜开始建立仓库。'}</p></div>}</div><footer className="warehouse-batch"><div><strong>已选 {selected.length} 件</strong>{hidden > 0 && <small>其中 {hidden} 件被筛选隐藏</small>}</div><div><button disabled={!visible.length} onClick={() => setSelectedIds(current => Array.from(new Set([...current, ...visible.map(item => item.id)])))}>选择当前结果</button><button disabled={!selected.length} onClick={() => setSelectedIds([])}>取消选择</button><button disabled={visibleSelected.length !== 2} onClick={() => setComparing(true)}>对比所选</button><button disabled={!visibleSelected.length} onClick={() => props.onQueue(visibleSelected.filter(item => item.level < 20).map(item => item.id))}>加入队列</button><button disabled={!unlockedVisibleSelected.length} onClick={() => trash(unlockedVisibleSelected.map(item => item.id))}>批量移入回收站</button></div></footer></div>{comparing && visibleSelected.length === 2 ? <ArtifactCompare left={visibleSelected[0]} right={visibleSelected[1]} onClose={() => setComparing(false)} /> : detail ? <ArtifactDetails comparison={evaluation} onComparisonChange={evaluation => changeSession(current => ({ ...current, evaluation }))} scoringOptions={props.scoringOptions} record={detail} characterName={props.characterName} onEdit={() => props.onEdit(detail.id)} onCopy={() => props.onCopy(detail.id)} onToggleLock={() => props.onToggleLock(detail.id)} onTrash={() => trash([detail.id])} onQueue={() => props.onQueue([detail.id])} /> : <aside className="warehouse-details warehouse-detail-empty">选择一件藏品查看详情</aside>}</section>
}
