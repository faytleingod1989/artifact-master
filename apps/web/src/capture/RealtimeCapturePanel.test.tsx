import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { RealtimeCapturePanel } from './RealtimeCapturePanel'
import { createManualDraft } from '../imports/manualDraft'
const mocks = vi.hoisted(() => ({ capture: vi.fn(), ocr: vi.fn() }))
vi.mock('../realtimeCapture', () => ({ createCaptureSession: mocks.capture }))
vi.mock('../artifacts/ocrService', () => ({ createOcrSession: mocks.ocr }))
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); delete window.artifactDesktop })
test('explicit page mode queues separate saved cells, never takes a delayed live frame, and restores manual F8 afterwards', async () => {
  const user=userEvent.setup(); let received!:()=>void, seq=0, selected='r0c0'
  const captureFrame=vi.fn(async()=>({ocrImage:new Blob(['manual']),width:3840,height:2160,roi:{x:0,y:0,width:3840,height:2160}}))
  mocks.capture.mockResolvedValue({captureFrame,stop:vi.fn()})
  const draft={...createManualDraft('zhuying-lieren','生之花'),level:0,main:{key:'hpFlat' as const,value:717},subs:[{key:'atkFlat' as const,value:14},{key:'defFlat' as const,value:16},{key:'elementalMastery' as const,value:23}]}
  mocks.ocr.mockResolvedValue({recognize:async()=>({draft,confidence:99,rawText:'same attributes'}),dispose:vi.fn(async()=>{})})
  vi.stubGlobal('URL',{createObjectURL:vi.fn(()=> 'blob:page'),revokeObjectURL:vi.fn()})
  window.artifactDesktop={listCaptureSources:async()=>[{id:'window:123:0',name:'原神',kind:'window',thumbnail:'data:image/png;base64,AA==',appIcon:null}],queryShowcase:vi.fn(),setRealtimeShortcut:vi.fn(async()=>true),onRealtimeCapture:listener=>{received=listener;return()=>{}},pageScan:{
    open:async()=> 'page-session',close:async()=>{},anchor:async()=>{},resetPage:async()=>{},prepare:async()=>{},resume:async()=>{},pause:async()=>{},select:async(_session,id)=>{selected=id},freeze:async()=>({sourceId:'window:123:0',image:'data:image/png;base64,AA==',width:3840,height:2160}),
    observe:async()=>({sourceId:'window:123:0',width:3840,height:2160,geometryKey:'3840x2160@0,0',frameSequence:++seq,foreground:true,validLayout:true,emergencyStop:false,pageSignature:'same-page',detailSignature:'same-attributes',selectedCellId:selected,cells:['r0c0','r0c1'].map((id,col)=>({id,row:0,col,rarity:5 as const,selected:id===selected}))})
  }}
  render(<RealtimeCapturePanel existing={[]} onConfirm={vi.fn()} onClose={vi.fn()}/> )
  await user.click(screen.getByRole('button',{name:'刷新窗口'}));await user.click(await screen.findByRole('button',{name:/原神/}))
  await user.click(screen.getByRole('radio',{name:'当前页扫描'}));await user.click(screen.getByRole('button',{name:'启动当前页扫描'}))
  await waitFor(()=>expect(screen.getByText(/本页已保存 2 \/ 2/)).toBeVisible(),{timeout:3000})
  await waitFor(()=>expect(screen.getByRole('img',{name:'待确认详情2'})).toBeVisible())
  expect(captureFrame).not.toHaveBeenCalled()
  await act(async()=>{received()})
  await waitFor(()=>expect(captureFrame).toHaveBeenCalledTimes(1))
})

