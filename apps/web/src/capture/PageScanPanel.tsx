import type { PageScanSnapshot } from './pageScanTypes'
export type PageScanPanelProps = {
  snapshot: PageScanSnapshot; disabled: boolean
  onStart: () => void; onResume: () => void; onPause: () => void; onNext: () => void
  autoScroll?: boolean; onAutoScrollChange?: (enabled: boolean) => void
  autoCommit?: boolean; onAutoCommitChange?: (enabled: boolean) => void
  stopOnZeroLevel?: boolean; onStopOnZeroLevelChange?: (enabled: boolean) => void
  totalCaptured?: number; autoCommittedCount?: number; pendingReviewCount?: number
  onReviewPending?: () => void; onRollbackBatch?: () => void
}
export function PageScanPanel({
  snapshot, disabled, onStart, onResume, onPause, onNext,
  autoScroll = false, onAutoScrollChange, autoCommit = false, onAutoCommitChange,
  stopOnZeroLevel = false, onStopOnZeroLevelChange,
  totalCaptured, autoCommittedCount = 0, pendingReviewCount = 0,
  onReviewPending, onRollbackBatch,
}: PageScanPanelProps) {
  const active = snapshot.state === 'armed' || snapshot.state === 'scanning' || snapshot.state === 'scrolling' || snapshot.state === 'pausing'
  const completed = snapshot.state === 'page-complete' || snapshot.state === 'completed'
  const paused = snapshot.state === 'paused' || snapshot.state === 'emergency_stopped'
  const captured = snapshot.cells.filter(cell => cell.state === 'captured').length
  const columns = Math.min(8, Math.max(1, ...snapshot.cells.map(cell => Number(cell.id.split('c')[1]) + 1)))
  const statusText = snapshot.state === 'armed' ? '等待切回游戏'
    : snapshot.state === 'scanning' ? '正在逐格采集'
    : snapshot.state === 'scrolling' ? '正在自动翻页'
    : snapshot.state === 'pausing' ? '正在确认停止'
    : snapshot.state === 'completed' ? '全部完成'
    : snapshot.state === 'page-complete' ? '本页完成'
    : snapshot.state === 'emergency_stopped' ? '已紧急停止'
    : snapshot.state === 'paused' ? '已安全暂停'
    : '尚未开始'
  return <section className="page-scan-panel" aria-label="当前页自动扫描">
    <header><div><span className="page-scan-kicker">{autoCommit ? (autoScroll ? '全自动低风险 · 支持整批撤销' : '仅当前页 · 自动入库已开启') : '仅当前页 · 不自动翻页'}</span><h3>本页已保存 {captured} / {snapshot.cells.length}</h3></div><span className={`page-scan-state ${active ? 'active' : ''}`}>{statusText}</span></header>
    {onAutoCommitChange && <div className="page-scan-options">
      {onAutoScrollChange && <label><input type="checkbox" checked={autoScroll} disabled={active} onChange={e => onAutoScrollChange(e.target.checked)} />自动向下翻页</label>}
      <label><input type="checkbox" checked={autoCommit} disabled={active} onChange={e => onAutoCommitChange(e.target.checked)} />校验通过自动入库（高置信度自动写入，异常件进复核）</label>
      {onStopOnZeroLevelChange && <label><input type="checkbox" checked={stopOnZeroLevel} disabled={active} onChange={e => onStopOnZeroLevelChange(e.target.checked)} />遇到 +0 圣遗物自动停止</label>}
    </div>}
    {autoCommit && (active || autoCommittedCount > 0 || (totalCaptured ?? 0) > 0)
      ? <p className="draft-hint" aria-live="polite">正在全自动扫描 · 已截图 {totalCaptured ?? captured} 件 | 已自动入库 {autoCommittedCount} 件 | 待人工复核 {pendingReviewCount} 件（右键立即停止）</p>
      : <p className="draft-hint">启动后请切回原神并保持页面静止，不操作鼠标。右键紧急停止；失焦即暂停。自动点击期间暂停 F8，暂停或本页结束后恢复手动 F8。</p>}
    {snapshot.reason && <p className="page-scan-reason" aria-live="polite">{snapshot.reason}</p>}
    {snapshot.cells.length > 0 && <div className="page-scan-cells" role="list" aria-label="单页格位进度" style={{ gridTemplateColumns: `repeat(${columns},minmax(0,1fr))` }}>{snapshot.cells.map(cell => <span role="listitem" className={cell.state === 'captured' ? 'captured' : ''} key={cell.id}>{cell.id}<small>{cell.state === 'captured' ? '已截图' : '等待'}</small></span>)}</div>}
    {completed && autoCommittedCount > 0 && <section className="page-scan-summary" aria-label="全自动扫描完成摘要">
      <p>本次全自动扫描完成：共采集 {totalCaptured ?? (autoCommittedCount + pendingReviewCount)} 件，已自动入库 {autoCommittedCount} 件，另有 {pendingReviewCount} 件需要你核对。</p>
      <div className="modal-actions">
        {pendingReviewCount > 0 && onReviewPending && <button className="primary-button" onClick={onReviewPending}>查看并处理 {pendingReviewCount} 件待核对</button>}
        {onRollbackBatch && <button className="secondary-button" onClick={onRollbackBatch}>撤销本次自动入库的 {autoCommittedCount} 件</button>}
      </div>
    </section>}
    <div className="modal-actions">{active ? <button className="secondary-button" disabled={snapshot.state === 'pausing'} onClick={onPause}>暂停自动点击</button> : paused ? <button className="primary-button" disabled={disabled} onClick={onResume}>确认未翻页，继续当前页</button> : snapshot.state === 'page-complete' ? <button className="primary-button" disabled={disabled} onClick={onNext}>已手动翻页，下一页继续</button> : <button className="primary-button" disabled={disabled} onClick={onStart}>{snapshot.state === 'completed' ? '重新开始扫描' : '启动当前页扫描'}</button>}</div>
    <p className="draft-hint">{autoCommit ? '高置信度 5 星件识别校验通过即刻自动入库并释放大图内存；冲突、待确认或校验异常件仍保留在下方待核对列表。' : '截图与识别独立排队；队列满时先核对下方任务再继续，不自动入库。格位识别不明确时会停止，可使用手动 F8。'}</p>
  </section>
}
