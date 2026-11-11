import { expect, test, vi } from 'vitest'
import { createCaptureController } from './captureController'
import { createPageScanController } from './pageScanController'
import { PAGE_BATCH_LIMIT, type CaptureQueueSnapshot } from './captureQueueTypes'
import type { PageObservation, PageScanDriver, PageScanSnapshot } from './pageScanTypes'
import { createManualDraft } from '../imports/manualDraft'

test('a full page of 32 frozen frames reaches 32 separate pending jobs in order', async () => {
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => `blob:${crypto.randomUUID()}`), revokeObjectURL: vi.fn() })
  const sourceId = 'window:123:0', seen: Blob[] = [], frames: Blob[] = []
  let queue!: CaptureQueueSnapshot, page!: PageScanSnapshot, sequence = 0, selected = 'r0c0', clock = 0
  const item = { ...createManualDraft('zhuying-lieren', '生之花'), level: 0, main: { key: 'hpFlat' as const, value: 717 }, subs: [{ key: 'atkFlat' as const, value: 14 }, { key: 'defFlat' as const, value: 16 }, { key: 'elementalMastery' as const, value: 23 }] }
  const capture = createCaptureController({
    createCaptureSession: async () => ({ captureFrame: async () => { throw Error('page capture must use its frozen frame') }, stop: () => {} }),
    createOcrSession: async () => ({ recognize: async image => { seen.push(image); return { draft: item, rawText: 'fixture', confidence: 99 } }, dispose: async () => {} }),
    onQueue: value => { queue = value }, onItems: () => {}, onStatus: () => {},
  })
  const observe = (): PageObservation => ({ sourceId, width: 3840, height: 2160, geometryKey: '3840x2160@0,0', frameSequence: ++sequence, foreground: true, validLayout: true, emergencyStop: false, pageSignature: 'page-one', detailSignature: selected, selectedCellId: selected, cells: Array.from({ length: 32 }, (_, i) => ({ id: `r${Math.floor(i/8)}c${i%8}`, row: Math.floor(i/8), col: i%8, rarity: 5 as const, selected: selected === `r${Math.floor(i/8)}c${i%8}` })) })
  const driver: PageScanDriver = { observe: async () => observe(), select: async id => { selected = id }, freeze: async id => { const image = new Blob([id]); frames.push(image); return { ocrImage:image, width:3840, height:2160, roi:{x:0,y:0,width:3840,height:2160} } }, resume:async()=>{}, pause:async()=>{}, close:async()=>{}, prepare:async()=>{}, anchor:async()=>{}, resetPage:async()=>{} }
  try {
    await capture.start(sourceId)
    const scan = createPageScanController({ sourceId, driver, now:()=>clock, sleep:async ms=>{clock+=ms},
      canCapture:()=>queue.accepting&&!queue.capturing&&!queue.ocrPaused&&queue.jobs.length<PAGE_BATCH_LIMIT&&queue.heldSourceBytes<128*1024*1024,
      enqueue:(frame,pageId,cellId)=>{const outcome=capture.requestPageCapture({frame,pageId,cellId});const job=queue.jobs.find(value=>value.pageId===pageId&&value.cellId===cellId);return {outcome:outcome==='started'&&!job?'capacity':outcome,jobId:job?.id}},
      onState:value=>{page=value},
    })
    await scan.start(); await capture.drain()
    expect(page.state).toBe('page-complete')
    expect(queue.jobs).toHaveLength(32)
    expect(queue.jobs.every(job=>job.state==='pending')).toBe(true)
    expect(queue.jobs.map(job=>job.cellId)).toEqual(Array.from({length:32},(_,i)=>`r${Math.floor(i/8)}c${i%8}`))
    expect(seen).toEqual(frames)
    await scan.dispose()
  } finally { await capture.dispose(); vi.unstubAllGlobals() }
})
