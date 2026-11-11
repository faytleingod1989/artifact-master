import type { WindowFrame } from './nativeWindowCapture'
export function createCaptureFrameSession(sourceId: string, read: () => Promise<WindowFrame>, close?: () => void) {
  let stopped = false, sequence = 0
  return {
    async read(): Promise<WindowFrame> {
      if (stopped) throw Error('采集已停止。')
      const frame = await read()
      if (stopped) throw Error('采集已停止。')
      if (frame.sourceId !== sourceId || ![frame.width, frame.height].every(v => Number.isSafeInteger(v) && v > 0 && v <= 8192) || frame.width * frame.height > 33554432 || typeof frame.image !== 'string' || !frame.image.startsWith('data:image/png;base64,') || frame.image.length > 45000000) throw Error('窗口帧无效：来源或尺寸异常。')
      if (frame.frameSequence !== undefined) {
        if (!Number.isSafeInteger(frame.frameSequence) || frame.frameSequence <= sequence) throw Error('窗口帧已过期，尚未取得新帧。')
        sequence = frame.frameSequence
      }
      return frame
    },
    stop() { if (!stopped) { stopped = true; close?.() } },
  }
}
