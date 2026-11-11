import type { ArtifactDraft } from '../artifacts/artifactDraft'
import { STAT_DEFINITIONS, SUB_STAT_KEYS, type StatKey } from '../artifacts/statModel'

export function PendingSubstatFields({ draft, onChange, prefix = '' }: { draft: ArtifactDraft; onChange: (draft: ArtifactDraft) => void; prefix?: string }) {
  if (!draft.pendingSubs?.length) return null
  const update = (pendingSubs: NonNullable<ArtifactDraft['pendingSubs']>) => onChange({ ...draft, pendingSubs, issues: draft.issues.filter(issue => !issue.field.startsWith('pendingSubs') || issue.code === 'unparsed') })
  return <section className="draft-wide" aria-label="待激活副词条"><p className="draft-hint">待激活 · 不计入当前评分或配装属性；升级后请重新采集核实。</p>{draft.pendingSubs.map((sub, index) => <div className="draft-sub-row" key={index}>
    <label>{prefix}待激活副词条{index + 1}类型<select value={sub.key} onChange={e => update(draft.pendingSubs!.map((s, i) => i === index ? { ...s, key: e.target.value as StatKey } : s))}>{SUB_STAT_KEYS.map(key => <option key={key} value={key}>{STAT_DEFINITIONS[key].label}{STAT_DEFINITIONS[key].percent ? '%' : ''}</option>)}</select></label>
    <label>{prefix}待激活副词条{index + 1}数值<input aria-label={`${prefix}待激活副词条${index + 1}数值`} type="number" step="any" value={Number.isFinite(sub.value) ? sub.value : ''} onChange={e => update(draft.pendingSubs!.map((s, i) => i === index ? { ...s, value: e.target.value.trim() === '' ? NaN : Number(e.target.value) } : s))} /></label>
    <button type="button" className="draft-remove" onClick={() => update(draft.pendingSubs!.filter((_, i) => i !== index))}>移除待激活词条</button>
  </div>)}</section>
}
