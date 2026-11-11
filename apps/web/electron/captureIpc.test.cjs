const { test } = require('node:test')
const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const path = require('node:path')
const fs = require('node:fs')
const { compileFunction } = require('node:vm')
const { registerCaptureIpc } = require('./captureIpc.cjs')
test('a selected window reuses one native frame session and never re-enumerates on successful F8 captures', async () => {
  const handlers = {}, frame = { url: pathToFileURL(path.join(__dirname, '../dist/index.html')).href }, contents = { mainFrame: null }
  contents.mainFrame = frame
  const event = { sender: contents, senderFrame: frame }
  let enumerations = 0, opens = 0, reads = 0, closes = 0
  const source = { id: 'window:456:0', name: '原神', thumbnail: { toDataURL: () => '' }, appIcon: null }
  const dispose = registerCaptureIpc({ handle: (key, fn) => { handlers[key] = fn }, removeHandler() {} }, () => ({ webContents: contents, isDestroyed: () => false }), { getSources: async () => { enumerations++; return [source] } }, { unregister() {} }, undefined, () => {
    opens++
    return { capture: async () => ({ width: 3840, height: 2160, image: 'data:image/png;base64,captured', frameSequence: ++reads }), dispose: () => { closes++ } }
  })
  try {
    await handlers['artifact-master:list-capture-sources'](event)
    const a = await handlers['artifact-master:capture-window-frame'](event, source.id)
    const b = await handlers['artifact-master:capture-window-frame'](event, source.id)
    assert.equal(a.capturePath, 'native-window'); assert.equal(b.frameSequence, 2)
    assert.equal(enumerations, 1); assert.equal(opens, 1)
    await handlers['artifact-master:close-window-frame'](event, source.id)
    assert.equal(closes, 1)
  } finally { dispose() }
})
test('capture IPC accepts only exact main entry/frame/window and a boolean shortcut switch', async () => {
  const handlers = {}; let enumerated = 0, registered = 0, removed = 0
  const frame = { url: pathToFileURL(path.join(__dirname, '../dist/index.html')).href }; const webContents = { mainFrame: frame, send() {} }
  const window = { webContents, isDestroyed: () => false }
  const cleanup = registerCaptureIpc({ handle: (key, fn) => { handlers[key] = fn }, removeHandler: () => {} }, () => window, { getSources: async () => { enumerated++; return [] } }, { unregister: () => { removed++ }, register: () => { registered++; return false } })
  const event = { sender: webContents, senderFrame: frame }
  assert.deepEqual(await handlers['artifact-master:list-capture-sources']({ ...event, senderFrame: { url: frame.url } }), [])
  assert.equal(enumerated, 0)
  assert.equal(await handlers['artifact-master:set-realtime-shortcut'](event, 'true'), false); assert.equal(registered, 0)
  assert.equal(await handlers['artifact-master:set-realtime-shortcut'](event, true), false); assert.equal(registered, 1)
  frame.url = 'https://malicious.invalid/'
  assert.equal(await handlers['artifact-master:set-realtime-shortcut'](event, false), false)
  cleanup(); assert.ok(removed >= 2)
})

test('portable short-directory URL authorizes enumeration and F8 without relaxing sender or entry checks', async () => {
  const loaded = { exports: {} }
  compileFunction(fs.readFileSync(path.join(__dirname, 'captureIpc.cjs'), 'utf8'), ['require', 'module', '__dirname'])(require, loaded, 'C:\\Users\\ADMINI~1\\AppData\\Local\\Temp\\portable\\resources\\app.asar\\electron')
  const handlers = {}; let callback, sent = 0, enumerated = 0
  const frame = { url: 'file:///C:/Users/ADMINI~1/AppData/Local/Temp/portable/resources/app.asar/dist/index.html' }
  const contents = { mainFrame: frame, send: channel => { assert.equal(channel, 'artifact-master:realtime-capture'); sent++ } }
  const window = { webContents: contents, isDestroyed: () => false }
  const cleanup = loaded.exports.registerCaptureIpc({ handle: (key, fn) => { handlers[key] = fn }, removeHandler: () => {} }, () => window, { getSources: async () => { enumerated++; return [{ id: 'window:1', name: 'fixture', thumbnail: { toDataURL: () => 'data:image/png;base64,fixture' }, appIcon: null }] } }, { unregister() {}, register: (_key, fn) => { callback = fn; return true } })
  try {
    const event = { sender: contents, senderFrame: frame }
    assert.deepEqual(await handlers['artifact-master:list-capture-sources'](event), [{ id: 'window:1', name: 'fixture', kind: 'window', thumbnail: 'data:image/png;base64,fixture', appIcon: null }])
    assert.equal(await handlers['artifact-master:set-realtime-shortcut'](event, true), true)
    callback(); assert.equal(sent, 1)
    for (const badUrl of [frame.url + '?unsafe', frame.url + '#unsafe', frame.url.replace('dist/index.html', 'dist/other.html'), frame.url.replace('file:///', 'https://'), frame.url.replace('file:///', 'file://remote/')]) {
      frame.url = badUrl
      assert.deepEqual(await handlers['artifact-master:list-capture-sources'](event), [])
      assert.equal(await handlers['artifact-master:set-realtime-shortcut'](event, true), false)
      callback(); assert.equal(sent, 1)
    }
    assert.equal(enumerated, 1)
    frame.url = 'file:///C:/Users/ADMINI~1/AppData/Local/Temp/portable/resources/app.asar/dist/index.html'
    assert.deepEqual(await handlers['artifact-master:list-capture-sources']({ ...event, senderFrame: { url: frame.url } }), [])
    assert.deepEqual(await handlers['artifact-master:list-capture-sources']({ ...event, sender: {} }), [])
    assert.equal(enumerated, 1)
  } finally { cleanup() }
})

