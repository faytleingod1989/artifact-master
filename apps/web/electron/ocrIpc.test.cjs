const { test } = require('node:test')
const assert = require('node:assert/strict')
const { compileFunction } = require('node:vm')
const fs = require('node:fs'), path = require('node:path')
const { pathToFileURL } = require('node:url')
test('preload exposes only session-based native OCR methods, never process or file access', async () => {
  let exposed; const calls = []
  const api = { contextBridge: { exposeInMainWorld: (_name, value) => { exposed = value } }, ipcRenderer: { invoke: async (...args) => { calls.push(args); return 'session-1' } } }
  compileFunction(fs.readFileSync(path.join(__dirname, 'preload.cjs'), 'utf8'), ['require'])(() => api)
  assert.equal(typeof exposed.nativeOcr?.open, 'function')
  await exposed.nativeOcr.open(); await exposed.nativeOcr.recognize('session-1', 'data:image/png;base64,AA=='); await exposed.nativeOcr.close('session-1')
  assert.deepEqual(calls, [['artifact-master:ocr-open'], ['artifact-master:ocr-recognize', 'session-1', 'data:image/png;base64,AA=='], ['artifact-master:ocr-close', 'session-1']])
  assert.equal(exposed.spawn, undefined); assert.equal(exposed.readFile, undefined)
})
test('preload forwards bounded v2 OCR options instead of dropping the chosen route', async () => {
  let exposed; const calls = []
  compileFunction(fs.readFileSync(path.join(__dirname, 'preload.cjs'), 'utf8'), ['require'])(() => ({ contextBridge: { exposeInMainWorld: (_name, value) => { exposed = value } }, ipcRenderer: { invoke: async (...args) => { calls.push(args) } } }))
  await exposed.nativeOcr.recognize('session', 'data:image/png;base64,AA==', { protocolVersion: 2, mode: 'auto' })
  assert.deepEqual(calls, [['artifact-master:ocr-recognize', 'session', 'data:image/png;base64,AA==', { protocolVersion: 2, mode: 'auto' }]])
})
test('page scanning preload forwards only semantic cell commands, not a generic input or process API', async () => {
  let exposed; const calls=[]
  compileFunction(fs.readFileSync(path.join(__dirname,'preload.cjs'),'utf8'),['require'])(()=>({contextBridge:{exposeInMainWorld:(_name,value)=>{exposed=value}},ipcRenderer:{invoke:async(...args)=>{calls.push(args)}}}))
  assert.equal(typeof exposed.pageScan?.select,'function')
  await exposed.pageScan.select('page-session','r0c2'); await exposed.pageScan.pause('page-session')
  assert.deepEqual(calls,[['artifact-master:page-scan-command','page-session',{action:'select',cellId:'r0c2'}],['artifact-master:page-scan-command','page-session',{action:'pause'}]])
  assert.equal(exposed.pageScan.command,undefined); assert.equal(exposed.pageScan.clickAt,undefined)
})

function setup() {
  const { registerOcrIpc } = require('./ocrIpc.cjs')
  const handlers = {}; let starts = 0, recognitions = 0, canceled = 0, finish
  const frame = { url: pathToFileURL(path.join(__dirname, '../dist/index.html')).href }, contents = { mainFrame: frame }
  const window = { webContents: contents, isDestroyed: () => false }
  const client = { start: async () => { starts++ }, recognize: async () => { recognitions++; return new Promise(resolve => { finish = resolve }) }, cancel: () => { canceled++ }, dispose() {} }
  const controller = registerOcrIpc({ handle: (key, fn) => { handlers[key] = fn }, removeHandler() {} }, () => window, client)
  return { client, handlers, event: { sender: contents, senderFrame: frame }, frame, controller, starts: () => starts, recognitions: () => recognitions, canceled: () => canceled, finish: value => finish(value) }
}
const png = () => { const b = Buffer.alloc(33); Buffer.from('89504e470d0a1a0a','hex').copy(b); b.write('IHDR',12); b.writeUInt32BE(911,16); b.writeUInt32BE(798,20); return 'data:image/png;base64,' + b.toString('base64') }
test('engine errors cross IPC as bounded typed failures but authorization and ordinary errors still reject', async () => {
  const x = setup()
  try {
    const session = await x.handlers['artifact-master:ocr-open'](x.event)
    x.client.recognize = async () => { throw Object.assign(new Error('worker gone'), { code: 'OCR_ENGINE_UNAVAILABLE' }) }
    assert.deepEqual(await x.handlers['artifact-master:ocr-recognize'](x.event, session, png()), { ok: false, code: 'OCR_ENGINE_UNAVAILABLE', message: 'worker gone' })
    await assert.rejects(x.handlers['artifact-master:ocr-recognize']({ ...x.event, sender: {} }, session, png()))
    x.client.recognize = async () => { throw new Error('bad frame') }
    await assert.rejects(x.handlers['artifact-master:ocr-recognize'](x.event, session, png()), /bad frame/)
  } finally { x.controller.dispose() }
})
test('OCR denies foreign frames/pages, stale sessions, malformed images and parallel jobs before invoking the worker', async () => {
  const x = setup(), open = x.handlers['artifact-master:ocr-open'], recognize = x.handlers['artifact-master:ocr-recognize']
  try {
    await assert.rejects(open({ ...x.event, senderFrame: { url: x.frame.url } }))
    const original = x.frame.url; x.frame.url += '?unsafe'; await assert.rejects(open(x.event)); x.frame.url = original
    assert.equal(x.starts(), 0)
    const session = await open(x.event)
    await assert.rejects(recognize(x.event, 'wrong', png()))
    for (const image of [null, 'file:///secret.png', 'data:image/png;base64,AAA=', png().replace('image/png','image/jpeg')]) await assert.rejects(recognize(x.event, session, image))
    assert.equal(x.recognitions(), 0)
    const job = recognize(x.event, session, png())
    await assert.rejects(recognize(x.event, session, png()))
    x.handlers['artifact-master:ocr-close']({ ...x.event, sender: {} }, session)
    assert.equal(x.canceled(), 0)
    x.handlers['artifact-master:ocr-close'](x.event, session)
    const rejected = assert.rejects(job, /过期/); x.finish({ lines: [] }); await rejected
    assert.equal(x.recognitions(), 1)
    await assert.rejects(recognize(x.event, session, png()))
    const next = await open(x.event); assert.notEqual(next, session)
  } finally { x.controller.dispose() }
})
