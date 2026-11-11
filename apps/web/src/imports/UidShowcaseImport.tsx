import { useEffect, useMemo, useRef, useState } from 'react'
import { buildDuplicateIndex, createDraftReviewEvaluator, type ImportDecision } from '../artifacts/artifactDraft'
import type { ArtifactRecord } from '../artifacts/types'
import { GAME_DATA } from '../artifacts/gameData'
import { ArtifactGlyph } from '../components/ArtifactGlyph'
import { parseShowcase } from './enka/parseShowcase'
import type { EnkaQueryResult, ShowcaseParseResult } from './enka/types'
import { normalizedUid, readRememberedUid, writeRememberedUid } from './enka/uidPreference'
import { ImportReview, type DraftReviewItem } from './ImportReview'
export type UidShowcaseImportProps = { existing: ArtifactRecord[]; onConfirm: (decisions: ImportDecision[]) => Promise<void>; onClose: () => void }
const messages: Record<Extract<EnkaQueryResult, { ok: false }>['code'], string> = { 'invalid-uid': 'UID格式不正确，请输入9～10位数字。', 'not-found': '没有找到该玩家，请检查UID。', maintenance: '游戏或展柜服务维护中，请稍后再试。', 'rate-limited': '查询过于频繁，请等待倒计时结束后手动重试。', unavailable: '展柜服务暂不可用，请稍后重试。', offline: '网络不可用；本地仓库、手动录入和采集仍可使用。', timeout: '查询超时，请检查网络后手动重试。', 'invalid-response': '展柜响应格式异常，未修改仓库。', unauthorized: '当前页面无权查询展柜，请使用 Windows 桌面程序。' }
type Loaded = { parsed: ShowcaseParseResult; fetchedAt: number; refreshAt: number; cached: boolean }
export function UidShowcaseImport({ existing, onConfirm, onClose }: UidShowcaseImportProps) {
  const [remembered] = useState(readRememberedUid)
  const [uid, setUid] = useState(remembered ?? '')
  const [remember, setRemember] = useState(Boolean(remembered))
  const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [retryAt, setRetryAt] = useState(0); const [now, setNow] = useState(Date.now)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [reviewItems, setReviewItems] = useState<DraftReviewItem[] | null>(null)
  const generation = useRef(0); const saved = useRef(false)
  const duplicateIndex = useMemo(() => buildDuplicateIndex(existing), [existing])
  const evaluate = useMemo(() => createDraftReviewEvaluator(duplicateIndex), [duplicateIndex])
  const supported = Boolean(window.artifactDesktop?.queryShowcase)
  const until = Math.max(retryAt, loaded?.refreshAt ?? 0)
  const seconds = Math.max(0, Math.ceil((until - now) / 1000))
  useEffect(() => () => { generation.current++ }, [])
  const reviewing = reviewItems !== null
  useEffect(() => {
    if (reviewing) return
    setNow(Date.now())
    if (until <= Date.now()) return
    const timer = window.setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (current >= until) window.clearInterval(timer)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [reviewing, until])
  const close = () => { generation.current++; setUid(''); setLoaded(null); onClose() }
  const storePreference = (value: string | null) => { try { writeRememberedUid(value) } catch (error) { setError(error instanceof Error ? error.message : '无法保存UID偏好。') } }
  const query = async () => {
    const value = normalizedUid(uid)
    if (!value) { setError(messages['invalid-uid']); return }
    if (!supported || busy || until > Date.now()) return
    const sequence = ++generation.current; setBusy(true); setError('')
    if (remember) storePreference(value)
    try {
      const result = await window.artifactDesktop!.queryShowcase(value)
      if (generation.current !== sequence) return
      if (!result.ok) { setError(messages[result.code]); if (result.retryAt) setRetryAt(result.retryAt); return }
      const parsed = parseShowcase(result.payload, result.fetchedAt)
      setLoaded({ parsed, fetchedAt: result.fetchedAt, refreshAt: result.refreshAt, cached: result.cached })
      setSelectedIds(parsed.drafts.filter(draft => !evaluate(draft).issues.some(issue => issue.severity === 'error') && !evaluate(draft).duplicateIds.length).map(draft => draft.draftId))
      setNow(Date.now())
    } catch { if (generation.current === sequence) setError(messages['invalid-response']) }
    finally { if (generation.current === sequence) setBusy(false) }
  }
  if (reviewItems) return <ImportReview items={reviewItems} existing={existing} onConfirm={async decisions => { await onConfirm(decisions); saved.current = true }} onCancel={() => { if (saved.current) close(); else setReviewItems(null) }} />
  const characters = [...new Set(loaded?.parsed.drafts.map(draft => draft.sourceCharacterId))]
  return <section className="uid-import" role="dialog" aria-modal="true" aria-label="UID 展柜导入"><header className="modal-head"><div><p>公开展柜 · 明确点击才查询</p><h2>UID 展柜导入</h2></div><button className="icon-button" aria-label="关闭 UID 导入" onClick={close}>×</button></header><p className="uid-disclosure">查询使用第三方 Enka 服务，只读取公开角色展柜，不是整个背包。无需登录或提供密码；不会上传本地仓库。新记录的锁定状态仅为工具本地默认值，不推断游戏内锁定状态。</p>{!supported && <p className="draft-error">请使用 Windows 桌面程序查询；浏览器预览不访问展柜接口。</p>}<form className="uid-query" onSubmit={e => { e.preventDefault(); void query() }}><label>公开展柜 UID<input inputMode="numeric" autoComplete="off" value={uid} onChange={e => { generation.current++; setUid(e.target.value); setBusy(false); setLoaded(null); setSelectedIds([]); setError(''); if (remember && normalizedUid(e.target.value)) storePreference(normalizedUid(e.target.value)) }} /></label><button className="primary-button" disabled={!supported || busy || seconds > 0} type="submit">{busy ? '正在查询…' : '查询公开展柜'}</button></form><label className="uid-remember"><input type="checkbox" checked={remember} onChange={e => { setRemember(e.target.checked); if (!e.target.checked) storePreference(null); else if (normalizedUid(uid)) storePreference(normalizedUid(uid)) }} />仅在此设备记住 UID</label>{seconds > 0 && <p role="status">{seconds} 秒后可刷新；不会自动重复请求。</p>}{error && <p role="alert" className="draft-error">{error}</p>}{loaded && <><p className="uid-query-meta">查询时间 {new Date(loaded.fetchedAt).toLocaleString('zh-CN')} · {loaded.cached ? '缓存结果' : '最新响应'} · {loaded.parsed.drafts.length} 件五星，跳过 {loaded.parsed.skipped.weapons} 件武器、{loaded.parsed.skipped.lowerRarity} 件非五星。</p>{loaded.parsed.empty && <p>展柜未开放或没有公开角色。请在游戏中设置公开角色，再在冷却结束后查询。</p>}{loaded.parsed.unknown.map((item, index) => <p className="draft-error" key={index}>{item.message}</p>)}{characters.map(characterId => <section className="uid-character" key={characterId ?? 'unknown'}><h3>{characterId ? GAME_DATA.characters[String(characterId)]?.name ?? `角色 #${characterId}` : '未知角色'}</h3><div className="uid-equipment">{loaded.parsed.drafts.filter(draft => draft.sourceCharacterId === characterId).map(draft => {
    const { issues, duplicateIds } = evaluate(draft); const invalid = issues.some(issue => issue.severity === 'error'); const duplicate = duplicateIds.length > 0
    return <label className={`uid-artifact ${invalid ? 'invalid' : ''}`} key={draft.draftId}><input type="checkbox" aria-label={`选择展柜${draft.name}`} disabled={invalid} checked={selectedIds.includes(draft.draftId)} onChange={e => setSelectedIds(current => e.target.checked ? [...current, draft.draftId] : current.filter(id => id !== draft.draftId))} /><ArtifactGlyph artifact={{ id: 0, name: draft.name ?? '', set: '', setKey: draft.setKey, slot: draft.slot!, level: draft.level ?? 0, main: '', subs: [], score: 0, locked: false, hue: 'blue' }} /><span><strong>{draft.name}</strong><small>{draft.slot} · +{draft.level ?? '?'}{duplicate ? ' · 疑似重复（默认不选）' : ''}</small>{invalid && <em>{issues.filter(issue => issue.severity === 'error').map(issue => issue.message).join(' ')}</em>}</span></label>
  })}</div></section>)}</>}<footer className="modal-actions"><button className="secondary-button" onClick={close}>取消</button><button className="primary-button" disabled={!selectedIds.length} onClick={() => { saved.current = false; setReviewItems(loaded!.parsed.drafts.filter(draft => selectedIds.includes(draft.draftId)).map(draft => ({ draft }))) }}>核对所选圣遗物</button></footer></section>
}
