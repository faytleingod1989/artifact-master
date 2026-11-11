const { spawn } = require('node:child_process')
const path = require('node:path')
function createNativeWindowFrameClient(sourceId, scriptPath) {
  const match = /^window:([1-9]\d*):\d+$/.exec(sourceId)
  if (!match || !Number.isSafeInteger(Number(match[1]))) throw Error('Invalid window source')
  let child, ready, pending, sequence = 0, buffer = '', disposed = false, startResolve, startReject, timer, epoch = 0, identity
  const failure = (message, code = 'FRAME_UNAVAILABLE') => Object.assign(Error(message), { code })
  const fail = error => { epoch++; clearTimeout(timer); startReject?.(error); startReject = undefined; startResolve = undefined; if (pending) { clearTimeout(pending.timer); pending.reject(error); pending = undefined } child?.kill(); child = undefined; ready = undefined; buffer = '' }
  const start = () => {
    if (disposed) return Promise.reject(failure('Window frame session closed', 'FRAME_SOURCE_CHANGED'))
    if (ready) return ready
    const token = ++epoch
    ready = new Promise((resolve, reject) => { startResolve = resolve; startReject = reject })
    child = spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-WindowHandle', match[1]], { windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] })
    timer = setTimeout(() => fail(failure('Native window frame initialization timed out')), 10000)
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      if (token !== epoch) return
      buffer += chunk
      if (buffer.length > 45000000) return fail(failure('Native window frame exceeded limit'))
      let end
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1)
        let response; try { response = JSON.parse(line) } catch { return fail(failure('Invalid native window response')) }
        if (startResolve) {
          if (response.ready !== true) return fail(failure('Native window source could not open', 'FRAME_SOURCE_CHANGED'))
          if (!Number.isSafeInteger(response.pid) || response.pid <= 0 || typeof response.started !== 'string' || !/^\d{15,20}$/.test(response.started)) return fail(failure('Native window identity missing', 'FRAME_SOURCE_CHANGED'))
          const key = response.pid + ':' + response.started
          if (identity && identity !== key) return fail(failure('Window process identity changed', 'FRAME_SOURCE_CHANGED'))
          identity = key
          clearTimeout(timer); const resolve = startResolve; startResolve = startReject = undefined; resolve()
        } else {
          const job = pending
          if (!job || response.id !== job.id) return fail(failure('Stale native window frame'))
          pending = undefined; clearTimeout(job.timer)
          if (response.error) job.reject(failure(String(response.error).slice(0, 160), response.error === 'FRAME_SOURCE_CHANGED' ? 'FRAME_SOURCE_CHANGED' : 'FRAME_UNAVAILABLE'))
          else if (![response.width, response.height].every(v => Number.isSafeInteger(v) && v > 0 && v <= 8192) || response.width * response.height > 33554432 || typeof response.image !== 'string' || response.image.length > 45000000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(response.image)) job.reject(failure('Invalid native window pixels'))
          else {
            const encoded = response.image.slice(22), pixels = Buffer.from(encoded, 'base64')
            if (encoded.length % 4 || pixels.toString('base64') !== encoded || pixels.length < 33 || pixels.length > 33554432 || pixels.subarray(0,8).toString('hex') !== '89504e470d0a1a0a' || pixels.subarray(12,16).toString() !== 'IHDR' || pixels.readUInt32BE(16) !== response.width || pixels.readUInt32BE(20) !== response.height) job.reject(failure('Native window pixel dimensions do not match'))
            else job.resolve({ width: response.width, height: response.height, image: response.image, frameSequence: job.id })
          }
        }
      }
    })
    child.stderr.on('data', () => {})
    child.stdin.on('error', () => { if (token === epoch) fail(failure('Native window input closed')) })
    child.on('error', () => { if (token === epoch) fail(failure('Native window helper unavailable')) })
    child.on('exit', () => { if (token === epoch) fail(failure('Native window helper exited')) })
    return ready
  }
  return {
    async capture() {
      await start()
      if (disposed || !child) throw failure('Window session closed', 'FRAME_SOURCE_CHANGED')
      if (pending) throw failure('Window frame acquisition busy')
      return new Promise((resolve, reject) => {
        const id = ++sequence
        pending = { id, resolve, reject, timer: setTimeout(() => fail(failure('Native window frame timed out')), 4000) }
        child.stdin.write(JSON.stringify({ id, action: 'capture' }) + '\n')
      })
    },
    dispose() { disposed = true; fail(failure('Window frame session closed', 'FRAME_SOURCE_CHANGED')) },
  }
}
module.exports = { createNativeWindowFrameClient }
