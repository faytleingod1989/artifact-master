const { randomUUID } = require('node:crypto')
const path = require('node:path')
const { isEntryUrl } = require('./entryUrl.cjs')
function registerPageScanIpc(ipcMain, getWindow, isKnownWindow, createClient) {
  const channels = ['open','command','close'].map(name => 'artifact-master:page-scan-' + name)
  const entry = path.join(__dirname, '../dist/index.html')
  let active, disposed = false, closing=Promise.resolve()
  const authorized = event => { const window = getWindow(); return !disposed && window && !window.isDestroyed() && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && isEntryUrl(event.senderFrame.url, entry) }
  const reset = () => { const old = active; active = undefined; if(old){closing=Promise.resolve(old.client.dispose());void closing.catch(()=>{})}return closing }
  ipcMain.handle(channels[0], async (event, sourceId) => {
    if (!authorized(event) || typeof sourceId !== 'string' || !/^window:[1-9]\d*:\d+$/.test(sourceId) || !isKnownWindow(sourceId)) throw Error('请先选择已枚举的原神窗口，不能对整个屏幕自动点击。')
    await closing
    if(!authorized(event))throw Error('页面已关闭。')
    if (active) throw Error('请先结束上一页扫描会话。')
    const session = { id: randomUUID(), sender: event.sender, frame: event.senderFrame, client: createClient(sourceId), paused: true, busy: false, inputEpoch: 0 }
    active = session
    try { await session.client.start(); if (!authorized(event) || active !== session) throw Error('页面已关闭。'); return session.id }
    catch (error) { if (active === session) reset(); throw error }
  })
  ipcMain.handle(channels[1], async (event, id, value) => {
    const session = active
    if (!authorized(event) || !session || id !== session.id || session.sender !== event.sender || session.frame !== event.senderFrame) throw Error('页面扫描会话已失效。')
    if (!value || typeof value !== 'object' || !['observe','select','freeze','resume','pause','prepare','anchor','reset-page'].includes(value.action)) throw Error('不支持的扫描操作。')
    const targeted = value.action === 'select' || value.action === 'freeze'
    if (Object.keys(value).some(key => key !== 'action' && !(targeted && key === 'cellId')) || targeted && (typeof value.cellId !== 'string' || !/^r\d{1,2}c\d{1,2}$/.test(value.cellId))) throw Error('扫描只接受已识别格位，不接受坐标或命令。')
    if ((targeted || value.action === 'prepare' || value.action === 'anchor') && session.paused) throw Error('自动输入已暂停。')
    if(value.action==='reset-page'&&!session.paused)throw Error('请先停止当前页输入再重建格位。')
    if (session.busy && value.action !== 'pause') throw Error('上一扫描操作仍在结束。')
    if (value.action === 'pause') { session.paused = true; session.inputEpoch++ }
    const inputEpoch = session.inputEpoch
    const ownsBusy = !session.busy; if (ownsBusy) session.busy = true
    try {
      const result = await session.client.command({ action: value.action, ...(targeted ? { cellId: value.cellId } : {}) })
      if (!authorized(event) || active !== session) throw Error('页面扫描结果已过期。')
      if (value.action === 'resume' && session.inputEpoch === inputEpoch) session.paused = false
      return result
    } finally { if (ownsBusy && active === session) session.busy = false }
  })
  ipcMain.handle(channels[2], (event, id) => { if (authorized(event) && active?.id === id && active.frame === event.senderFrame) return reset() })
  return { reset, dispose() { reset(); disposed = true; channels.forEach(channel => ipcMain.removeHandler(channel)) } }
}
module.exports = { registerPageScanIpc }
