const { spawn } = require('node:child_process')
const path = require('node:path')
const LIMIT = 16 * 1024 * 1024
const FIELDS = new Set(['name','slot','mainName','mainValue','level','sub0','sub1','sub2','sub3','set'])
function validateOcrRequest(value, width, height) {
  if (value === undefined) return undefined
  if (!value || value.protocolVersion !== 2 || !['auto','general'].includes(value.mode)) throw Error('OCR 请求协议无效。')
  const result = { protocolVersion: 2, mode: value.mode }
  if (value.layout !== undefined) {
    const layout = value.layout, seen = new Set()
    if (!layout || !['equipment-panel','inventory-card'].includes(layout.layoutId) || layout.width !== width || layout.height !== height || !Array.isArray(layout.fields) || layout.fields.length < 9 || layout.fields.length > 16) throw Error('OCR 字段布局无效。')
    const fields = layout.fields.map(item => {
      if (!item || !FIELDS.has(item.field) || seen.has(item.field)) throw Error('OCR 字段重复或无效。')
      seen.add(item.field)
      if (!['x','y','width','height'].every(key => Number.isSafeInteger(item[key])) || item.x < 0 || item.y < 0 || item.width <= 0 || item.height <= 0 || item.x + item.width > width || item.y + item.height > height) throw Error('OCR 字段越界。')
      return { field: item.field, x: item.x, y: item.y, width: item.width, height: item.height }
    })
    if ([...FIELDS].filter(field => field !== 'sub3').some(field => !seen.has(field))) throw Error('OCR 字段不完整。')
    result.layout = { layoutId: layout.layoutId, width, height, fields }
  }
  return result
}
function pngPayload(value) {
  if (typeof value !== 'string' || value.length > Math.ceil(LIMIT * 4 / 3) + 30 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) throw Error('OCR 仅接收有界 PNG 详情图。')
  const encoded = value.slice(22), png = Buffer.from(encoded, 'base64')
  if (encoded.length % 4 || png.toString('base64') !== encoded || png.length < 33 || png.length > LIMIT || png.subarray(0,8).toString('hex') !== '89504e470d0a1a0a' || png.subarray(12,16).toString() !== 'IHDR') throw Error('OCR 图像格式非法。')
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20)
  if (!width || !height || width > 4096 || height > 4096 || width * height > 8388608) throw Error('OCR 详情尺寸超出限制。')
  return { encoded, width, height }
}
function validateResult(value, width, height) {
  if (value?.engine !== 'PP-OCRv5-server' || value.width !== width || value.height !== height || !Number.isFinite(value.elapsedMs) || value.elapsedMs < 0 || value.elapsedMs > 30000 || !Array.isArray(value.lines) || value.lines.length > 128) throw Error('本地 OCR 返回异常。')
  const lines = value.lines.map(line => {
    if (!line || typeof line.text !== 'string' || line.text.length > 512 || !Number.isFinite(line.score) || line.score < 0 || line.score > 1 || typeof line.occluded !== 'boolean' || !Array.isArray(line.box) || line.box.length !== 4 || line.box.some(point => !Array.isArray(point) || point.length !== 2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1]) || point[0] < 0 || point[1] < 0 || point[0] > width || point[1] > height)) throw Error('本地 OCR 文字区域异常。')
    return { text: line.text, score: line.score, box: line.box, occluded: line.occluded }
  })
  const metadata = {}
  if (value.route !== undefined) {
    if (!['general','line','specialized','mixed'].includes(value.route) || value.modelId !== 'ppocr-v5-server' || !Array.isArray(value.conflicts) || value.conflicts.length > 16 || value.conflicts.some(field => !FIELDS.has(field))) throw Error('OCR 路径或冲突字段非法。')
    if (value.fallbackReason !== undefined && (typeof value.fallbackReason !== 'string' || value.fallbackReason.length > 128)) throw Error('OCR 回退原因非法。')
    const timing = value.timings
    if (!timing || !['detMs','recMs'].every(key => Number.isFinite(timing[key]) && timing[key] >= 0 && timing[key] <= 30000) || timing.decodeMs !== undefined && (!Number.isFinite(timing.decodeMs) || timing.decodeMs < 0 || timing.decodeMs > 30000)) throw Error('OCR 耗时非法。')
    Object.assign(metadata, { route: value.route, modelId: value.modelId, conflicts: value.conflicts, timings: { detMs: timing.detMs, recMs: timing.recMs, ...(timing.decodeMs !== undefined ? { decodeMs: timing.decodeMs } : {}) }, ...(value.fallbackReason ? { fallbackReason: value.fallbackReason } : {}) })
    if (value.primaryLines !== undefined) {
      if (!Array.isArray(value.primaryLines) || value.primaryLines.length > 16) throw Error('OCR 原始字段超限。')
      metadata.primaryLines = validateResult({ engine: value.engine, width, height, elapsedMs: value.elapsedMs, lines: value.primaryLines }, width, height).lines
    }
  }
  return { engine: value.engine, width, height, elapsedMs: value.elapsedMs, lines, ...metadata }
}
function createNativeOcrClient(runtimeDir) {
  let state, pending, sequence = 0, generation = 0
  function fail(current, message) {
    if (state !== current) return
    state = undefined
    const error = Object.assign(Error(message), { code: 'OCR_ENGINE_UNAVAILABLE' })
    clearTimeout(current.timer); current.reject?.(error); current.reject = undefined
    if (pending) { clearTimeout(pending.timer); pending.reject(error); pending = undefined }
    current.child.kill()
  }
  function start() {
    if (state) return state.ready
    const child = spawn(path.join(runtimeDir, 'ArtifactOcrWorker.exe'), ['--models', path.join(runtimeDir, 'models')], { windowsHide: true, shell: false, stdio: ['pipe','pipe','pipe'], env: { ...process.env, PYTHONNOUSERSITE: '1' } })
    const current = { child, buffer: '', resolve: undefined, reject: undefined, timer: undefined }
    current.ready = new Promise((resolve, reject) => { current.resolve = resolve; current.reject = reject })
    state = current
    current.timer = setTimeout(() => fail(current, '本地 OCR 启动超时。'), 30000)
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      if (state !== current) return
      current.buffer += chunk
      if (Buffer.byteLength(current.buffer) > 1024 * 1024) return fail(current, '本地 OCR 输出超限。')
      let end
      while ((end = current.buffer.indexOf('\n')) >= 0) {
        const line = current.buffer.slice(0,end); current.buffer = current.buffer.slice(end + 1)
        let reply; try { reply = JSON.parse(line) } catch { return fail(current, '本地 OCR 协议异常。') }
        if (current.resolve) {
          if (reply.ready !== true || reply.engine !== 'PP-OCRv5-server') return fail(current, '本地 OCR 初始化失败。')
          current.protocolVersion = reply.protocolVersion ?? 1
          if (![1,2].includes(current.protocolVersion)) return fail(current, '本地 OCR 协议版本不匹配。')
          clearTimeout(current.timer); current.resolve(); current.resolve = undefined; current.reject = undefined
        } else {
          if (!pending || reply.id !== pending.id) return fail(current, '本地 OCR 响应已过期。')
          const job = pending; pending = undefined; clearTimeout(job.timer)
          if (reply.error) job.reject(Error('本地 OCR 识别失败，请重新采集。'))
          else { try { job.resolve(validateResult(reply, job.width, job.height)) } catch (error) { job.reject(Object.assign(error, { code: 'OCR_ENGINE_UNAVAILABLE' })); fail(current, '本地 OCR 返回异常。') } }
        }
      }
    })
    // Drain diagnostics without retaining potentially sensitive frame contents.
    child.stderr.on('data', () => {})
    child.stdin.on('error', () => fail(current, '本地 OCR 通道已关闭。'))
    child.on('error', () => fail(current, '本地 OCR 组件缺失或无法启动，请使用完整离线包。'))
    child.on('exit', () => fail(current, '本地 OCR 已退出，请重新启动采集。'))
    return current.ready
  }
  return {
    start,
    async recognize(image, request) {
      const parsed = pngPayload(image), validated = validateOcrRequest(request, parsed.width, parsed.height), token = generation; await start()
      if (!state || token !== generation) throw Error('识别会话已经结束。')
      if (validated?.mode === 'auto' && state.protocolVersion !== 2) throw Object.assign(Error('本地 OCR 组件版本过旧，请使用完整的新版本程序。'), { code: 'OCR_ENGINE_UNAVAILABLE' })
      if (pending) throw Error('本地 OCR 正在处理上一帧。')
      const current = state
      return new Promise((resolve, reject) => {
        const id = ++sequence
        pending = { id, width: parsed.width, height: parsed.height, resolve, reject, timer: setTimeout(() => fail(current, '本地 OCR 识别超时，请重新采集。'), 15000) }
        current.child.stdin.write(JSON.stringify({ id, image: parsed.encoded, ...validated }) + '\n')
      })
    },
    cancel() { generation++; if (state && (pending || state.resolve)) fail(state, '识别会话已经结束。') },
    dispose() { generation++; if (state) fail(state, '识别会话已经结束。') },
  }
}
module.exports = { createNativeOcrClient, pngPayload, validateResult, validateOcrRequest }
