const { app, BrowserWindow, desktopCapturer, globalShortcut, ipcMain, shell, screen } = require('electron')
const path = require('node:path')
const { registerEnkaIpc } = require('./enkaIpc.cjs')
const { clearShowcaseCache } = require('./enkaClient.cjs')
const { registerCaptureIpc } = require('./captureIpc.cjs')
const { registerOcrIpc } = require('./ocrIpc.cjs')
const { createNativeOcrClient } = require('./nativeOcrClient.cjs')
const { createNativeWindowFrameClient } = require('./nativeWindowFrameClient.cjs')
const { createNativePageScanClient } = require('./nativePageScanClient.cjs')
const { registerPageScanIpc } = require('./pageScanIpc.cjs')

let mainWindow = null

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#07101f',
    autoHideMenuBar: true,
    title: '圣遗物管理大师',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  window.loadFile(path.join(__dirname, '../dist/index.html'))
  mainWindow = window
  window.on('closed', () => { nativeOcrIpc.reset(); pageScanIpc.reset(); disposeCaptureIpc.reset(); mainWindow = null; clearShowcaseCache() })
  window.webContents.on('did-start-navigation', (_event, _url, _inPlace, isMainFrame) => { if (isMainFrame) { nativeOcrIpc.reset(); pageScanIpc.reset(); disposeCaptureIpc.reset() } })
  window.webContents.setWindowOpenHandler(({ url }) => {
    try { if (new URL(url).protocol === 'https:') void shell.openExternal(url) } catch { /* Ignore malformed or non-HTTPS URLs. */ }
    return { action: 'deny' }
  })
}
registerEnkaIpc(ipcMain, () => mainWindow)
app.on('before-quit', clearShowcaseCache)

const captureScript = path.join(process.resourcesPath, 'capture-native/WindowFrame.ps1')
const disposeCaptureIpc = registerCaptureIpc(ipcMain, () => mainWindow, desktopCapturer, globalShortcut, screen, sourceId => createNativeWindowFrameClient(sourceId, captureScript))
app.on('before-quit', disposeCaptureIpc)
const nativeOcrIpc = registerOcrIpc(ipcMain, () => mainWindow, createNativeOcrClient(path.join(process.resourcesPath, 'ocr-native')))
app.on('before-quit', () => nativeOcrIpc.dispose())
const pageScanIpc = registerPageScanIpc(ipcMain, () => mainWindow, sourceId => disposeCaptureIpc.hasWindow(sourceId), sourceId => createNativePageScanClient(sourceId, path.join(process.resourcesPath, 'capture-native/PageScanInput.ps1'), { diagnosticsDir: path.join(app.getPath('userData'), 'page-scan-diagnostics') }))
app.on('before-quit', () => pageScanIpc.dispose())

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll()
  if (process.platform !== 'darwin') app.quit()
})
