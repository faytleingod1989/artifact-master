import { useEffect, useRef, useState } from 'react'
import { createCaptureSession } from '../realtimeCapture'
import { createOcrSession } from '../artifacts/ocrService'
import type { ArtifactRecord } from '../artifacts/types'
import type { ImportDecision } from '../artifacts/artifactDraft'
import { ImportReview, type DraftReviewItem } from '../imports/ImportReview'
import { createCaptureController, type CaptureController, type CaptureStatus } from './captureController'
import { createCaptureSuccessSound } from './captureSuccessSound'
import { readCaptureSoundPreferences, writeCaptureSoundPreferences, type CaptureSoundPreferences } from './captureSoundPreferences'
import { MANUAL_BATCH_LIMIT, PAGE_BATCH_LIMIT, type CaptureQueueSnapshot } from './captureQueueTypes'
import { CaptureJobList } from './CaptureJobList'
import { readNativeOcrMode, writeNativeOcrMode } from '../artifacts/ocrPreferences'
import { usePageScan } from './usePageScan'
import { PageScanPanel } from './PageScanPanel'
import './capture.css'
import { GAME_DATA } from '../artifacts/gameData'
export type RealtimeCapturePanelProps = { existing: ArtifactRecord[]; onConfirm: (decisions: ImportDecision[]) => Promise<void>; onClose: () => void }
const emptyQueue: CaptureQueueSnapshot = { batchId: '', accepting: false, capturing: false, ocrPaused: false, heldSourceBytes: 0, jobs: [] }
const statusLabels: Record<CaptureStatus, string> = { inactive: '未启动', capturing: '采集中', recognizing: '识别中', pending: '待确认', retry: '需重试', failed: '失败', stopped: '已暂停' }
export function RealtimeCapturePanel({ existing, onConfirm, onClose }: RealtimeCapturePanelProps) {
  const [sources, setSources] = useState<CaptureSource[]>([]), [sourceId, setSourceId] = useState('')
  const [queue, setQueue] = useState(emptyQueue), [selectedId, setSelectedId] = useState<string>()
  const [review, setReview] = useState<DraftReviewItem[] | null>(null), [draining, setDraining] = useState(false)
  const [status, setStatus] = useState<{ state: CaptureStatus; message: string }>({ state: 'inactive', message: '选择游戏窗口后点击启动。自动分析详情区域，不需要框选。' })
  const [busy, setBusy] = useState(false), [auto, setAuto] = useState(false), [error, setError] = useState('')
  const [ocrMode, setOcrMode] = useState(readNativeOcrMode)
  const [entryMode, setEntryMode] = useState<'manual'|'page'>('manual')
  const entryModeRef = useRef(entryMode), pageActive = useRef(false)
  entryModeRef.current = entryMode
  const [shortcutReady, setShortcutReady] = useState(false), [received, setReceived] = useState(0), [captured, setCaptured] = useState(0)
  const [sounds, setSounds] = useState(readCaptureSoundPreferences), [soundError, setSoundError] = useState('')
  const soundsRef = useRef(sounds), sound = useRef<ReturnType<typeof createCaptureSuccessSound> | null>(null)
  const controller = useRef<CaptureController | null>(null), alive = useRef(true), generation = useRef(0), reviewToken = useRef(0)
  const latestQueue = useRef(emptyQueue), activeSource = useRef(''), hasSource = useRef(false)
  const shortcutTail = useRef<Promise<boolean>>(Promise.resolve(false))
  const switchShortcut = (enabled: boolean) => {
    const next = shortcutTail.current.catch(() => false).then(() => window.artifactDesktop?.setRealtimeShortcut(enabled) ?? false)
    shortcutTail.current = next; return next
  }
  const releaseSound = () => { const previous = sound.current; sound.current = null; void previous?.dispose().catch(() => {}) }
  const prepareSound = () => {
    if (!soundsRef.current.captured && !soundsRef.current.recognized) return
    const audio = sound.current ??= createCaptureSuccessSound()
    void audio.prepare().catch(() => { if (alive.current && sound.current === audio) setSoundError('提示音暂不可用；采集不受影响。') })
  }
  const play = (kind: keyof CaptureSoundPreferences) => {
    if (!soundsRef.current[kind]) return
    const audio = sound.current
    void (kind === 'captured' ? audio?.playCaptured() : audio?.play())?.catch(() => { if (alive.current && sound.current === audio) setSoundError('提示音暂不可用；图片和草稿仍保留。') })
  }
  const toggleSound = (kind: keyof CaptureSoundPreferences, enabled: boolean) => {
    const next = { ...soundsRef.current, [kind]: enabled }; soundsRef.current = next; setSounds(next); writeCaptureSoundPreferences(next)
    setSoundError(''); if (next.captured || next.recognized) prepareSound(); else releaseSound()
  }
  const page = usePageScan({sourceId, begin:()=>start(false), controller:()=>controller.current, queue:()=>latestQueue.current,
    onActive:active=>{
      pageActive.current=active
      if(active)setShortcutReady(false)
      void switchShortcut(!active&&hasSource.current&&latestQueue.current.accepting).then(registered=>{if(alive.current&&!pageActive.current)setShortcutReady(registered)}).catch(()=>{})
    },
    onComplete:()=>{if(soundsRef.current.captured)void sound.current?.playPageComplete().catch(()=>{if(alive.current)setSoundError('本页完成提示音不可用；截图仍保留。')})},
    onError:setError,
  })
  useEffect(() => {
    const lifecycle = alive, epoch = generation, waiting = reviewToken
    alive.current = true; generation.current++
    const current = createCaptureController({ createCaptureSession, createOcrSession:()=>createOcrSession({captureMetadata:entryModeRef.current==='page'}),
      onItems: () => {},
      onQueue: next => { if (alive.current && controller.current === current) { latestQueue.current = next; setQueue(next); setSelectedId(previous => next.jobs.some(job => job.id === previous) ? previous : next.jobs[0]?.id) } },
      onCaptured: () => { if (alive.current && controller.current === current) { setCaptured(count => count + 1); play('captured') } },
      onAccepted: () => { if (alive.current && controller.current === current) play('recognized') },
      onStatus: next => {
        if (!alive.current || controller.current !== current) return
        setStatus(next)
        if (next.state === 'retry') setAuto(false)
        if (next.state === 'failed') { hasSource.current = false; setShortcutReady(false); void switchShortcut(false).catch(() => {}) }
      },
    })
    controller.current = current
    const off = window.artifactDesktop?.onRealtimeCapture(() => { if (alive.current&&!pageActive.current) { setReceived(count => count + 1); current.requestCapture() } })
    return () => { lifecycle.current = false; epoch.current++; waiting.current++; off?.(); releaseSound(); void switchShortcut(false).catch(() => {}); void current.dispose() }
    // Controller callbacks use refs so background events do not rebuild the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const pause = () => { page.pause(); controller.current?.pauseCapture(); setAuto(false); setShortcutReady(false); void switchShortcut(false).catch(() => {}) }
  const refresh = async () => {
    setBusy(true); setError(''); const token = generation.current
    try { await page.reset(); const next = await window.artifactDesktop!.listCaptureSources(); if (token === generation.current && alive.current) { setSources(next); setSourceId('') } }
    catch { if (alive.current) setError('无法枚举窗口，请重开桌面程序后重试。') }
    finally { if (alive.current) setBusy(false) }
  }
  const start = async (captureInitial=true) => {
    prepareSound(); setSoundError(''); setBusy(true); setError(''); const token = generation.current
    try {
      if (hasSource.current && sourceId === activeSource.current) controller.current!.resumeCapture()
      else { await controller.current!.start(sourceId); activeSource.current = sourceId; hasSource.current = true; setReceived(0); setCaptured(0) }
      if (token !== generation.current || !alive.current) return
      const registered = await switchShortcut(captureInitial)
      if (token !== generation.current || !alive.current) return
      setShortcutReady(registered)
      if (captureInitial&&!registered) setError('F8 被其他程序占用或注册失败；可点击“采集当前详情”。')
      if(captureInitial)controller.current!.requestCapture()
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : '无法启动采集。'); if(!captureInitial)throw e }
    finally { if (alive.current) setBusy(false) }
  }
  const close = async () => {
    if (latestQueue.current.jobs.length && !window.confirm('关闭将丢弃所有未入库截图（含排队、失败和待确认）。确定关闭吗？')) return
    generation.current++; reviewToken.current++; pause(); releaseSound()
    await page.reset()
    await controller.current?.cancelBatch(); if (alive.current) onClose()
  }
  const finishAndReview = async () => {
    pause(); setDraining(true); setError(''); const token = ++reviewToken.current
    try {
      await controller.current?.drain()
      if (!alive.current || token !== reviewToken.current) return
      const items = latestQueue.current.jobs.flatMap(job => job.item ? [job.item] : [])
      if (items.length) setReview(items); else setError('本批暂无成功草稿；失败图片仍在任务列表，可重试或丢弃。')
    } catch (e) { if (alive.current && token === reviewToken.current) setError(e instanceof Error ? e.message : '等待失败，图片仍保留。') }
    finally { if (alive.current && token === reviewToken.current) setDraining(false) }
  }
  const pending = queue.jobs.filter(job => job.state === 'pending').length, failed = queue.jobs.filter(job => job.state === 'failed').length
  const selected = queue.jobs.find(job => job.id === selectedId), diagnostic = selected?.diagnostic
  if (review) return <><p className="draft-hint">本批失败 {failed} 张，返回任务列表后可重试；未自动丢弃。</p><ImportReview items={review} existing={existing} onConfirm={async decisions => { await onConfirm(decisions); for (const item of review) controller.current?.discard(item.draft.draftId) }} onCancel={() => setReview(null)} /></>
  return <section className="realtime-modal" role="dialog" aria-modal="true" aria-label="实时录入助手">
    <header className="modal-head"><div><p>本地识别 · 确认才入库</p><h2>实时录入助手</h2></div><button className="icon-button" aria-label="关闭实时录入" disabled={busy} onClick={() => void close()}>×</button></header>
    <p className="realtime-notice">{entryMode==='page'?'当前页模式会自动点击所选原神窗口的圣遗物格位，不自动翻页。启动后切回游戏；右键或失焦立即暂停，不读取游戏内存、不注入。':'按F8截图，听到短音后即可切下一件，不必等识别结束。自动分析详情，不读取游戏内存、不注入或操控游戏。'}</p>
    {window.artifactDesktop ? <>
      <div className="capture-head"><span>选择来源（不会自动开始）</span><button disabled={busy || queue.accepting || queue.jobs.length > 0} onClick={() => void refresh()}>刷新窗口</button></div>
      <div className="capture-source-grid">{sources.map(source => <button className={'capture-source ' + (sourceId === source.id ? 'selected' : '')} disabled={busy || queue.accepting || queue.jobs.length > 0} key={source.id} onClick={() => setSourceId(source.id)}><img src={source.thumbnail} alt="本地来源缩略图" /><span>{source.name} · {source.kind === 'screen' ? '屏幕' : '窗口'}</span></button>)}</div>
      {window.artifactDesktop.pageScan&&<fieldset className="capture-entry-modes"><legend>采集方式</legend><label><input type="radio" name="entry-mode" checked={entryMode==='manual'} disabled={busy||hasSource.current||queue.jobs.length>0} onChange={()=>setEntryMode('manual')}/>手动 F8</label><label><input type="radio" name="entry-mode" checked={entryMode==='page'} disabled={busy||hasSource.current||queue.jobs.length>0} onChange={()=>setEntryMode('page')}/>当前页扫描</label></fieldset>}
      <p className="shortcut-status">{page.active?'F8 暂停：正在扫描当前页。':shortcutReady ? 'F8 已启用：切回游戏，切换圣遗物后按 F8。' : 'F8 未启用：选择来源后点击“启动实时采集”。'} 已收到 F8：{received} 次。已捕获：{captured} 张。</p>
      {entryMode==='page'&&<PageScanPanel snapshot={page.snapshot} disabled={busy||!sourceId||draining||queue.jobs.length>=PAGE_BATCH_LIMIT||queue.ocrPaused} onStart={()=>void page.start()} onResume={()=>void page.resume()} onNext={()=>void page.next()} onPause={page.pause}/>}
      <p className="draft-hint">同一时刻只取一张画面；若正在截图，再次按键会明确拒绝，不延后补拍。排队 {queue.jobs.filter(j => j.state === 'queued').length} · 识别中 {queue.jobs.filter(j => j.state === 'recognizing').length} · 成功 {pending} · 失败 {failed} · 本批 {queue.jobs.length}/{entryMode === 'page' ? PAGE_BATCH_LIMIT : MANUAL_BATCH_LIMIT}</p>
      {selected?.previewUrl && <section className="capture-detail-preview"><img src={selected.previewUrl} alt="自动定位的详情预览" /><div><p>第{selected.sequence}张 · 实际捕获：{selected.width} × {selected.height} 像素</p>{selected.roi && <p>自动定位：{selected.roi.width} × {selected.roi.height}；位置 {selected.roi.x}, {selected.roi.y}</p>}{selected.capturePath && <p>取帧路径：{selected.capturePath === 'native-window' ? '原生窗口会话' : '窗口快照（回退）'}{selected.captureFallbackReason ? `；${selected.captureFallbackReason}` : ''}</p>}<p>选择任务可查看对应原文与耗时；新结果不会切走当前预览。</p></div></section>}
      {entryMode==='page'&&selected&&<p className="draft-hint">游戏锁定：{selected.gameLocked===true?'已观察到锁定':'未知'}；装备角色：{selected.item?.draft.sourceCharacterId?GAME_DATA.characters[selected.item.draft.sourceCharacterId]?.name??'未知':'未知'}。未知信息不覆盖已有本地记录。</p>}
      <label><input type="checkbox" checked={auto} disabled={entryMode==='page'||!queue.accepting || queue.ocrPaused} onChange={e => { setAuto(e.target.checked); controller.current?.setAutoDetect(e.target.checked) }} />自动辅助检测</label>
      <label><input type="checkbox" checked={ocrMode === 'auto'} disabled={busy || hasSource.current || queue.jobs.length > 0} onChange={e => { const mode = e.target.checked ? 'auto' : 'general'; setOcrMode(mode); writeNativeOcrMode(mode); if (!queue.jobs.length && !queue.accepting) { hasSource.current = false; activeSource.current = '' } }} />快速分字段识别（关闭可回退通用识别；重新打开助手后生效）</label>
      <label><input type="checkbox" checked={sounds.captured} onChange={e => toggleSound('captured', e.target.checked)} />截图完成提示音</label>
      <label><input type="checkbox" checked={sounds.recognized} onChange={e => toggleSound('recognized', e.target.checked)} />成功识别提示音</label>
      <p className="draft-hint">短音＝画面已保存；上扬音＝识别成功待确认，尚未入库。{entryMode==='page'&&'三声下降音＝本页截图完毕，可手动翻页。'}{soundError}</p>
      <p className="realtime-status" role="status">{statusLabels[status.state]} · {status.message}</p>
      {diagnostic && <details className="capture-ocr-diagnostics"><summary>查看本次 OCR 原文与耗时</summary><h4>第{selected!.sequence}张 · 识别第{diagnostic.attempt}次</h4><p>捕获 {(diagnostic.captureMs / 1000).toFixed(2)} 秒；排队 {(diagnostic.queueWaitMs / 1000).toFixed(2)} 秒；{diagnostic.ocr && <>定位 {(diagnostic.ocr.locateMs / 1000).toFixed(2)} 秒；预处理 {(diagnostic.ocr.prepareMs / 1000).toFixed(2)} 秒；OCR {(diagnostic.ocr.ocrMs / 1000).toFixed(2)} 秒；解析 {(diagnostic.ocr.parseMs / 1000).toFixed(2)} 秒；</>}总计 {(diagnostic.totalMs / 1000).toFixed(2)} 秒</p><pre>{diagnostic.rawText || '本帧未识别到文字。'}</pre></details>}
      {error && <p role="alert" className="draft-error">{error}</p>}
      {queue.ocrPaused && <button disabled={busy} onClick={() => void controller.current?.recoverOcr()}>恢复OCR引擎</button>}
      {(entryMode==='manual'||!page.active&&queue.accepting)&&<div className="modal-actions">{queue.accepting ? <><button className="secondary-button" onClick={pause}>停止采集</button><button className="primary-button" disabled={busy || queue.capturing || queue.jobs.length >= MANUAL_BATCH_LIMIT || queue.ocrPaused} onClick={() => controller.current?.requestCapture()}>采集当前详情</button></> : <button className="primary-button" disabled={busy || !sourceId || draining} onClick={() => void start()}>{busy ? '正在启动…' : '启动实时采集'}</button>}</div>}
      {!queue.accepting && queue.jobs.length > 0 && <p className="draft-hint">截图已暂停，后台仍处理保存的图片。启动可恢复同一来源；处理完本批才能换源。</p>}
    </> : <p className="desktop-only">请使用 Windows 桌面程序；浏览器版不读取屏幕。</p>}
    <h3>待确认 {pending} / {entryMode === 'page' ? PAGE_BATCH_LIMIT : MANUAL_BATCH_LIMIT} 件</h3>
    <CaptureJobList jobs={queue.jobs} selectedId={selectedId} onSelect={setSelectedId} onRetry={id => controller.current?.retryJob(id)} onDiscard={id => controller.current?.discardJob(id)} />
    <footer className="modal-actions"><button className="secondary-button" disabled={busy} onClick={() => void close()}>关闭并丢弃未入库草稿</button><button className="primary-button" disabled={!queue.jobs.length || busy || draining} onClick={() => void finishAndReview()}>{draining ? '正在完成剩余识别…' : '停止并核对批次'}</button>{draining && <button onClick={() => { reviewToken.current++; setDraining(false) }}>取消等待并返回任务列表</button>}</footer>
  </section>
}
