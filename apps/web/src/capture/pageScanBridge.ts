import type { PageObservation, PageScanDriver } from './pageScanTypes'
import type { WindowFrame } from './nativeWindowCapture'
export type PageScanBridge = {
  open: (sourceId: string) => Promise<string>; observe: (session: string) => Promise<PageObservation>
  select: (session: string, cellId: string) => Promise<void>; freeze: (session: string, cellId: string) => Promise<WindowFrame & { gameLocked?: boolean }>
  resume: (session: string) => Promise<void>; pause: (session: string) => Promise<void>; close: (session: string) => Promise<void>
  prepare: (session: string) => Promise<void>
  anchor: (session: string) => Promise<void>; resetPage: (session: string) => Promise<void>
}
export async function createPageScanDriver(bridge: PageScanBridge, sourceId: string): Promise<PageScanDriver> {
  const session = await bridge.open(sourceId)
  let closed = false
  return {
    observe: () => bridge.observe(session), prepare: () => bridge.prepare(session), select: cellId => bridge.select(session, cellId), resume: () => bridge.resume(session), pause: () => bridge.pause(session),
    anchor: () => bridge.anchor(session), resetPage: () => bridge.resetPage(session),
    async freeze(cellId) {
      const frame = await bridge.freeze(session, cellId)
      if (closed || frame.sourceId !== sourceId || !frame.image.startsWith('data:image/png;base64,') || frame.image.length > 24000000) throw Error('当前页截图来源无效或已结束。')
      if(!Number.isInteger(frame.width)||!Number.isInteger(frame.height)||frame.width<1||frame.height<1||frame.width>4096||frame.height>4096||frame.width*frame.height>8*1024*1024)throw Error('当前页截图尺寸无效。')
      const bytes=Uint8Array.from(atob(frame.image.slice('data:image/png;base64,'.length)),character=>character.charCodeAt(0))
      if(!bytes.length||bytes.length>16*1024*1024)throw Error('当前页截图预算无效。')
      return { ocrImage: new Blob([bytes],{type:'image/png'}), width: frame.width, height: frame.height, roi: { x: 0, y: 0, width: frame.width, height: frame.height }, capturePath: 'native-window', gameLocked: frame.gameLocked }
    },
    async close() { if (!closed) { closed = true; await bridge.close(session) } },
  }
}
