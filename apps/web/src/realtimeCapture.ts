import { validateCaptureRoi, type CaptureRoi } from './capture/captureRegion'
import { isUsableFrame } from './capture/frameQuality'
import { createNativeWindowSession } from './capture/nativeWindowCapture'
export type CapturedArtifactFrame = { ocrImage: Blob; width: number; height: number; roi: CaptureRoi; capturePath?: 'native-window' | 'window-snapshot'; fallbackReason?: string; captureMs?: number; gameLocked?: boolean }
export type CaptureSession = { captureFrame: () => Promise<CapturedArtifactFrame>; stop: () => void }
function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('无法获取当前画面。')), 'image/png'))
}
export async function createCaptureSession(sourceId: string, roi?: CaptureRoi): Promise<CaptureSession> {
  const captureWindowFrame = window.artifactDesktop?.captureWindowFrame
  if (sourceId.startsWith('window:') && captureWindowFrame) return createNativeWindowSession(sourceId, captureWindowFrame, roi)
  const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId, maxFrameRate: 2 } } as MediaTrackConstraints } as MediaStreamConstraints)
  const video = document.createElement('video'); video.muted = true; video.playsInline = true
  let stopped = false
  const stop = () => { if (stopped) return; stopped = true; stream.getTracks().forEach(track => track.stop()); video.pause(); video.srcObject = null }
  try {
    video.srcObject = stream
    if (video.readyState < 1) await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('画面初始化超时，请重新选择可见窗口。')), 10000)
      video.onloadedmetadata = () => { clearTimeout(timeout); resolve() }
      video.onerror = () => { clearTimeout(timeout); reject(new Error('无法读取所选窗口画面。')) }
    })
    await video.play()
    const initialWidth = video.videoWidth; const initialHeight = video.videoHeight
    if (!initialWidth || !initialHeight) throw new Error('捕获尺寸无效，请重新选择窗口。')
    if (roi && !validateCaptureRoi(roi, initialWidth, initialHeight)) throw new Error('详情区域越界，请重新选择来源并启动。')
    const canvas = document.createElement('canvas')
    return { stop, captureFrame: async () => {
      if (stopped || stream.getVideoTracks().some(track => track.readyState === 'ended')) throw new Error('来源已停止，请重新选择窗口。')
      const width = video.videoWidth; const height = video.videoHeight
      if (width !== initialWidth || height !== initialHeight) throw new Error('画面尺寸变化，请重新选择来源并启动，程序会重新自动定位。')
      const region = roi ?? { x: 0, y: 0, width, height }
      if (!validateCaptureRoi(region, width, height)) throw new Error('详情区域无效，请重新选择来源并启动。')
      canvas.width = region.width; canvas.height = region.height
      const context = canvas.getContext('2d', { alpha: false })
      if (!context) throw new Error('无法初始化本地画面缓冲区。')
      context.drawImage(video, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height)
      const ocrImage = await canvasToBlob(canvas)
      if (stopped) throw new Error('采集已停止。')
      if (!await isUsableFrame(ocrImage)) throw new Error('捕获到黑屏或空白画面，请恢复可见窗口或重新选择来源。')
      return { ocrImage, width, height, roi: region }
    } }
  } catch (error) { stop(); throw error }
}

