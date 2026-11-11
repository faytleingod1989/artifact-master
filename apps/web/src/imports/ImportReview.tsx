import { useMemo, useRef, useState } from 'react'
import { buildDuplicateIndex, createDraftReviewEvaluator, type ArtifactDraft, type ImportDecision } from '../artifacts/artifactDraft'
import type { ArtifactRecord } from '../artifacts/types'
import { getPieceName } from '../artifacts/gameData'
import { ArtifactGlyph } from '../components/ArtifactGlyph'
import { DraftFields } from './ManualEntry'
import { formatStat } from '../artifacts/statModel'
import { FIVE_STAR_ARTIFACT_SETS } from '../artifacts/catalog'
export type DraftReviewItem = { draft: ArtifactDraft; previewUrl?: string; rawOcr?: string }
export type ImportReviewProps = { items: DraftReviewItem[]; existing: ArtifactRecord[]; onConfirm: (decisions: ImportDecision[]) => Promise<void>; onCancel: () => void; editTargetId?: number }
export function ImportReview({ items, existing, onConfirm, onCancel, editTargetId }: ImportReviewProps) {
  const duplicateIndex = useMemo(() => buildDuplicateIndex(existing), [existing])
  const evaluate = useMemo(() => createDraftReviewEvaluator(duplicateIndex), [duplicateIndex])
  const existingIds = useMemo(() => new Set(existing.map(record => record.id)), [existing])
  const [decisions, setDecisions] = useState<ImportDecision[]>(() => items.map((item, index) => editTargetId !== undefined && index === 0 ? { draft: item.draft, action: 'update', targetId: editTargetId } : ({ draft: item.draft, action: evaluate(item.draft).duplicateIds.length || evaluate(item.draft).issues.some(issue => issue.severity === 'error') ? 'skip' : 'add' })))
  const [editing, setEditing] = useState<string[]>([])
  const [saving, setSaving] = useState(false); const [error, setError] = useState(''); const [success, setSuccess] = useState('')
  const savingRef = useRef(false)
  const update = (index: number, changes: Partial<ImportDecision>) => { setSuccess(''); setDecisions(current => current.map((entry, i) => i === index ? { ...entry, ...changes } : entry)) }
  const targets = decisions.filter(entry => entry.action === 'update').map(entry => entry.targetId)
  const blocked = decisions.some(entry => entry.action !== 'skip' && (evaluate(entry.draft).issues.some(issue => issue.severity === 'error') || entry.action === 'update' && (!existingIds.has(entry.targetId!) || targets.filter(id => id === entry.targetId).length > 1)))
  const confirm = async () => {
    if (savingRef.current || blocked || success) return
    savingRef.current = true; setSaving(true); setError('')
    try { await onConfirm(decisions); setSuccess(`已完成：新增 ${decisions.filter(entry => entry.action === 'add').length} 件，更新 ${targets.length} 件，跳过 ${decisions.filter(entry => entry.action === 'skip').length} 件。`) }
    catch (error) { setError(error instanceof Error ? error.message : '保存失败，草稿已保留，请重试。') }
    finally { savingRef.current = false; setSaving(false) }
  }
  return <section className="import-review" role="dialog" aria-modal="true" aria-label="确认入库"><header className="modal-head"><div><p>确认才会更改本地仓库</p><h2>核对并入库 · {items.length} 件</h2></div><button aria-label="关闭确认" disabled={saving} onClick={onCancel} className="icon-button">×</button></header><p className="draft-hint">同词条不等于同一件实物。疑似重复默认跳过；选择“新增一件”将保留两件。</p><fieldset disabled={saving || Boolean(success)} className="review-items">{decisions.map((entry, index) => {
    const evaluation = evaluate(entry.draft)
    const duplicateIds = evaluation.duplicateIds
    const compact = entry.draft.source !== 'manual' && !evaluation.issues.some(issue => issue.severity === 'error') && !editing.includes(entry.draft.draftId)
    return <article className="review-item" key={entry.draft.draftId}><div className="review-preview">{items[index].previewUrl ? <img src={items[index].previewUrl} alt={`来源截图预览${index + 1}`} /> : entry.draft.setKey && entry.draft.slot ? <ArtifactGlyph artifact={{ id: 0, name: '', set: '', setKey: entry.draft.setKey, slot: entry.draft.slot, level: 0, main: '', subs: [], locked: false, score: 0, hue: 'blue' }} /> : <p>手动草稿 · 无来源截图</p>}<strong>{entry.draft.setKey && entry.draft.slot ? getPieceName(entry.draft.setKey, entry.draft.slot) : '待核实藏品'}</strong>{duplicateIds.length > 0 && <p className="review-duplicate">疑似重复：本地记录 {duplicateIds.join('、')}。请确认是否为另一件实物。</p>}{items[index].rawOcr && <details><summary>查看 OCR 原文</summary><pre>{items[index].rawOcr}</pre></details>}</div><div className="review-fields"><label>处理方式{index + 1}<select value={entry.action} onChange={e => update(index, { action: e.target.value as ImportDecision['action'], targetId: undefined })}><option value="skip">跳过</option><option value="add">新增一件（不覆盖）</option><option value="update">更新已有记录</option></select></label>{entry.action === 'update' && <label>更新目标{index + 1}<select value={entry.targetId ?? ''} onChange={e => update(index, { targetId: e.target.value ? Number(e.target.value) : undefined })}><option value="">明确选择本地记录</option>{existing.map(record => <option value={record.id} key={record.id}>{record.name} · {record.slot} · +{record.level} · #{record.id}</option>)}</select></label>}{compact ? <section className="recognized-summary" aria-label="自动识别信息"><p>已自动填好，请对照左侧详情核对后确认入库。</p><h3>{FIVE_STAR_ARTIFACT_SETS.find(set => set.key === entry.draft.setKey)?.name} · {entry.draft.slot} · +{entry.draft.level}</h3><strong>{entry.draft.main && formatStat(entry.draft.main)}</strong><ul>{entry.draft.subs.map(sub => <li key={sub.key}>{formatStat(sub)}</li>)}{entry.draft.pendingSubs?.map(sub => <li className="draft-hint" key={`pending-${sub.key}`}>{formatStat(sub)}（待激活，不计入当前评分）</li>)}</ul>{evaluation.issues.filter(issue => issue.severity === 'warning').map((issue, i) => <p className="draft-hint" key={i}>{issue.message}</p>)}<button type="button" className="secondary-button" onClick={() => setEditing(current => [...current, entry.draft.draftId])}>修改识别信息</button></section> : <DraftFields prefix={items.length === 1 ? '' : `第${index + 1}件`} draft={entry.draft} onChange={draft => update(index, { draft })} />}</div></article>
  })}</fieldset>{error && <p role="alert" className="draft-error">{error}</p>}{success && <p role="status" className="draft-success">{success}</p>}<footer className="modal-actions"><button className="secondary-button" disabled={saving} onClick={onCancel}>{success ? '完成' : '取消'}</button><button className="primary-button" disabled={saving || blocked || Boolean(success)} onClick={() => void confirm()}>{saving ? '正在保存…' : '确认并入库'}</button></footer></section>
}
