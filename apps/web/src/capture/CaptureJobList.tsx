import type { CaptureJobSnapshot } from './captureQueueTypes'
const labels = { capturing: '正在截图', queued: '排队中', recognizing: '识别中', failed: '识别失败', pending: '待确认', cancelled: '已取消' }
export function CaptureJobList({ jobs, selectedId, onSelect, onRetry, onDiscard }: { jobs: readonly CaptureJobSnapshot[]; selectedId?: string; onSelect: (id: string) => void; onRetry: (id: string) => void; onDiscard: (id: string) => void }) {
  return <div className="pending-capture-grid capture-job-grid">{jobs.map(job => <article key={job.id} className={selectedId === job.id ? 'selected' : ''}>
    <button className="capture-job-select" aria-pressed={selectedId === job.id} onClick={() => onSelect(job.id)}>
      {job.previewUrl && <img src={job.previewUrl} alt={job.state === 'pending' ? '待确认详情' + job.sequence : '任务详情' + job.sequence} />}
      <strong>#{job.sequence} · {labels[job.state]}</strong><span>{job.item?.draft.name ?? '圣遗物截图'}</span>
    </button>{job.error && <p className="draft-error">{job.error}</p>}
    {job.state === 'failed' && <button onClick={() => onRetry(job.id)}>重新识别此图</button>}
    <button onClick={() => onDiscard(job.id)}>丢弃此件</button>
  </article>)}</div>
}
