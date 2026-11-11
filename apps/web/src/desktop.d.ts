declare global {
  type CaptureSource = {
    id: string
    name: string
    kind: 'screen' | 'window'
    thumbnail: string
    appIcon: string | null
  }

  interface Window {
    artifactDesktop?: {
      nativeOcr?: import('./artifacts/nativeOcrTypes').NativeOcrBridge
      pageScan?: import('./capture/pageScanBridge').PageScanBridge
      listCaptureSources: () => Promise<CaptureSource[]>
      captureWindowFrame?: (sourceId: string) => Promise<import('./capture/nativeWindowCapture').WindowFrame>
      closeWindowFrame?: (sourceId: string) => Promise<void>
      queryShowcase: (uid: string) => Promise<import('./imports/enka/types').EnkaQueryResult>
      setRealtimeShortcut: (enabled: boolean) => Promise<boolean>
      onRealtimeCapture: (listener: () => void) => () => void
    }
  }
}

export {}