test('failed OCR retains raw text and per-stage timings without asking for manual entry', async () => {
  const user = userEvent.setup()
  const draft = { ...createManualDraft('zhuying-lieren', '生之花'), level: 0, main: { key: 'hpFlat', value: 717 }, subs: [{ key: 'energyRecharge', value: 6.54 }, { key: 'defFlat', value: 16 }, { key: 'elementalMastery', value: 23 }] }
  mocks.capture.mockResolvedValue({ captureFrame: async () => ({ ocrImage: new Blob(['frame']), width: 3840, height: 2160, capturePath: 'window-snapshot', fallbackReason: '窗口未在前台' }), stop: vi.fn() })
  mocks.ocr.mockResolvedValue({ recognize: async () => ({ draft, rawText: '元素苑能效率+6.54%', confidence: 90, timings: { locateMs: 10, prepareMs: 20, ocrMs: 1000, parseMs: 5, totalMs: 1035 } }), dispose: vi.fn(async () => {}) })
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() })
  window.artifactDesktop = { listCaptureSources: vi.fn(async () => [{ id: 'window:1', name: '原神', kind: 'window' as const, thumbnail: 'data:image/png;base64,AA==', appIcon: null }]), setRealtimeShortcut: vi.fn(async () => true), queryShowcase: vi.fn(), onRealtimeCapture: () => () => {} }
  render(<RealtimeCapturePanel existing={[]} onConfirm={vi.fn()} onClose={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: '刷新窗口' })); await user.click(await screen.findByRole('button', { name: /原神/ }))
  await user.click(screen.getByRole('button', { name: '启动实时采集' }))
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('6.54%'))
  expect(screen.getByText(/取帧路径：窗口快照（回退）/)).toHaveTextContent('窗口未在前台')
  await user.click(screen.getByText('查看本次 OCR 原文与耗时'))
  expect(screen.getByText('元素苑能效率+6.54%')).toBeVisible()
  expect(screen.getByText(/定位 0.01 秒/)).toHaveTextContent('OCR 1.00 秒')
  expect(screen.getByText('待确认 0 / 20 件')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '停止采集' }))
  expect(screen.getByText('元素苑能效率+6.54%')).toBeVisible()
})

test('starting a selected source automatically locates details without crop coordinates and shows received F8 events', async () => {
  const user = userEvent.setup(); let trigger!: () => void
  const tones: number[] = [], resumes: number[] = []
  vi.stubGlobal('AudioContext', class {
    state = 'running'; currentTime = 0; destination = {}
    async resume() { resumes.push(1) }
    async close() { this.state = 'closed' }
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} } }
    createOscillator() { return { frequency: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {}, start() { tones.push(1) }, stop() {} } }
  })
  const draft = { ...createManualDraft('zhuying-lieren', '生之花'), level: 0, main: { key: 'hpFlat' as const, value: 717 }, subs: [{ key: 'atkFlat' as const, value: 14 }, { key: 'defFlat' as const, value: 16 }, { key: 'elementalMastery' as const, value: 23 }] }
  mocks.capture.mockResolvedValue({ captureFrame: async () => ({ ocrImage: new Blob(['frame']), width: 3840, height: 2160, roi: { x: 0, y: 0, width: 3840, height: 2160 } }), stop: vi.fn() })
  mocks.ocr.mockResolvedValue({ recognize: async () => ({ draft: { ...draft, draftId: crypto.randomUUID() }, rawText: 'recognized', confidence: 90, detailImage: new Blob(['detail']), detailRoi: { x: 2870, y: 200, width: 850, height: 810 } }), dispose: vi.fn(async () => {}) })
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() })
  window.artifactDesktop = { listCaptureSources: vi.fn(async () => [{ id: 'window:1', name: '原神', kind: 'window' as const, thumbnail: 'data:image/png;base64,AA==', appIcon: null }]), setRealtimeShortcut: vi.fn(async () => true), queryShowcase: vi.fn(), onRealtimeCapture: listener => { trigger = listener; return () => {} } }
  render(<RealtimeCapturePanel existing={[]} onConfirm={vi.fn()} onClose={vi.fn()} />)
  expect(screen.getByText(/F8 未启用/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '刷新窗口' })); await user.click(await screen.findByRole('button', { name: /原神/ }))
  await user.click(screen.getByRole('button', { name: '启动实时采集' }))
  expect(await screen.findByText(/F8 已启用/)).toBeInTheDocument()
  expect(screen.queryByLabelText('区域X')).not.toBeInTheDocument()
  expect(await screen.findByRole('img', { name: '待确认详情1' })).toBeInTheDocument()
  await waitFor(() => expect(tones).toHaveLength(2))
  expect(resumes.length).toBeGreaterThan(0)
  await act(async () => { trigger() })
  expect(await screen.findByText(/已收到 F8：1 次/)).toBeInTheDocument()
  expect(await screen.findByRole('img', { name: '待确认详情2' })).toBeInTheDocument()
  await waitFor(() => expect(tones).toHaveLength(4))
  await user.click(screen.getByLabelText('成功识别提示音'))
  expect(screen.getByLabelText('成功识别提示音')).not.toBeChecked()
  await act(async () => { trigger() })
  expect(await screen.findByRole('img', { name: '待确认详情3' })).toBeInTheDocument()
  expect(tones).toHaveLength(5)
  cleanup()
  render(<RealtimeCapturePanel existing={[]} onConfirm={vi.fn()} onClose={vi.fn()} />)
  expect(screen.getByLabelText('成功识别提示音')).not.toBeChecked()
})

