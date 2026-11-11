const { test } = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path')
const { createNativeOcrClient, pngPayload, validateResult } = require('./nativeOcrClient.cjs')
const runtime = path.resolve(__dirname, '../native-ocr/runtime/ArtifactOcrWorker')
const fixture = path.resolve(__dirname, '../../../tests/private/ocr/flower-shadow-level20-compare-detail.png')
test('preserves validated field-route diagnostics and rejects invented routes or conflict fields', () => {
  const base = { engine: 'PP-OCRv5-server', width: 911, height: 798, elapsedMs: 1, lines: [], route: 'line', modelId: 'ppocr-v5-server', conflicts: [], timings: { detMs: 0, recMs: 1 } }
  assert.equal(validateResult(base, 911, 798).route, 'line')
  assert.throws(() => validateResult({ ...base, route: 'remote' }, 911, 798))
  assert.throws(() => validateResult({ ...base, conflicts: ['arbitrary-private-field'] }, 911, 798))
})
test('malformed native response is typed as an unavailable engine so the retained queue can pause', async () => {
  const { EventEmitter } = require('node:events'), { compileFunction } = require('node:vm')
  const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stdout.setEncoding = () => {}; child.stderr = new EventEmitter(); child.stdin = new EventEmitter(); child.kill = () => {}
  child.stdin.write = line => { const { id } = JSON.parse(line); queueMicrotask(() => child.stdout.emit('data', JSON.stringify({ id, engine: 'broken-response' }) + '\n')) }
  const isolated = { exports: {} }
  compileFunction(fs.readFileSync(path.join(__dirname, 'nativeOcrClient.cjs'), 'utf8'), ['require', 'module', 'exports'])(name => name === 'node:child_process' ? { spawn: () => { queueMicrotask(() => child.stdout.emit('data', '{"ready":true,"engine":"PP-OCRv5-server"}\n')); return child } } : require(name), isolated, isolated.exports)
  const client = isolated.exports.createNativeOcrClient('unused-controlled-runtime')
  const png = Buffer.alloc(33); Buffer.from('89504e470d0a1a0a','hex').copy(png); png.write('IHDR',12); png.writeUInt32BE(911,16); png.writeUInt32BE(798,20)
  try { await assert.rejects(client.recognize('data:image/png;base64,' + png.toString('base64')), error => error.code === 'OCR_ENGINE_UNAVAILABLE') }
  finally { client.dispose() }
})
test('missing native runtime is a typed engine failure rather than a retryable image failure', async () => {
  const client = createNativeOcrClient(path.join(runtime, 'missing-runtime'))
  try { await assert.rejects(client.start(), error => error.code === 'OCR_ENGINE_UNAVAILABLE') }
  finally { client.dispose() }
})
test('PNG bounds and native response validation reject arbitrary paths, giant images and malformed text boxes', () => {
  for (const value of ['', null, 'file:///private.png', 'data:image/png;base64,AAA=']) assert.throws(() => pngPayload(value))
  const png = Buffer.alloc(33); Buffer.from('89504e470d0a1a0a','hex').copy(png); png.write('IHDR',12); png.writeUInt32BE(8192,16); png.writeUInt32BE(8192,20)
  assert.throws(() => pngPayload('data:image/png;base64,' + png.toString('base64')))
  for (const value of [{}, { engine: 'unexpected', width: 911, height: 798, elapsedMs: 1, lines: [] }, { engine: 'PP-OCRv5-server', width: 911, height: 798, elapsedMs: 1, lines: [{ text: '攻击力+9.9%', score: 1, occluded: false, box: [[-1,0],[1,0],[1,1],[0,1]] }] }]) assert.throws(() => validateResult(value, 911, 798))
})
test('cancel between a warm readiness promise and dispatch never submits an old frame into a new session', { skip: !fs.existsSync(fixture) || !fs.existsSync(path.join(runtime,'ArtifactOcrWorker.exe')) }, async () => {
  const client = createNativeOcrClient(runtime)
  try {
    await client.start()
    const image = 'data:image/png;base64,' + fs.readFileSync(fixture).toString('base64')
    const old = client.recognize(image); const rejected = assert.rejects(old, /结束|取消/)
    client.cancel(); await rejected
    const result = await client.recognize(image)
    assert.equal(result.engine, 'PP-OCRv5-server')
    assert.ok(result.lines.some(line => line.text.includes('元素充能效率+6.5%')))
  } finally { client.dispose() }
})