test('window frames stay pinned to the enumerated window at full display pixel size and never fall back to a screen', async () => {
  const handlers = {}, requests = []
  const frame = { url: pathToFileURL(path.join(__dirname, '../dist/index.html')).href }
  const contents = { mainFrame: frame }, window = { webContents: contents, isDestroyed: () => false }
  let sourceName = '原神', missing = false
  const source = () => ({ id: 'window:456:0', name: sourceName, thumbnail: { toDataURL: () => 'data:image/png;base64,preview', isEmpty: () => false, getSize: () => ({ width: 3840, height: 2160 }), toPNG: () => Buffer.from('window-only-frame') }, appIcon: null })
  const cleanup = registerCaptureIpc({ handle: (key, fn) => { handlers[key] = fn }, removeHandler() {} }, () => window, { getSources: async options => { requests.push(options); return missing ? [] : [source()] } }, { unregister() {}, register: () => false }, { getAllDisplays: () => [{ size: { width: 2560, height: 1440 }, scaleFactor: 1.5 }] })
  try {
    const event = { sender: contents, senderFrame: frame }
    await handlers['artifact-master:list-capture-sources'](event)
    assert.equal(typeof handlers['artifact-master:capture-window-frame'], 'function')
    const capture = handlers['artifact-master:capture-window-frame']
    const result = await capture(event, 'window:456:0')
    assert.deepEqual(result, { sourceId: 'window:456:0', width: 3840, height: 2160, image: 'data:image/png;base64,' + Buffer.from('window-only-frame').toString('base64') })
    assert.deepEqual(requests.at(-1), { types: ['window'], thumbnailSize: { width: 3840, height: 2160 }, fetchWindowIcons: false })
    const before = requests.length
    for (const id of ['screen:0:0', 'window:999:0', '../../something']) await assert.rejects(capture(event, id))
    await assert.rejects(capture({ ...event, senderFrame: { url: frame.url } }, 'window:456:0'))
    assert.equal(requests.length, before)
    sourceName = '另一程序'
    await assert.rejects(capture(event, 'window:456:0'))
    sourceName = '原神'; missing = true
    await assert.rejects(capture(event, 'window:456:0'))
    assert.ok(requests.slice(1).every(request => request.types.length === 1 && request.types[0] === 'window'))
  } finally { cleanup() }
})

test('window frame rechecks entry identity after native enumeration completes', async () => {
  const handlers = {}
  const frame = { url: pathToFileURL(path.join(__dirname, '../dist/index.html')).href }
  const contents = { mainFrame: frame }, window = { webContents: contents, isDestroyed: () => false }
  let finish
  const source = { id: 'window:456:0', name: '原神', thumbnail: { toDataURL: () => '', isEmpty: () => false, getSize: () => ({ width: 3840, height: 2160 }), toPNG: () => Buffer.from('frame') }, appIcon: null }
  let first = true
  const cleanup = registerCaptureIpc({ handle: (key, fn) => { handlers[key] = fn }, removeHandler() {} }, () => window, { getSources: async () => { if (first) { first = false; return [source] } await new Promise(resolve => { finish = resolve }); return [source] } }, { unregister() {}, register: () => false }, { getAllDisplays: () => [{ size: { width: 3840, height: 2160 }, scaleFactor: 1 }] })
  try {
    const event = { sender: contents, senderFrame: frame }
    await handlers['artifact-master:list-capture-sources'](event)
    assert.equal(typeof handlers['artifact-master:capture-window-frame'], 'function')
    const result = handlers['artifact-master:capture-window-frame'](event, 'window:456:0')
    frame.url = 'https://outside.invalid/'
    finish()
    await assert.rejects(result)
  } finally { cleanup() }
})