test('desktop capture status is understandable without English implementation state names', () => {
  window.artifactDesktop = { listCaptureSources: vi.fn(), setRealtimeShortcut: vi.fn(), queryShowcase: vi.fn(), onRealtimeCapture: () => () => {} }
  render(<RealtimeCapturePanel existing={[]} onConfirm={vi.fn()} onClose={vi.fn()} />)
  expect(screen.getByRole('status')).toHaveTextContent('未启动')
})

test('F8 conflict is visible and the explicit capture button remains usable', async () => {
  const user = userEvent.setup()
  const stop = vi.fn(); const dispose = vi.fn(async () => {})
  mocks.capture.mockResolvedValue({ captureFrame: async () => ({ ocrImage: new Blob(['frame']), width: 3840, height: 2160 }), stop })
  mocks.ocr.mockResolvedValue({ recognize: async () => ({ draft: { ...createManualDraft('zhuying-lieren', '生之花'), level: 0, main: { key: 'hpFlat', value: 717 }, subs: [{ key: 'atkFlat', value: 14 }, { key: 'defFlat', value: 16 }, { key: 'elementalMastery', value: 23 }] }, rawText: 'recognized', confidence: 90 }), dispose })
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() })
  window.artifactDesktop = { listCaptureSources: vi.fn(async () => [{ id: 'window:1', name: '原神', kind: 'window' as const, thumbnail: 'data:image/png;base64,AA==', appIcon: null }]), setRealtimeShortcut: vi.fn(async () => false), queryShowcase: vi.fn(), onRealtimeCapture: () => () => {} }
  render(<RealtimeCapturePanel existing={[]} onConfirm={vi.fn()} onClose={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: '刷新窗口' })); await user.click(await screen.findByRole('button', { name: /原神/ }))
  await user.click(screen.getByRole('button', { name: '启动实时采集' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('F8 被其他程序占用')
  await user.click(screen.getByRole('button', { name: '采集当前详情' }))
  expect(await screen.findByRole('img', { name: '待确认详情1' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '停止采集' }))
  expect(screen.getByRole('img', { name: '待确认详情1' })).toBeInTheDocument()
})
test('browser mode does not request screen or register a shortcut', () => {
  render(<RealtimeCapturePanel existing={[]} onConfirm={vi.fn()} onClose={vi.fn()} />)
  expect(screen.getByText(/请使用 Windows 桌面程序/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '读取预览并校准' })).not.toBeInTheDocument()
})
test('F8 saves another image while OCR is pending and close confirms queued tasks', async () => {
  const user = userEvent.setup(); let trigger!: () => void
  mocks.capture.mockResolvedValue({ captureFrame: async () => ({ ocrImage: new Blob(['frame']), width: 3840, height: 2160 }), stop: vi.fn() })
  mocks.ocr.mockResolvedValue({ recognize: () => new Promise(() => {}), dispose: vi.fn(async () => {}) })
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() })
  window.artifactDesktop = { listCaptureSources: vi.fn(async () => [{ id: 'window:1', name: '原神', kind: 'window' as const, thumbnail: 'data:image/png;base64,AA==', appIcon: null }]), setRealtimeShortcut: vi.fn(async () => true), queryShowcase: vi.fn(), onRealtimeCapture: cb => { trigger = cb; return () => {} } }
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false), onClose = vi.fn()
  render(<RealtimeCapturePanel existing={[]} onConfirm={vi.fn()} onClose={onClose} />)
  await user.click(screen.getByRole('button', { name: '刷新窗口' })); await user.click(await screen.findByRole('button', { name: /原神/ })); await user.click(screen.getByRole('button', { name: '启动实时采集' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '采集当前详情' })).toBeEnabled())
  await act(async () => { trigger() })
  await waitFor(() => expect(screen.getByText(/已捕获：2 张/)).toBeInTheDocument())
  await user.click(screen.getByRole('button', { name: '关闭实时录入' }))
  expect(confirm).toHaveBeenCalledOnce(); expect(onClose).not.toHaveBeenCalled()
})
test('enumeration alone never starts capture, automatic capture is off', async () => {
  const user = userEvent.setup(); const shortcut = vi.fn(async () => true)
  window.artifactDesktop = { listCaptureSources: vi.fn(async () => [{ id: 'window:1', name: '原神', kind: 'window' as const, thumbnail: 'data:image/png;base64,AA==', appIcon: null }]), setRealtimeShortcut: shortcut, queryShowcase: vi.fn(), onRealtimeCapture: () => () => {} }
  render(<RealtimeCapturePanel existing={[]} onConfirm={vi.fn()} onClose={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: '刷新窗口' })); await user.click(await screen.findByRole('button', { name: /原神/ }))
  expect(shortcut).not.toHaveBeenCalledWith(true); expect(screen.getByLabelText('自动辅助检测')).not.toBeChecked()
  expect(screen.getByRole('button', { name: '启动实时采集' })).toBeEnabled()
})

