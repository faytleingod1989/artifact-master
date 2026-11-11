const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { isEntryUrl } = require('./entryUrl.cjs')
const { pngPayload, validateOcrRequest } = require('./nativeOcrClient.cjs')
const ENTRY_FILE = path.join(__dirname, '../dist/index.html')
const engineFailure = error => error?.code === 'OCR_ENGINE_UNAVAILABLE' ? { ok: false, code: 'OCR_ENGINE_UNAVAILABLE', message: String(error.message).slice(0, 512) } : undefined
function registerOcrIpc(ipcMain, getMainWindow, client) {
  const channels = ['artifact-master:ocr-open', 'artifact-master:ocr-recognize', 'artifact-master:ocr-close']
  let active, disposed = false, busy = false
  const authorized = event => { const window = getMainWindow(); return !disposed && window && !window.isDestroyed() && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && isEntryUrl(event.senderFrame.url, ENTRY_FILE) }
  const reset = () => { active = undefined; busy = false; client.cancel() }
  ipcMain.handle(channels[0], async event => {
    if (!authorized(event)) throw Error('OCR 页面未授权。')
    if (active) throw Error('请先结束上次 OCR 会话。')
    const session = { id: randomUUID(), frame: event.senderFrame, sender: event.sender }; active = session
    try {
      await client.start()
      if (!authorized(event) || active !== session) throw Error('OCR 页面已变化。')
      return session.id
    } catch (error) { if (active === session) reset(); const failure = engineFailure(error); if (failure) return failure; throw error }
  })
  ipcMain.handle(channels[1], async (event, id, image, request) => {
    const session = active
    if (!authorized(event) || !session || id !== session.id || session.frame !== event.senderFrame || session.sender !== event.sender) throw Error('OCR 会话未授权或已经结束。')
    const dimensions = pngPayload(image)
    const validated = validateOcrRequest(request, dimensions.width, dimensions.height)
    if (busy) throw Error('上一帧正在识别，请稍候。')
    busy = true
    try { const result = await client.recognize(image, validated); if (!authorized(event) || active !== session) throw Error('OCR 结果已过期。'); return result }
    catch (error) { if (!authorized(event) || active !== session) throw Error('OCR 结果已过期。'); const failure = engineFailure(error); if (failure) return failure; throw error }
    finally { if (active === session) busy = false }
  })
  ipcMain.handle(channels[2], (event, id) => { if (authorized(event) && active?.id === id && active.frame === event.senderFrame) reset() })
  return { reset, dispose() { disposed = true; reset(); client.dispose(); channels.forEach(channel => ipcMain.removeHandler(channel)) } }
}
module.exports = { registerOcrIpc }
