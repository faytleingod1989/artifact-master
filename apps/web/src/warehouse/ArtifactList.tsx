import { ArtifactGlyph } from '../components/ArtifactGlyph'
import { ArtifactSummary, type CollectionProps } from './ArtifactGrid'
export function ArtifactList({ records, selectedIds, detailId, onSelect, onDetail }: CollectionProps) {
  return <div className="warehouse-list" data-testid="warehouse-list">{records.map(record => <article key={record.id} className={`warehouse-card warehouse-row ${detailId === record.id ? 'is-focused' : ''}`}>
    <input type="checkbox" aria-label={`选择${record.name}`} checked={selectedIds.includes(record.id)} onChange={() => onSelect(record.id)} />
    <button className="warehouse-card-body" onClick={() => onDetail(record.id)} aria-label={`查看${record.name}`}><span className="warehouse-card-art"><ArtifactGlyph artifact={record} /><span>★★★★★</span></span><div className="warehouse-card-copy"><ArtifactSummary record={record} /></div></button>
  </article>)}</div>
}
