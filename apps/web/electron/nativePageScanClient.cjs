const { spawn } = require('node:child_process')
const path = require('node:path')
const { pngPayload } = require('./nativeOcrClient.cjs')
const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
// Diagnostics are explanatory only: malformed pieces are dropped, never used to
// accept a page, and never allowed to grow the renderer payload without bound.
function sanitizeDiagnostics(value, seen) {
  const result = {}
  if (['SAME', 'TRANSIENT', 'CHANGED', 'UNKNOWN'].includes(value.pageStatus)) result.pageStatus = value.pageStatus
  for (const key of ['scriptVersion', 'matcherVersion']) if (typeof value[key] === 'string' && /^[\w.-]{1,64}$/.test(value[key])) result[key] = value[key]
  if (typeof value.layoutIssue === 'string' && value.layoutIssue) result.layoutIssue = value.layoutIssue.replace(/[^\x20-\x7e]/g, ' ').slice(0, 160)
  if (finite(value.selectionBest, 0, 1) && finite(value.selectionRunnerUp, 0, 1)) result.selection = { best: value.selectionBest, runnerUp: value.selectionRunnerUp, ...(typeof value.selectionCandidate === 'string' && seen.has(value.selectionCandidate) ? { candidate: value.selectionCandidate } : {}) }
  if (finite(value.grabMs, 0, 60000) && finite(value.analyzeMs, 0, 60000)) result.timing = { grabMs: value.grabMs, analyzeMs: value.analyzeMs }
  if (Array.isArray(value.mismatches)) {
    const bands = item => Array.isArray(item) && item.length === 6 && item.every((number, index) => finite(number, index % 2 ? 0 : -1, index % 2 ? 255 : 1)) ? item.slice() : undefined
    result.mismatches = value.mismatches.slice(0, 60).flatMap(item => {
      if (!item || typeof item.id !== 'string' || !seen.has(item.id) || typeof item.branch !== 'string' || !/^[a-z-]{1,32}$/.test(item.branch)) return []
      const raw = bands(item.raw), norm = bands(item.norm)
      return [{ id: item.id, branch: item.branch, referenceEmphasized: item.referenceEmphasized === true, currentEmphasized: item.currentEmphasized === true, ...(finite(item.pose, .9, 1.1) ? { pose: item.pose } : {}), ...(raw ? { raw } : {}), ...(norm ? { norm } : {}) }]
    })
  }
  return result
}
function sanitizePageObservation(value, sourceId) {
  if (!value || ![value.width,value.height,value.frameSequence].every(Number.isSafeInteger) || value.width < 320 || value.height < 240 || value.width > 4096 || value.height > 4096 || value.width * value.height > 8388608 || value.frameSequence < 1 || !['foreground','validLayout','emergencyStop'].every(key => typeof value[key] === 'boolean') || typeof value.geometryKey !== 'string' || value.geometryKey.length > 128 || !value.geometryKey.startsWith(value.width + 'x' + value.height + '@') || !['pageSignature','detailSignature'].every(key => typeof value[key] === 'string' && value[key].length <= 128) || !Array.isArray(value.cells) || value.cells.length > 60) throw Error('原生窗口布局响应异常，已停止输入。')
  const seen = new Set()
  if(value.gridSignature!==undefined&&(typeof value.gridSignature!=='string'||(!/^[a-f0-9]{64}$/.test(value.gridSignature)&&!(value.gridSignature===''&&!value.validLayout))))throw Error('原生格位诊断响应异常。')
  const cells = value.cells.map(cell => {
    if (!cell || !Number.isInteger(cell.row) || !Number.isInteger(cell.col) || cell.row < 0 || cell.col < 0 || cell.row > 15 || cell.col > 15 || cell.id !== `r${cell.row}c${cell.col}` || seen.has(cell.id) || cell.rarity !== 5 || typeof cell.selected !== 'boolean') throw Error('原生窗口格位异常。')
    seen.add(cell.id)
    return { id: cell.id, row: cell.row, col: cell.col, rarity: 5, selected: cell.selected, ...(typeof cell.gameLocked === 'boolean' ? { gameLocked: cell.gameLocked } : {}) }
  })
  const selected = value.selectedCellId ?? undefined
  if (selected !== undefined && (!seen.has(selected) || cells.filter(cell => cell.selected && cell.id === selected).length !== 1) || cells.filter(cell => cell.selected).length > 1) throw Error('原生选中格位不匹配。')
  return { sourceId, width: value.width, height: value.height, frameSequence: value.frameSequence, foreground: value.foreground, validLayout: value.validLayout, emergencyStop: value.emergencyStop, geometryKey: value.geometryKey, pageSignature: value.pageSignature, detailSignature: value.detailSignature, cells, ...(value.gridSignature?{gridSignature:value.gridSignature}:{}), ...(selected !== undefined ? { selectedCellId: selected } : {}), ...sanitizeDiagnostics(value, seen) }
}
// Native failure codes carry an ASCII explanation after the colon, e.g.
// "PAGE_CHANGED:before r0c3 n=1 r2c7/level(...)". Keep it bounded and visible.
function nativeDetail(value, code) {
  const index = value.indexOf(code + ':')
  return index < 0 ? '' : value.slice(index + code.length + 1).replace(/["\r\n]+.*$/s, '').replace(/[^\x20-\x7e]/g, ' ').trim().slice(0, 220)
}
function scanError(message) {
  const value = String(message)
  if (value.includes('NOT_GENSHIN_PROCESS')) return Error('所选窗口不是原神进程，未启用自动点击。')
  if (value.includes('FOCUS_LOST')) return Error('原神已失去前台，扫描已暂停。')
  if (value.includes('SOURCE_CHANGED')) return Error('目标窗口身份已变化，请重新选择。')
  if (value.includes('INPUT_PAUSED')) return Error('自动输入已暂停；确认鼠标右键已松开后手动继续。')
  if (value.includes('PAGE_CHANGED')) return Error(`[PAGE_CHANGED] 原生复核发现格位外观与启动参考不一致，未点击／未保存截图。诊断：${nativeDetail(value, 'PAGE_CHANGED')}`)
  if (value.includes('PAGE_UNCERTAIN')) return Error(`[PAGE_UNCERTAIN] 原生复核无法确认格位布局，未点击／未保存截图。诊断：${nativeDetail(value, 'PAGE_UNCERTAIN')}`)
  if (value.includes('SELECTION_UNCONFIRMED')) return Error(`[SELECTION_UNCONFIRMED] 截图前未确认目标格位为唯一选中，未保存截图。诊断：${nativeDetail(value, 'SELECTION_UNCONFIRMED')}`)
  if (value.includes('DETAIL_UNSTABLE')) return Error(`[DETAIL_UNSTABLE] 截图时右侧详情仍在变化，未保存截图。诊断：${nativeDetail(value, 'DETAIL_UNSTABLE')}`)
  if (value.includes('SELECTION_CHANGED')) return Error('选中格位或页面已变化，未保存错误截图。')
  if (value.includes('GEOMETRY_CHANGED')) return Error('窗口位置或尺寸已变化，已暂停。')
  if (value.includes('INPUT_FAILED')) return Error('Windows 未允许模拟点击。原神以管理员身份运行时，请手动以管理员身份启动本工具再试；程序不会自动提权。')
  return Error('原生单页扫描不可用：' + value.slice(0, 180))
}
function createNativePageScanClient(sourceId, scriptPath, options = {}) {
  const match = /^window:([1-9]\d*):\d+$/.exec(sourceId)
  if (!match || !Number.isSafeInteger(Number(match[1]))) throw Error('Invalid page scan source')
  const diagnosticsArgs = typeof options.diagnosticsDir === 'string' && path.isAbsolute(options.diagnosticsDir) ? ['-DiagnosticsDir', options.diagnosticsDir] : []
  let child, ready, resolveReady, rejectReady, startTimer, buffer = '', disposed = false, sequence = 0, epoch = 0, identity, stopping, stopFailure, savedAnchor, restoreNeeded=false, restoring
  const pending = new Map()
  const rejectJobs = error => { clearTimeout(startTimer); rejectReady?.(error); resolveReady=rejectReady=undefined; for(const job of pending.values()){clearTimeout(job.timer);job.reject(error)}pending.clear() }
  const fail = error => {
    if (disposed) return
    disposed = true; rejectJobs(error)
    // Failure paths must revoke the producer with the same confirmed-exit
    // semantics as explicit pause. Losing its reference cannot prove it stopped.
    void stopInput().catch(()=>{})
  }
  const stopInput = () => {
    if(stopFailure)return Promise.reject(stopFailure)
    if(stopping)return stopping
    const old=child;child=undefined;epoch++;rejectJobs(scanError('INPUT_PAUSED'));ready=undefined;buffer='';restoreNeeded=Boolean(savedAnchor)
    if(!old)return Promise.resolve({ok:true})
    // Never put a pause behind synchronous Grab/Select on stdin. Revoke the
    // whole input producer immediately, then acknowledge only confirmed exit.
    stopping=new Promise((resolve,reject)=>{
      let timer
      const exited=()=>{clearTimeout(timer);resolve({ok:true})}
      old.once('exit',exited)
      timer=setTimeout(()=>{old.removeListener('exit',exited);disposed=true;stopFailure=scanError('未确认原生输入组件已退出；请关闭助手，不要继续扫描');reject(stopFailure)},1500)
      if(old.exitCode!==undefined&&old.exitCode!==null){exited();return}
      try{if(old.kill()===false)throw Error('kill refused')}
      catch{clearTimeout(timer);old.removeListener('exit',exited);disposed=true;stopFailure=scanError('无法确认原生输入组件已终止');reject(stopFailure)}
    }).finally(()=>{stopping=undefined})
    return stopping
  }
  const start = () => {
    if (disposed) return Promise.reject(scanError('SOURCE_CHANGED'))
    if(stopping)return stopping.then(start)
    if (ready) return ready
    ready = new Promise((resolve,reject) => { resolveReady = resolve; rejectReady = reject })
    const token=epoch
    const spawned=spawn(path.join(process.env.SystemRoot || 'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',scriptPath,'-WindowHandle',match[1],...diagnosticsArgs], { shell: false, windowsHide: true, stdio: ['pipe','pipe','pipe'] })
    child=spawned
    startTimer = setTimeout(() => fail(scanError('初始化超时；可继续使用手动 F8。')),10000)
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      if (disposed||token!==epoch||child!==spawned) return
      buffer += chunk
      if (buffer.length > 24000000) return fail(scanError('响应超出限制'))
      let end
      while ((end=buffer.indexOf('\n')) >= 0) {
        const line=buffer.slice(0,end).trim(); buffer=buffer.slice(end+1)
        let reply; try { reply=JSON.parse(line) } catch { return fail(scanError('协议异常')) }
        if (resolveReady) {
          if (reply.ready !== true || reply.protocol !== 'page-scan-v1' || !Number.isSafeInteger(reply.pid) || reply.pid <= 0 || typeof reply.started !== 'string' || !/^\d{15,20}$/.test(reply.started)) return fail(scanError(reply.error ?? '窗口身份无法核实'))
          if(identity&&(identity.pid!==reply.pid||identity.started!==reply.started))return fail(scanError('SOURCE_CHANGED'))
          identity??={pid:reply.pid,started:reply.started}
          restoreNeeded=Boolean(savedAnchor)
          clearTimeout(startTimer); const resolve=resolveReady; resolveReady=rejectReady=undefined; resolve()
        } else {
          const job=pending.get(reply.id)
          if (!job) return fail(scanError('过期响应'))
          clearTimeout(job.timer); pending.delete(reply.id)
          if (reply.error) { job.reject(scanError(reply.error)); continue }
          try {
            if (job.action === 'observe') job.resolve(sanitizePageObservation(reply.data,sourceId))
            else if (job.action === 'freeze') {
              const data=reply.data, png=pngPayload(data?.image)
              if (data.width !== png.width || data.height !== png.height) throw Error('截图尺寸不匹配')
              job.resolve({ sourceId,width:data.width,height:data.height,image:data.image,capturePath:'native-window',...(typeof data.gameLocked === 'boolean' ? { gameLocked:data.gameLocked } : {}) })
            } else {
              if (reply.data?.ok !== true) throw Error('操作未确认')
              if(job.action==='anchor'){
                const encoded=reply.data.anchor
                if(typeof encoded!=='string'||encoded.length>1048576||encoded.length<24||!/^[A-Za-z0-9+/]+=*$/.test(encoded)||Buffer.from(encoded,'base64').toString('base64')!==encoded||(savedAnchor&&savedAnchor!==encoded))throw Error('无效的内部格位锚点')
                savedAnchor=encoded;restoreNeeded=false
              }
              job.resolve({ ok:true })
            }
          } catch(error) { job.reject(error); fail(scanError('响应验证失败')) }
        }
      }
    })
    child.stderr.on('data',()=>{})
    child.stdin.on('error',()=>{if(token===epoch)fail(scanError('原生输入通道已关闭'))})
    child.on('error',()=>{if(token===epoch)fail(scanError('无法启动固定扫描组件；请使用完整安装包'))})
    child.on('exit',()=>{if(token===epoch)fail(scanError('原生扫描组件已退出'))})
    return ready
  }
  const request=value=>new Promise((resolve,reject)=>{
    if(!child||disposed)return reject(scanError('SOURCE_CHANGED'))
    const id=++sequence
    pending.set(id,{action:value.action,resolve,reject,timer:setTimeout(()=>fail(scanError('操作超时，正在停止原生组件；确认退出前不恢复 F8')),5000)})
    child.stdin.write(JSON.stringify({id,...value})+'\n')
  })
  const restore=()=>{
    if(!savedAnchor||!restoreNeeded)return Promise.resolve()
    if(restoring)return restoring
    const token=epoch
    restoring=request({action:'restore-anchor',anchor:savedAnchor}).then(()=>{if(token!==epoch||disposed)throw scanError('SOURCE_CHANGED');restoreNeeded=false}).catch(error=>{if(token===epoch)fail(error);throw error}).finally(()=>{restoring=undefined})
    return restoring
  }
  return {
    start,
    async command(value) {
      if(!value||!['observe','select','freeze','pause','resume','prepare','anchor','reset-page'].includes(value.action))throw scanError('无效操作')
      if(value.action==='pause')return stopInput()
      if(value.action==='reset-page'){
        await stopInput();if(disposed)throw scanError('SOURCE_CHANGED');savedAnchor=undefined;restoreNeeded=false;return{ok:true}
      }
      const token=epoch
      await start()
      if (disposed || !child || token!==epoch) throw scanError('SOURCE_CHANGED')
      await restore();if(disposed||!child||token!==epoch)throw scanError('SOURCE_CHANGED')
      if(pending.size>=4)throw scanError('无效或过多操作')
      return request({action:value.action,...(value.cellId?{cellId:value.cellId}:{})})
    },
    dispose() { return stopInput().finally(()=>{disposed=true}) },
  }
}
module.exports = { createNativePageScanClient, sanitizePageObservation, __private: { sanitizeDiagnostics, scanError } }
