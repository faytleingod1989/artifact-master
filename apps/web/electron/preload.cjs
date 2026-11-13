const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('artifactDesktop', {
  pageScan: {
    open: sourceId => ipcRenderer.invoke('artifact-master:page-scan-open', sourceId),
    observe: session => ipcRenderer.invoke('artifact-master:page-scan-command', session, { action: 'observe' }),
    prepare: session => ipcRenderer.invoke('artifact-master:page-scan-command', session, { action: 'prepare' }),
    anchor: session => ipcRenderer.invoke('artifact-master:page-scan-command', session, { action: 'anchor' }),
    resetPage: session => ipcRenderer.invoke('artifact-master:page-scan-command', session, { action: 'reset-page' }),
    select: (session, cellId) => ipcRenderer.invoke('artifact-master:page-scan-command', session, { action: 'select', cellId }),
    scrollDown: (session, ticks) => ipcRenderer.invoke('artifact-master:page-scan-command', session, { action: 'scroll-down', ...(ticks !== undefined ? { ticks } : {}) }),
    freeze: (session, cellId) => ipcRenderer.invoke('artifact-master:page-scan-command', session, { action: 'freeze', cellId }),
    resume: session => ipcRenderer.invoke('artifact-master:page-scan-command', session, { action: 'resume' }),
    pause: session => ipcRenderer.invoke('artifact-master:page-scan-command', session, { action: 'pause' }),
    close: session => ipcRenderer.invoke('artifact-master:page-scan-close', session),
  },
  nativeOcr: {
    open: () => ipcRenderer.invoke('artifact-master:ocr-open'),
    recognize: (session, image, request) => request === undefined ? ipcRenderer.invoke('artifact-master:ocr-recognize', session, image) : ipcRenderer.invoke('artifact-master:ocr-recognize', session, image, request),
    close: session => ipcRenderer.invoke('artifact-master:ocr-close', session),
  },
  queryShowcase: (uid) => ipcRenderer.invoke('artifact-master:query-showcase', uid),
  listCaptureSources: () => ipcRenderer.invoke('artifact-master:list-capture-sources'),
  captureWindowFrame: sourceId => ipcRenderer.invoke('artifact-master:capture-window-frame', sourceId),
  closeWindowFrame: sourceId => ipcRenderer.invoke('artifact-master:close-window-frame', sourceId),
  setRealtimeShortcut: (enabled) => ipcRenderer.invoke('artifact-master:set-realtime-shortcut', enabled),
  onRealtimeCapture: (listener) => {
    const callback = () => listener()
    ipcRenderer.on('artifact-master:realtime-capture', callback)
    return () => ipcRenderer.removeListener('artifact-master:realtime-capture', callback)
  },
})