test('pausing screenshots drains OCR even while shortcut unregistration is pending', async () => {
  const user = userEvent.setup()
  let finishOcr!: () => void, finishUnregister!: () => void, holdUnregister = false
  const draft = { ...createManualDraft('zhuying-lieren', '生之花'), level: 0, main: { key: 'hpFlat' as const, value: 717 }, subs: [{ key: 'atkFlat' as const, value: 14 }, { key: 'defFlat' as const, value: 16 }, { key: 'elementalMastery' as const, value: 23 }] }
  mocks.capture.mockResolvedValue({ captureFrame: async () => ({ ocrImage: new Blob(['frame']), width: 3840, height: 2160 }), stop: vi.fn() })
  mocks.ocr.mockResolvedValue({ recognize: async () => { await new Promise<void>(resolve => { finishOcr = resolve }); return { draft, rawText: 'recognized', confidence: 90 } }, dispose: vi.fn(async () => {}) })
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() })
  window.artifactDesktop = { listCaptureSources: vi.fn(async () => [{ id: 'window:1', name: '原神', kind: 'window' as const, thumbnail: 'data:image/png;base64,AA==', appIcon: null }]), setRealtimeShortcut: async enabled => { if (!enabled && holdUnregister) await new Promise<void>(resolve => { finishUnregister = resolve }); return enabled }, queryShowcase: vi.fn(), onRealtimeCapture: () => () => {} }
  render(<RealtimeCapturePanel existing={[]} onConfirm={vi.fn()} onClose={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: '刷新窗口' })); await user.click(await screen.findByRole('button', { name: /原神/ }))
  await user.click(screen.getByRole('button', { name: '启动实时采集' }))
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('识别中'))
  holdUnregister = true
  await user.click(screen.getByRole('button', { name: '停止采集' }))
  try {
    await act(async () => { finishOcr(); await new Promise(resolve => setTimeout(resolve, 0)) })
    expect(screen.getByRole('img', { name: '待确认详情1' })).toBeInTheDocument()
  } finally { holdUnregister = false; await act(async () => { finishUnregister?.() }) }
})

test('late completion of an old stop cannot hide the controls of a restarted capture', async () => {
  const user = userEvent.setup()
  let finishUnregister!: () => void, holdOneUnregister = false
  const draft = { ...createManualDraft('zhuying-lieren', '生之花'), level: 0, main: { key: 'hpFlat' as const, value: 717 }, subs: [{ key: 'atkFlat' as const, value: 14 }, { key: 'defFlat' as const, value: 16 }, { key: 'elementalMastery' as const, value: 23 }] }
  mocks.capture.mockResolvedValue({ captureFrame: async () => ({ ocrImage: new Blob(['frame']), width: 3840, height: 2160 }), stop: vi.fn() })
  mocks.ocr.mockResolvedValue({ recognize: async () => ({ draft: { ...draft, draftId: crypto.randomUUID() }, rawText: 'recognized', confidence: 90 }), dispose: vi.fn(async () => {}) })
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() })
  window.artifactDesktop = { listCaptureSources: vi.fn(async () => [{ id: 'window:1', name: '原神', kind: 'window' as const, thumbnail: 'data:image/png;base64,AA==', appIcon: null }]), setRealtimeShortcut: async enabled => { if (!enabled && holdOneUnregister) { holdOneUnregister = false; await new Promise<void>(resolve => { finishUnregister = resolve }) } return enabled }, queryShowcase: vi.fn(), onRealtimeCapture: () => () => {} }
  render(<RealtimeCapturePanel existing={[]} onConfirm={vi.fn()} onClose={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: '刷新窗口' })); await user.click(await screen.findByRole('button', { name: /原神/ }))
  await user.click(screen.getByRole('button', { name: '启动实时采集' }))
  await screen.findByRole('img', { name: '待确认详情1' })
  holdOneUnregister = true
  await user.click(screen.getByRole('button', { name: '停止采集' }))
  await user.click(await screen.findByRole('button', { name: '启动实时采集' }))
  await act(async () => { finishUnregister() })
  await screen.findByText(/F8 已启用/)
  expect(screen.getByRole('button', { name: '停止采集' })).toBeEnabled()
  expect(screen.queryByRole('button', { name: '启动实时采集' })).not.toBeInTheDocument()
})
