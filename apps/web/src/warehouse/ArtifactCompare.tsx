import type { ArtifactRecord } from '../artifacts/types'
import { compareArtifacts } from './warehouseModel'
export function ArtifactCompare({ left, right, onClose }: { left: ArtifactRecord; right: ArtifactRecord; onClose: () => void }) {
  const result = compareArtifacts(left, right)
  return <section className="warehouse-details warehouse-compare" aria-label="圣遗物对比"><div className="warehouse-section-title"><h2>所选对比</h2><button onClick={onClose}>关闭</button></div><p>{left.name} → {right.name}</p>{result.comparable ? <><p className="warehouse-note">差值为右侧减左侧，仅比较副词条，不代表装备后的总收益。</p><table><thead><tr><th>词条</th><th>左</th><th>右</th><th>差值</th></tr></thead><tbody>{result.rows.map(row => <tr key={row.label}><th>{row.label}</th><td>{row.left}</td><td>{row.right}</td><td>{row.delta ?? '不可直接相减'}</td></tr>)}</tbody></table></> : <p role="status">{result.reason}</p>}</section>
}
