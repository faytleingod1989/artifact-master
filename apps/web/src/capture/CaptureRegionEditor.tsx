import { useEffect, useRef, useState } from 'react'
import { previewToFrameRoi, validateCaptureRoi, type CaptureRoi } from './captureRegion'
import './capture.css'
export type CaptureRegionEditorProps = { frame: Blob; width: number; height: number; onConfirm: (roi: CaptureRoi) => void; onCancel: () => void }
export function CaptureRegionEditor({ frame, width, height, onConfirm, onCancel }: CaptureRegionEditorProps) {
  const [url, setUrl] = useState('')
  const [roi, setRoi] = useState<CaptureRoi>({ x: NaN, y: NaN, width: NaN, height: NaN })
  const drag = useRef<{ x: number; y: number } | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  useEffect(() => { const src = URL.createObjectURL(frame); setUrl(src); return () => URL.revokeObjectURL(src) }, [frame])
  const coordinate = (event: React.PointerEvent<HTMLImageElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: Math.min(rect.width, Math.max(0, event.clientX - rect.left)), y: Math.min(rect.height, Math.max(0, event.clientY - rect.top)) }
  }
  const move = (event: React.PointerEvent<HTMLImageElement>) => {
    if (!drag.current) return
    const end = coordinate(event); const rect = event.currentTarget.getBoundingClientRect(); const start = drag.current
    setRoi(previewToFrameRoi({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) }, rect.width, rect.height, width, height))
  }
  const valid = validateCaptureRoi(roi, width, height)
  return <section className="region-editor" role="dialog" aria-modal="true" aria-label="校准详情区域"><header className="modal-head"><div><p>实际捕获尺寸 {width} × {height} 像素</p><h2>框选右侧圣遗物详情</h2></div><button className="icon-button" onClick={onCancel} aria-label="取消校准">×</button></header><p>从名称顶部框到绿色套装名称末行，包括部位、主词条、+等级和全部副词条；不要包含下方2/4件套说明、左侧背包或人物。拖动框选，也可以输入原帧像素坐标。</p><div className="region-image-wrap"><img ref={imageRef} src={url} alt="本地捕获帧校准预览" draggable={false} onPointerDown={event => { drag.current = coordinate(event); event.currentTarget.setPointerCapture?.(event.pointerId) }} onPointerMove={move} onPointerUp={event => { move(event); drag.current = null }} onPointerCancel={() => { drag.current = null }} />{valid && <span className="region-selection" style={{ left: `${roi.x / width * 100}%`, top: `${roi.y / height * 100}%`, width: `${roi.width / width * 100}%`, height: `${roi.height / height * 100}%` }} />}</div><div className="region-coordinates">{([['x', '区域X'], ['y', '区域Y'], ['width', '区域宽度'], ['height', '区域高度']] as const).map(([key, label]) => <label key={key}>{label}<input type="number" step="1" value={Number.isFinite(roi[key]) ? roi[key] : ''} onChange={event => setRoi(current => ({ ...current, [key]: event.target.value === '' ? NaN : Number(event.target.value) }))} /></label>)}</div>{!valid && <p>请框选有效区域；坐标以此捕获帧为准，不以桌面缩放比例估算。</p>}<footer className="modal-actions"><button className="secondary-button" onClick={onCancel}>取消</button><button className="primary-button" disabled={!valid} onClick={() => onConfirm(roi)}>确认详情区域</button></footer></section>
}
