import type { CaptureSession, CapturedArtifactFrame } from '../realtimeCapture'
import { cropDetailRegion, validateCaptureRoi, type CaptureRoi } from './captureRegion'
import { isUsableFrame } from './frameQuality'
import { createCaptureFrameSession } from './captureFrameSession'

export type WindowFrame = { sourceId: string; image: string; width: number; height: number; frameSequence?: number; capturePath?: 'native-window' | 'window-snapshot'; fallbackReason?: string }
export async function createNativeWindowSession(sourceId: string, capture: (sourceId: string) => Promise<WindowFrame>, roi?: CaptureRoi): Promise<CaptureSession> {
  let stopped = false
  const frames = createCaptureFrameSession(sourceId, () => capture(sourceId), () => { void window.artifactDesktop?.closeWindowFrame?.(sourceId).catch(() => {}) })
  const read = async (): Promise<CapturedArtifactFrame> => {
    if (stopped) throw Error('采集已停止。')
    const frame = await frames.read()
    if (stopped) throw Error('采集已停止。')
    if (frame.sourceId !== sourceId || ![frame.width, frame.height].every(value => Number.isSafeInteger(value) && value > 0 && value <= 8192) || frame.width * frame.height > 33554432 || typeof frame.image !== 'string' || !frame.image.startsWith('data:image/png;base64,') || frame.image.length > 45000000) throw Error('窗口帧无效。')
    const image = await (await fetch(frame.image)).blob()
    const region = roi ?? { x: 0, y: 0, width: frame.width, height: frame.height }
    if (!validateCaptureRoi(region, frame.width, frame.height)) throw Error('详情区域无效，请重新选择来源并启动。')
    const ocrImage = roi ? await cropDetailRegion(image, roi) : image
    if (stopped) throw Error('采集已停止。')
    if (!await isUsableFrame(ocrImage)) throw Error('捕获到黑屏或空白画面，请恢复可见窗口或重新选择来源。')
    if (stopped) throw Error('采集已停止。')
    return { ocrImage, width: frame.width, height: frame.height, roi: region, capturePath: frame.capturePath, fallbackReason: frame.fallbackReason }
  }
  // The validation frame belongs to startup, never to a later F8 request.
  try { await read() } catch (error) { frames.stop(); throw error }
  return {
    stop() { stopped = true; frames.stop() },
    async captureFrame() {
      if (stopped) throw Error('采集已停止。')
      return read()
    },
  }
}
