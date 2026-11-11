const { test } = require('node:test'), assert = require('node:assert/strict')
const { EventEmitter } = require('node:events'), { compileFunction } = require('node:vm')
const fs = require('node:fs'), path = require('node:path')
function png(width = 10, height = 10) { const data = Buffer.alloc(33); Buffer.from('89504e470d0a1a0a', 'hex').copy(data); data.write('IHDR', 12); data.writeUInt32BE(width, 16); data.writeUInt32BE(height, 20); return 'data:image/png;base64,' + data.toString('base64') }
function load() {
  const children = [], module = { exports: {} }
  compileFunction(fs.readFileSync(path.join(__dirname, 'nativeWindowFrameClient.cjs'), 'utf8'), ['require', 'module'])(name => name === 'node:child_process' ? { spawn: () => {
    const child = new EventEmitter(); children.push(child)
    child.stdout = new EventEmitter(); child.stdout.setEncoding = () => {}; child.stderr = new EventEmitter(); child.stdin = new EventEmitter(); child.kill = () => {}
    child.stdin.write = input => { child.request = JSON.parse(input) }
    queueMicrotask(() => child.stdout.emit('data', JSON.stringify({ ready: true, pid: child.pid ?? 1234, started: '638900000000000000' }) + '\n'))
    return child
  } } : require(name), module)
  return { children, create: module.exports.createNativeWindowFrameClient }
}
test('an exit from an old failed helper cannot terminate a replacement session', async () => {
  const x = load(), client = x.create('window:123:0', 'fixed-script.ps1')
  const first = client.capture(); await new Promise(resolve => setImmediate(resolve))
  x.children[0].stdin.emit('error', Error('old pipe lost'))
  await assert.rejects(first)
  const second = client.capture(); await new Promise(resolve => setImmediate(resolve))
  x.children[0].emit('exit', 1)
  const child = x.children[1]
  child.stdout.emit('data', JSON.stringify({ id: child.request.id, width: 10, height: 10, image: png() }) + '\n')
  try { assert.equal((await second).width, 10) } finally { client.dispose() }
})
test('pixel header dimensions must match the native frame envelope', async () => {
  const x = load(), client = x.create('window:123:0', 'fixed-script.ps1')
  const job = client.capture(); await new Promise(resolve => setImmediate(resolve))
  x.children[0].stdout.emit('data', JSON.stringify({ id: 1, width: 10, height: 10, image: png(999, 999) }) + '\n')
  try { await assert.rejects(job, /pixels|dimensions/) } finally { client.dispose() }
})
test('foreign or reused source failure is not presented as an allowed snapshot fallback', async () => {
  const x = load(), client = x.create('window:123:0', 'fixed-script.ps1')
  const job = client.capture(); await new Promise(resolve => setImmediate(resolve))
  x.children[0].stdout.emit('data', JSON.stringify({ id: 1, error: 'FRAME_SOURCE_CHANGED' }) + '\n')
  try { await assert.rejects(job, error => error.code === 'FRAME_SOURCE_CHANGED') } finally { client.dispose() }
})
test('helper restart cannot bind a reused handle to a different process identity', async () => {
  const x = load(), client = x.create('window:123:0', 'fixed-script.ps1')
  const first = client.capture(); await new Promise(resolve => setImmediate(resolve))
  x.children[0].stdin.emit('error', Error('pipe lost')); await assert.rejects(first)
  const next = client.capture(); const checked = assert.rejects(next, error => error.code === 'FRAME_SOURCE_CHANGED'); x.children[1].pid = 9999
  await new Promise(resolve => setImmediate(resolve))
  const child = x.children[1]
  if (child.request) child.stdout.emit('data', JSON.stringify({ id: child.request.id, width: 10, height: 10, image: png() }) + '\n')
  try { await checked } finally { client.dispose() }
})
