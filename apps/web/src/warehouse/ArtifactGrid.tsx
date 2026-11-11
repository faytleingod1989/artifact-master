import { Lock } from 'lucide-react'
import { ArtifactGlyph } from '../components/ArtifactGlyph'
import type { ArtifactRecord } from '../artifacts/types'
import { artifactMetrics } from './warehouseModel'

export type CollectionProps = { records: ArtifactRecord[]; selectedIds: number[]; detailId?: number; onSelect: (id: number) => void; onDetail: (id: number) => void }
export function ArtifactSummary({ record }: { record: ArtifactRecord }) {
  const metrics = artifactMetrics(record)
  return <><div className="warehouse-card-title"><strong>{record.name}</strong>{record.locked && <Lock size={14} aria-label="已锁定" />}</div><p>{record.set} · {record.slot} · +{record.level}</p><div className="warehouse-card-main"><b>{record.main}</b><span>双暴 {metrics.cv ?? '待核实'}</span></div><ul>{record.subs.map((stat, index) => <li key={index}>{stat}</li>)}</ul></>
}
export function ArtifactGrid({ records, selectedIds, detailId, onSelect, onDetail }: CollectionProps) {
  return <div className="warehouse-grid" data-testid="warehouse-grid">{records.map(record => <article key={record.id} className={`warehouse-card ${detailId === record.id ? 'is-focused' : ''}`}>
    <input type="checkbox" aria-label={`选择${record.name}`} checked={selectedIds.includes(record.id)} onChange={() => onSelect(record.id)} />
    <button className="warehouse-card-body" onClick={() => onDetail(record.id)} aria-label={`查看${record.name}`}><span className="warehouse-card-art"><ArtifactGlyph artifact={record} /><span>★★★★★</span></span><div className="warehouse-card-copy"><ArtifactSummary record={record} /></div></button>
  </article>)}</div>
}
