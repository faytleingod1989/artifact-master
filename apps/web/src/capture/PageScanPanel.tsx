import type { PageScanSnapshot } from './pageScanTypes'
export type PageScanPanelProps = { snapshot: PageScanSnapshot; disabled: boolean; onStart: () => void; onResume: () => void; onPause: () => void; onNext: () => void }
export function PageScanPanel({ snapshot, disabled, onStart, onResume, onPause, onNext }: PageScanPanelProps) {
  const active=snapshot.state==='armed'||snapshot.state==='scanning'||snapshot.state==='pausing'
  const captured=snapshot.cells.filter(cell=>cell.state==='captured').length
  const columns=Math.min(8,Math.max(1,...snapshot.cells.map(cell=>Number(cell.id.split('c')[1])+1)))
  return <section className="page-scan-panel" aria-label="当前页自动扫描">
    <header><div><span className="page-scan-kicker">仅当前页 · 不自动翻页</span><h3>本页已保存 {captured} / {snapshot.cells.length}</h3></div><span className={`page-scan-state ${active?'active':''}`}>{snapshot.state==='armed'?'等待切回游戏':snapshot.state==='scanning'?'正在逐格采集':snapshot.state==='pausing'?'正在确认停止':snapshot.state==='page-complete'?'本页完成':snapshot.state==='paused'?'已安全暂停':'尚未开始'}</span></header>
    <p className="draft-hint">启动后请切回原神并保持页面静止，不操作鼠标。右键紧急停止；失焦即暂停。自动点击期间暂停 F8，暂停或本页结束后恢复手动 F8。</p>
    {snapshot.reason&&<p className="page-scan-reason" aria-live="polite">{snapshot.reason}</p>}
    {snapshot.cells.length>0&&<div className="page-scan-cells" role="list" aria-label="单页格位进度" style={{gridTemplateColumns:`repeat(${columns},minmax(0,1fr))`}}>{snapshot.cells.map(cell=><span role="listitem" className={cell.state==='captured'?'captured':''} key={cell.id}>{cell.id}<small>{cell.state==='captured'?'已截图':'等待'}</small></span>)}</div>}
    <div className="modal-actions">{active?<button className="secondary-button" disabled={snapshot.state==='pausing'} onClick={onPause}>暂停自动点击</button>:snapshot.state==='paused'?<button className="primary-button" disabled={disabled} onClick={onResume}>确认未翻页，继续当前页</button>:snapshot.state==='page-complete'?<button className="primary-button" disabled={disabled} onClick={onNext}>已手动翻页，下一页继续</button>:<button className="primary-button" disabled={disabled} onClick={onStart}>启动当前页扫描</button>}</div>
    <p className="draft-hint">截图与识别独立排队；队列满时先核对下方任务再继续，不自动入库。格位识别不明确时会停止，可使用手动 F8。</p>
  </section>
}
