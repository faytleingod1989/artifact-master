import { useState } from 'react'
import { FIVE_STAR_ARTIFACT_SETS } from '../artifacts/catalog'
import { ARTIFACT_SLOTS, type ArtifactSetKey, type ArtifactSlot } from '../artifacts/types'
import { validateDraft, type ArtifactDraft } from '../artifacts/artifactDraft'
import { getExpectedMain, getLegalMainStats, STAT_DEFINITIONS, SUB_STAT_KEYS, type StatKey } from '../artifacts/statModel'
import { getPieceName } from '../artifacts/gameData'
import { createManualDraft } from './manualDraft'
import { PendingSubstatFields } from './PendingSubstatFields'
export type ManualEntryProps = { initial?: ArtifactDraft; onReview: (draft: ArtifactDraft, continueEntry: boolean) => void; onCancel: () => void }
type FieldsProps = { draft: ArtifactDraft; onChange: (draft: ArtifactDraft) => void; prefix?: string }
const numeric = (value: string) => value.trim() === '' ? NaN : Number(value)
export function DraftFields({ draft, onChange, prefix = '' }: FieldsProps) {
  const [setSearch, setSetSearch] = useState('')
  const legalMain = draft.slot ? getLegalMainStats(draft.slot) : []
  const mainKey = draft.main?.key ?? (legalMain.length === 1 ? legalMain[0] : undefined)
  const expected = draft.slot && mainKey && draft.level !== undefined ? getExpectedMain(draft.slot, mainKey, draft.level) : null
  const update = (field: string, changes: Partial<ArtifactDraft>) => onChange({ ...draft, ...changes, issues: draft.issues.filter(issue => issue.code === 'unparsed' && issue.field.startsWith('subs.') || !(issue.field === field || issue.field.startsWith(`${field}.`))) })
  const name = draft.setKey && draft.slot ? getPieceName(draft.setKey, draft.slot) : null
  const issues = validateDraft(draft)
  return <><div className="draft-fields">
    <label className="draft-wide">{prefix}套装搜索<input value={setSearch} onChange={e => setSetSearch(e.target.value)} placeholder="输入套装名称缩小列表" /></label>
    <label>{prefix}套装<select value={draft.setKey ?? ''} onChange={e => update('setKey', { setKey: e.target.value as ArtifactSetKey || undefined })}><option value="">请选择套装</option>{FIVE_STAR_ARTIFACT_SETS.filter(set => set.name.includes(setSearch) || set.key === draft.setKey).map(set => <option key={set.key} value={set.key}>{set.name}</option>)}</select></label>
    <label>{prefix}部位<select value={draft.slot ?? ''} onChange={e => update('slot', { slot: e.target.value as ArtifactSlot || undefined, main: undefined })}><option value="">请选择部位</option>{ARTIFACT_SLOTS.map(slot => <option key={slot}>{slot}</option>)}</select></label>
    <div className="draft-name draft-wide"><small>目录名称</small><strong>{name ?? '选好套装和部位后自动确定'}</strong>{draft.name && draft.name !== name && <span>原名称：{draft.name}；确认保存时才按核实目录更正。</span>}</div>
    <label>{prefix}等级<input type="number" min="0" max="20" step="1" value={Number.isFinite(draft.level) ? draft.level : ''} onChange={e => update('level', { level: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>
    <label>{prefix}主词条类型<select value={mainKey ?? ''} disabled={!draft.slot} onChange={e => update('main', { main: e.target.value ? { key: e.target.value as StatKey, value: NaN } : undefined })}>{legalMain.length !== 1 && <option value="">请选择主词条</option>}{legalMain.map(key => <option key={key} value={key}>{STAT_DEFINITIONS[key].label}{STAT_DEFINITIONS[key].percent ? '%' : ''}</option>)}</select></label>
    <label>{prefix}主词条数值<span className="draft-number"><input aria-label={`${prefix}主词条数值`} type="number" step="any" value={Number.isFinite(draft.main?.value) ? draft.main!.value : ''} disabled={!mainKey} onChange={e => update('main', { main: { key: mainKey!, value: numeric(e.target.value) } })} /><span aria-hidden="true">{mainKey && STAT_DEFINITIONS[mainKey].percent ? '%' : ''}</span></span></label>
    <button className="secondary-button draft-suggestion" type="button" disabled={expected === null} onClick={() => update('main', { main: { key: mainKey!, value: expected! } })}>使用成长表 {expected ?? '—'}{mainKey && STAT_DEFINITIONS[mainKey].percent ? '%' : ''}</button>
    <div className="draft-wide draft-sub-heading"><strong>副词条 · {draft.subs.length}/4</strong><button type="button" className="secondary-button" disabled={draft.subs.length >= 4} onClick={() => { const key = SUB_STAT_KEYS.find(key => key !== mainKey && !draft.subs.some(sub => sub.key === key)); if (key) update('subs', { subs: [...draft.subs, { key, value: NaN }] }) }}>增加副词条</button></div>
    {draft.subs.map((sub, index) => <div className="draft-sub-row draft-wide" key={index}><label>{prefix}副词条{index + 1}类型<select value={sub.key} onChange={e => update(`subs.${index}`, { subs: draft.subs.map((item, i) => i === index ? { ...item, key: e.target.value as StatKey } : item) })}>{SUB_STAT_KEYS.filter(key => key === sub.key || (key !== mainKey && !draft.subs.some((item, i) => i !== index && item.key === key))).map(key => <option value={key} key={key}>{STAT_DEFINITIONS[key].label}{STAT_DEFINITIONS[key].percent ? '%' : ''}</option>)}</select></label><label>{prefix}副词条{index + 1}数值<span className="draft-number"><input aria-label={`${prefix}副词条${index + 1}数值`} type="number" step="any" value={Number.isFinite(sub.value) ? sub.value : ''} onChange={e => update(`subs.${index}`, { subs: draft.subs.map((item, i) => i === index ? { ...item, value: numeric(e.target.value) } : item) })} /><span aria-hidden="true">{STAT_DEFINITIONS[sub.key].percent ? '%' : ''}</span></span></label><button type="button" className="draft-remove" aria-label={`${prefix}移除副词条${index + 1}`} onClick={() => update('subs', { subs: draft.subs.filter((_, i) => i !== index) })}>移除</button></div>)}
    <PendingSubstatFields draft={draft} onChange={onChange} prefix={prefix} />
    {draft.issues.some(issue => issue.code === 'unparsed') && <div className="draft-wide draft-legacy"><p>以下旧原文没有被自动采用，请修正字段或明确丢弃这些异常原文后再保存：</p>{draft.issues.filter(issue => issue.code === 'unparsed').map((issue, i) => <p key={i}>{issue.message}</p>)}<button type="button" className="secondary-button" onClick={() => onChange({ ...draft, issues: draft.issues.filter(issue => issue.code !== 'unparsed') })}>已核实，按当前字段保存</button></div>}
  </div>{issues.length > 0 && <ul className="draft-issues" aria-label={`${prefix}校验提示`}>{issues.map((issue, i) => <li key={i} className={issue.severity} data-field={issue.field}>{issue.message}</li>)}</ul>}</>
}
export function ManualEntry({ initial, onReview, onCancel }: ManualEntryProps) {
  const [draft, setDraft] = useState(() => initial ?? createManualDraft())
  const blocked = validateDraft(draft).some(issue => issue.severity === 'error')
  const review = (continueEntry: boolean) => { if (!blocked) onReview(draft, continueEntry) }
  return <section className="manual-entry" role="dialog" aria-modal="true" aria-label="手动录入圣遗物"><header className="modal-head"><div><p>结构化录入 · 仅本地保存</p><h2>手动录入圣遗物</h2></div><button className="icon-button" onClick={onCancel} aria-label="关闭手动录入">×</button></header><form onSubmit={e => { e.preventDefault(); review(false) }}><DraftFields draft={draft} onChange={setDraft} /><p className="draft-hint">先核对，再确认入库。主词条成长表建议可一键填入；副词条仍需按游戏显示填写。</p><footer className="modal-actions"><button type="button" className="secondary-button" onClick={onCancel}>取消</button><button type="submit" className="primary-button" disabled={blocked}>保存圣遗物</button><button type="button" className="secondary-button" disabled={blocked} onClick={() => review(true)}>保存并继续</button></footer></form></section>
}
