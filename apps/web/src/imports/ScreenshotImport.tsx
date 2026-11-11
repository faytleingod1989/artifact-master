import { useEffect, useRef, useState } from 'react'
import type { ArtifactRecord } from '../artifacts/types'
import type { ImportDecision } from '../artifacts/artifactDraft'
import { createOcrSession, type OcrSession } from '../artifacts/ocrService'
import { getRecognitionProblems } from './recognitionCheck'
import { ImportReview, type DraftReviewItem } from './ImportReview'
export function ScreenshotImport({ existing, onConfirm, onClose, multiple = false }: { existing: ArtifactRecord[]; onConfirm: (decisions: ImportDecision[]) => Promise<void>; onClose: () => void; multiple?: boolean }) {
  const [files, setFiles] = useState<File[]>([]), [index, setIndex] = useState(0)
  const [items, setItems] = useState<DraftReviewItem[]>([]), [review, setReview] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const generation = useRef(0), urls = useRef(new Set<string>()), session = useRef<Promise<OcrSession> | null>(null)
  const release = () => { for (const url of urls.current) URL.revokeObjectURL(url); urls.current.clear() }
  const dispose = () => { generation.current++; const current = session.current; session.current = null; void current?.then(worker => worker.dispose()).catch(() => {}); release() }
  useEffect(() => dispose, [])
  const recognize = async (chosen: File[], start: number, token: number) => {
    setBusy(true); setError('')
    try {
      session.current ??= createOcrSession(); const worker = await session.current
      for (let i = start; i < chosen.length; i++) {
        if (token !== generation.current) return
        setIndex(i)
        const result = await worker.recognize(chosen[i])
        if (token !== generation.current) return
        const problems = getRecognitionProblems(result.draft)
        if (problems.length) throw new Error(chosen[i].name + '：信息未识别完整，未生成空白表。' + problems.join(' ') + ' 可重新识别或换一张清晰的详情截图。')
        const url = URL.createObjectURL(result.detailImage ?? chosen[i]); urls.current.add(url)
        setItems(current => [...current, { draft: result.draft, previewUrl: url, rawOcr: result.rawText }])
      }
      if (token !== generation.current) return
      setReview(true); const current = session.current; session.current = null; await (await current)?.dispose()
    } catch (error) {
      if (token !== generation.current) return
      setError(error instanceof Error ? error.message : '识别失败，请重新识别。')
      const failed = session.current; session.current = null
      await failed?.then(worker => worker.dispose()).catch(() => {})
    } finally { if (token === generation.current) setBusy(false) }
  }
  const choose = (chosen: FileList | null) => {
    if (!chosen) return
    const next = Array.from(chosen)
    if (!next.length || next.length > 20 || next.some(file => file.size > 16 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type))) { setError('一次最多20张，单张不超过16 MB；仅支持PNG、JPG、WebP。'); return }
    dispose(); const token = generation.current; setFiles(next); setIndex(0); setItems([]); void recognize(next, 0, token)
  }
  const close = () => { dispose(); onClose() }
  if (review) return <ImportReview items={items} existing={existing} onConfirm={async decisions => { await onConfirm(decisions); release() }} onCancel={close} />
  return <section className="ocr-modal" role="dialog" aria-modal="true" aria-label="识别圣遗物截图">
    <header className="modal-head"><div><p>离线OCR · 自动定位</p><h2>{multiple ? '批量截图录入' : '识别圣遗物截图'}</h2></div><button className="icon-button" aria-label="关闭截图识别" onClick={close}>×</button></header>
    {files.length > 0 && <p>第 {index + 1} / {files.length} 张；已完成 {items.length} 件。</p>}
    {error && <p role="alert" className="draft-error">{error}</p>}
    {busy ? <p role="status">正在自动分析详情区域并在本地识别，请稍候…</p> : <><label className="ocr-picker">选择圣遗物截图<input aria-label="选择圣遗物截图" type="file" accept="image/png,image/jpeg,image/webp" multiple={multiple} onChange={event => void choose(event.target.files)} /></label>{error && files.length > 0 && <button className="primary-button" onClick={() => void recognize(files, index, generation.current)}>重新识别当前截图</button>}</>}
    <p className="draft-hint">不用框选区域或输入坐标。程序自动识别右侧详情，成功后只需核对确认；定位或信息识别失败不会生成空白录入表。</p>
    <footer className="modal-actions"><button className="secondary-button" onClick={close}>取消</button>{items.length > 0 && !busy && <button className="primary-button" onClick={() => setReview(true)}>仅核对已完成 {items.length} 件</button>}</footer>
  </section>
}
