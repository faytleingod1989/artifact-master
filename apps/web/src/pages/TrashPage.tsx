import type { ArtifactRecord } from '../artifacts/types'
import { ArtifactGlyph } from '../components/ArtifactGlyph'
export function TrashPage({ trash, disabled, onRestore, onEmpty }: { trash: ArtifactRecord[]; disabled: boolean; onRestore: (id: number) => void; onEmpty: () => void }) {
  return <section className="page-panel"><p className="page-note">共 {trash.length} 件。恢复会放回仓库；永久清空前会再次确认，不自动到期删除。</p><fieldset className="page-fieldset" disabled={disabled}>{trash.length ? <><div className="trash-list">{trash.map(item => <div className="trash-row" key={item.id}><ArtifactGlyph artifact={item} /><div><strong>{item.name}</strong><small>{item.set} · {item.slot} · +{item.level}</small></div><button className="secondary-button" onClick={() => onRestore(item.id)}>恢复</button></div>)}</div><button className="danger-button" onClick={onEmpty}>永久清空回收站</button></> : <div className="empty-trash">回收站为空</div>}</fieldset></section>
}
