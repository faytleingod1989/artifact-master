const path = require('node:path')
const { isEntryUrl } = require('./entryUrl.cjs')
const defaultClient = require('./enkaClient.cjs')
const ENTRY_FILE = path.join(__dirname, '../dist/index.html')
function registerEnkaIpc(ipcMain, getMainWindow, client = defaultClient) {
  const channel = 'artifact-master:query-showcase'
  ipcMain.handle(channel, async (event, uid) => {
    const window = getMainWindow()
    if (!window || window.isDestroyed() || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !isEntryUrl(event.senderFrame.url, ENTRY_FILE)) return { ok: false, code: 'unauthorized' }
    if (!defaultClient.normalizeUid(uid)) return { ok: false, code: 'invalid-uid' }
    return client.queryShowcase(uid)
  })
  return () => ipcMain.removeHandler(channel)
}
module.exports = { registerEnkaIpc }
