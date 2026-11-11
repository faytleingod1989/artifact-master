const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { registerEnkaIpc } = require('./enkaIpc.cjs')
const fs = require('node:fs')
const { compileFunction } = require('node:vm')
test('only the main window main frame at the exact packaged entry may query', async () => {
  let handler; let calls = 0; let removed = false
  const ipc = { handle: (_channel, callback) => { handler = callback }, removeHandler: () => { removed = true } }
  const frame = { url: pathToFileURL(path.join(__dirname, '../dist/index.html')).href }
  const contents = { mainFrame: frame }; const window = { webContents: contents, isDestroyed: () => false }
  const dispose = registerEnkaIpc(ipc, () => window, { queryShowcase: async () => { calls++; return { ok: true } } })
  const event = { sender: contents, senderFrame: frame }
  assert.equal((await handler(event, '123456789')).ok, true); assert.equal(calls, 1)
  for (const bad of [{ ...event, sender: {} }, { ...event, senderFrame: { url: frame.url } }]) assert.equal((await handler(bad, '123456789')).code, 'unauthorized')
  frame.url = 'https://enka.network/'; assert.equal((await handler(event, '123456789')).code, 'unauthorized')
  frame.url = pathToFileURL(path.join(__dirname, '../dist/index.html')).href
  assert.equal((await handler(event, 'https://evil.test')).code, 'invalid-uid')
  assert.equal(calls, 1); dispose(); assert.equal(removed, true)
})

test('showcase shares portable short-directory authorization while query strings and foreign frames stay denied', async () => {
  const loaded = { exports: {} }
  compileFunction(fs.readFileSync(path.join(__dirname, 'enkaIpc.cjs'), 'utf8'), ['require', 'module', '__dirname'])(require, loaded, 'C:\\Users\\ADMINI~1\\AppData\\Local\\Temp\\portable\\resources\\app.asar\\electron')
  let handler, calls = 0
  const frame = { url: 'file:///C:/Users/ADMINI~1/AppData/Local/Temp/portable/resources/app.asar/dist/index.html' }
  const contents = { mainFrame: frame }, window = { webContents: contents, isDestroyed: () => false }
  const dispose = loaded.exports.registerEnkaIpc({ handle: (_key, fn) => { handler = fn }, removeHandler() {} }, () => window, { queryShowcase: async () => { calls++; return { ok: true } } })
  try {
    const event = { sender: contents, senderFrame: frame }
    assert.equal((await handler(event, '123456789')).ok, true)
    frame.url += '?unsafe'
    assert.equal((await handler(event, '123456789')).code, 'unauthorized')
    assert.equal(calls, 1)
    frame.url = 'file:///C:/Users/ADMINI~1/AppData/Local/Temp/portable/resources/app.asar/dist/index.html'
    assert.equal((await handler({ ...event, senderFrame: { url: frame.url } }, '123456789')).code, 'unauthorized')
  } finally { dispose() }
})
