const path = require('node:path')
const { isEntryUrl } = require('./entryUrl.cjs')
const ENTRY_FILE = path.join(__dirname, '../dist/index.html')
function registerCaptureIpc(ipcMain, getMainWindow, desktopCapturer, shortcut, displays, createWindowFrames) {
  const channels = ['artifact-master:list-capture-sources', 'artifact-master:set-realtime-shortcut', 'artifact-master:capture-window-frame', 'artifact-master:close-window-frame']
  const windows = new Map()
  let enumeration = 0, frameBusy = false, disposed = false
  const authorized = event => { const window = getMainWindow(); return window && !window.isDestroyed() && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && isEntryUrl(event.senderFrame.url, ENTRY_FILE) }
  ipcMain.handle(channels[0], async event => {
    if (!authorized(event)) return []
    const token = ++enumeration; for (const source of windows.values()) source.frames?.dispose(); windows.clear()
    const sources = await desktopCapturer.getSources({ types: ['window', 'screen'], fetchWindowIcons: true, thumbnailSize: { width: 320, height: 180 } })
    if (disposed || !authorized(event) || token !== enumeration) return []
    for (const source of sources) if (source.id.startsWith('window:')) windows.set(source.id, { name: source.name })
    return sources.map(source => ({ id: source.id, name: source.name, kind: source.id.startsWith('screen:') ? 'screen' : 'window', thumbnail: source.thumbnail.toDataURL(), appIcon: source.appIcon?.toDataURL() ?? null }))
  })
  ipcMain.handle(channels[1], (event, enabled) => {
    if (!authorized(event) || typeof enabled !== 'boolean') return false
    shortcut.unregister('F8'); if (!enabled) return true
    return shortcut.register('F8', () => { const window = getMainWindow(); if (window && !window.isDestroyed() && isEntryUrl(window.webContents.mainFrame.url, ENTRY_FILE)) window.webContents.send('artifact-master:realtime-capture') })
  })
  ipcMain.handle(channels[2], async (event, sourceId) => {
    const selected = typeof sourceId === 'string' && /^window:\d+:\d+$/.test(sourceId) ? windows.get(sourceId) : undefined
    if (disposed || !authorized(event) || !selected) throw Error('Window capture is not authorized for this source.')
    if (frameBusy) throw Error('A window frame is still being captured.')
    let fallbackReason
    if (createWindowFrames) {
      frameBusy = true
      try {
        const frames = selected.frames ??= createWindowFrames(sourceId)
        const native = await frames.capture()
        if (disposed || !authorized(event) || windows.get(sourceId) !== selected || selected.frames !== frames) throw Error('Window capture selection has changed.')
        return { ...native, sourceId, capturePath: 'native-window' }
      } catch (error) {
        if (error?.code !== 'FRAME_UNAVAILABLE' || disposed || !authorized(event) || windows.get(sourceId) !== selected) throw error
        fallbackReason = String(error.message).slice(0, 160)
      } finally { frameBusy = false }
    }
    const dimensions = (displays?.getAllDisplays() ?? []).map(display => ({ width: Math.round(display.size.width * display.scaleFactor), height: Math.round(display.size.height * display.scaleFactor) }))
    if (!dimensions.length || dimensions.some(size => !Number.isSafeInteger(size.width) || !Number.isSafeInteger(size.height) || size.width < 1 || size.height < 1 || size.width > 8192 || size.height > 8192)) throw Error('Native display dimensions are unavailable.')
    const thumbnailSize = { width: Math.max(...dimensions.map(size => size.width)), height: Math.max(...dimensions.map(size => size.height)) }
    if (thumbnailSize.width * thumbnailSize.height > 33554432) throw Error('Native frame exceeds the safe pixel limit.')
    frameBusy = true
    try {
      // Snapshot the same window via the main-process native capturer. This does
      // not open a screen stream or depend on the failing renderer video source.
      const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize, fetchWindowIcons: false })
      if (disposed || !authorized(event) || windows.get(sourceId) !== selected) throw Error('Window capture selection has changed.')
      const source = sources.find(item => item.id === sourceId && item.name === selected.name)
      if (!source || source.thumbnail.isEmpty()) throw Error('The selected window is no longer available.')
      const { width, height } = source.thumbnail.getSize()
      if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > 8192 || height > 8192 || width * height > 33554432) throw Error('Window frame dimensions are invalid.')
      const png = source.thumbnail.toPNG()
      if (!png.length || png.length > 33554432) throw Error('Window frame data is invalid.')
      return { sourceId, width, height, image: 'data:image/png;base64,' + png.toString('base64'), ...(fallbackReason ? { capturePath: 'window-snapshot', fallbackReason } : {}) }
    } finally { frameBusy = false }
  })
  ipcMain.handle(channels[3], (event, sourceId) => {
    if (!authorized(event) || typeof sourceId !== 'string') return
    const selected = windows.get(sourceId); selected?.frames?.dispose(); if (selected) selected.frames = undefined
  })
  const reset = () => { enumeration++; for (const source of windows.values()) source.frames?.dispose(); windows.clear(); shortcut.unregister('F8') }
  const dispose = () => { disposed = true; reset(); channels.forEach(channel => ipcMain.removeHandler(channel)) }
  dispose.hasWindow = sourceId => !disposed && /^window:[1-9]\d*:\d+$/.test(sourceId) && windows.has(sourceId)
  dispose.reset = reset
  return dispose
}
module.exports = { registerCaptureIpc }
