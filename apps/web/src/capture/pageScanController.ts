import type { PageObservation, PageScanOptions, PageScanSnapshot } from './pageScanTypes'
import { validatePageObservation } from './pageScanLayout'
import { createPageStability } from './pageScanStability'
export function createPageScanController(options: PageScanOptions) {
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)))
  const now = options.now ?? (() => performance.now())
  let epoch = 0, busy = false, disposed = false, baseline: PageObservation | undefined
  let snapshot: PageScanSnapshot = { pageId: '', state: 'idle', cells: [] }
  let stopping:Promise<void>|undefined
  const publish = (next: Partial<PageScanSnapshot>) => { snapshot = { ...snapshot, ...next }; if (!disposed) options.onState(snapshot) }
  const valid = (token: number) => token === epoch && !disposed
  const quiesce=(state:'paused'|'page-complete',reason:string,token:number):Promise<void>=>{
    if(stopping)return stopping
    publish({state:'pausing',reason:'正在停止原生输入；确认退出后才恢复手动 F8。'})
    stopping=(async()=>{
      try{await options.driver.pause();if(valid(token))publish({state,reason})}
      catch(error){if(valid(token))publish({state:'pausing',reason:'未确认输入已停止，请关闭助手。'+(error instanceof Error?error.message:'')})}
    })().finally(()=>{stopping=undefined})
    return stopping
  }
  const formatMismatches = (observation: PageObservation) => {
    const list = observation.mismatches
    if (!list?.length) return ''
    const first = list[0], n = first.norm
    const band = n && n.length === 6 ? `(上${n[0]}/${n[1]} 下${n[2]}/${n[3]} 等级${n[4]}/${n[5]}@${first.pose ?? 1}x)` : ''
    return ` 首格 ${first.id}/${first.branch}${band}；不匹配(${list.length})：${list.slice(0, 6).map(item => `${item.id}/${item.branch}`).join('、')}。`
  }
  const check = (observation: PageObservation, comparePage = true, stage = '页面校验') => {
    validatePageObservation(observation, options.sourceId)
    if (observation.emergencyStop) throw Error('鼠标右键已停止扫描，请确认页面后手动继续。')
    if (!observation.foreground) throw Error('原神已失去前台，已暂停，不会点击其他窗口。')
    if (!observation.validLayout || !observation.cells.length) throw Error(`未确认五星圣遗物列表，请打开详情页；可改用 F8 手动录入。${observation.layoutIssue ? `（诊断：${observation.layoutIssue}）` : ''}`)
    if (baseline && ((comparePage && baseline.pageSignature !== observation.pageSignature) || baseline.geometryKey !== observation.geometryKey || baseline.width !== observation.width || baseline.height !== observation.height)) {
      const kind=baseline.width!==observation.width||baseline.height!==observation.height?'窗口尺寸变化':baseline.geometryKey!==observation.geometryKey?'窗口位置变化':baseline.gridSignature&&observation.gridSignature?(baseline.gridSignature===observation.gridSignature?'列表画面变化（格位边缘未变）':'列表画面变化（格位边缘也有变化，不代表已经翻页）'):'列表画面变化（缺少独立边缘信息）'
      const ver=observation.scriptVersion?` [${observation.scriptVersion}/${observation.matcherVersion ?? 'default'}]`:''
      throw Error(`[${stage}] ${kind}。格位 ${baseline.cells.length}→${observation.cells.length}；选中 ${baseline.selectedCellId??'未知'}→${observation.selectedCellId??'未知'}；窗口 ${baseline.geometryKey}→${observation.geometryKey}；页面 ${baseline.pageSignature.slice(0,8)}→${observation.pageSignature.slice(0,8)}；布局 ${baseline.gridSignature?.slice(0,8)??'未知'}→${observation.gridSignature?.slice(0,8)??'未知'}。${formatMismatches(observation)}请勿翻页后沿用旧格位。${ver}`)
    }
  }
  async function run(fresh: boolean) {
    if (disposed) return
    if (busy||stopping||snapshot.state==='pausing') { publish({ reason: '上一操作正在结束，请稍后继续；未确认停止前不恢复 F8。' }); return }
    const token = ++epoch; busy = true
    publish({ state: 'armed', reason: '请切回原神，保持背包详情页静止；右键可紧急停止。' })
    try {
      if(fresh){await options.driver.resetPage();if(!valid(token))return}
      await options.driver.resume()
      if (!valid(token)) return
      const armedAt = now()
      let observation = await options.driver.observe()
      while (valid(token) && !observation.foreground && !observation.emergencyStop && now() - armedAt < 30000) { await sleep(100); if (!valid(token)) return; observation = await options.driver.observe() }
      if (!valid(token)) return
      if (fresh) baseline = undefined
      check(observation,false,'切回游戏后')
      if(!options.canCapture())throw Error('采集容量或引擎状态已变化，未开始自动输入。')
      const preparationAnchor=observation
      await options.driver.prepare(); if(!valid(token))return
      const checkPrepared=(value:PageObservation)=>{
        check(value,false,'清除悬停后')
        if(value.geometryKey!==preparationAnchor.geometryKey||value.width!==preparationAnchor.width||value.height!==preparationAnchor.height)throw Error(`[清除悬停后] 窗口位置或尺寸已变化（${preparationAnchor.geometryKey}→${value.geometryKey}），未建立新页基线。`)
      }
      // Pin the bounded native appearance reference BEFORE asking for stable
      // evidence. Unsealed raw rendering hashes can keep changing forever.
      // Sealing is read-only; no cell click occurs until the new-frame gate.
      observation=await options.driver.observe();if(!valid(token))return;checkPrepared(observation)
      check(observation,true,'封存启动参考前')
      const startupReference=observation
      await options.driver.anchor();if(!valid(token))return
      const initialStable=createPageStability(),preparedAt=now();let prepared=false,newFrames=0,detailChanges=0,lastSequence=startupReference.frameSequence,lastDetail=startupReference.detailSignature
      while(valid(token)&&now()-preparedAt<=1500){
        observation=await options.driver.observe();if(!valid(token))return;checkPrepared(observation)
        const structureChanged=observation.cells.length!==startupReference.cells.length||observation.cells.some((cell,index)=>cell.id!==startupReference.cells[index]?.id)
        if(structureChanged||(observation.pageSignature!==startupReference.pageSignature&&observation.pageStatus!=='TRANSIENT'))throw Error(`[启动前参考校验] 列表画面或格位证据变化（${startupReference.pageSignature.slice(0,8)}→${observation.pageSignature.slice(0,8)}），已暂停，未点击圣遗物。${formatMismatches(observation)}`)
        if(observation.frameSequence>lastSequence){newFrames++;if(observation.detailSignature!==lastDetail)detailChanges++;lastSequence=observation.frameSequence;lastDetail=observation.detailSignature}
        const sameStartupPage=observation.pageSignature===startupReference.pageSignature
        if(initialStable(sameStartupPage?observation:{...observation,pageSignature:''},undefined,now())&&sameStartupPage){prepared=true;break}
        await sleep(50)
      }
      if(!valid(token))return
      if(!prepared){
        if(observation.pageSignature!==startupReference.pageSignature)throw Error(`[启动前参考校验] 列表画面或格位证据变化（${startupReference.pageSignature.slice(0,8)}→${observation.pageSignature.slice(0,8)}），已暂停，未点击圣遗物。${formatMismatches(observation)}`)
        throw Error(`启动前详情证据未稳定（新帧${newFrames}，详情变化${detailChanges}，用时${Math.round(now()-preparedAt)}毫秒），已暂停，未点击圣遗物。`)
      }
      check(observation,true,'建立或恢复当前页')
      if (fresh) {
        baseline = observation
        publish({ pageId: crypto.randomUUID(), state: 'scanning', reason: undefined, cells: [...observation.cells].sort((a,b) => a.row - b.row || a.col - b.col).map(cell => ({ id: cell.id, state: 'waiting' })) })
      } else publish({ state: 'scanning', reason: undefined })
      for (const cell of snapshot.cells.filter(cell => cell.state === 'waiting')) {
        if (!valid(token)) return
        if (!options.canCapture()) throw Error('采集队列或图片预算已满／引擎暂停，请先核对或丢弃，再确认当前页未改变后继续。')
        observation = await options.driver.observe(); if (!valid(token)) return
        const preClickAt = now()
        while (valid(token) && observation.pageSignature !== baseline?.pageSignature && observation.pageStatus === 'TRANSIENT' && now() - preClickAt <= 400) {
          check(observation, false, `点击 ${cell.id} 前`)
          await sleep(50); if (!valid(token)) return
          observation = await options.driver.observe(); if (!valid(token)) return
        }
        check(observation,true,`点击 ${cell.id} 前`)
        if(!options.canCapture())throw Error('采集容量或引擎状态已变化，未点击下一格。')
        await options.driver.select(cell.id); if (!valid(token)) return
        const stable = createPageStability(), switchedAt = now()
        let ready = false
        while (valid(token) && now() - switchedAt <= 3000) {
          observation = await options.driver.observe(); if (!valid(token)) return; check(observation,false,`格位 ${cell.id} 等待稳定`)
          const sameBaselinePage = observation.pageSignature === baseline?.pageSignature
          if (stable(sameBaselinePage ? observation : { ...observation, pageSignature: '' }, cell.id, now()) && sameBaselinePage) { check(observation,true,`格位 ${cell.id} 稳定后`); ready = true; break }
          await sleep(50)
        }
        if (!valid(token)) return
        if (!ready) {
          // A transient mismatch is never accepted or rebased. If it remains
          // after the bounded wait, retain the detailed page-change reason.
          if (observation.pageSignature !== baseline?.pageSignature) check(observation,true,`格位 ${cell.id} 稳定后`)
          const selInfo = observation.selection ? `，候选 ${observation.selection.candidate ?? '无'}(${observation.selection.best}/${observation.selection.runnerUp})` : ''
          throw Error(`格位 ${cell.id} 的详情切换未稳定，已暂停；不会采集上一件冒充下一件。（选中 ${observation.selectedCellId ?? '未知'}${selInfo}，页面 ${observation.pageSignature === baseline?.pageSignature ? '一致' : `${baseline?.pageSignature.slice(0, 8)}→${observation.pageSignature.slice(0, 8)}`}，详情 ${observation.detailSignature.slice(0, 8)}）`)
        }
        const freezeStarted = now(), frozen = await options.driver.freeze(cell.id); if (!valid(token)) return
        const frame = { ...frozen, captureMs: Math.round(now() - freezeStarted) }
        if (frame.width !== baseline!.width || frame.height !== baseline!.height) throw Error('截图尺寸已变化，未加入队列。')
        const result = options.enqueue(frame, snapshot.pageId, cell.id)
        if (result.outcome !== 'started' || !result.jobId) throw Error('截图未能加入队列，已暂停；请处理已有任务后继续此格。')
        publish({ cells: snapshot.cells.map(item => item.id === cell.id ? { ...item, state: 'captured', jobId: result.jobId } : item) })
      }
      if (valid(token)) await quiesce('page-complete','本页截图已保存；识别继续后台进行。请手动翻页后点击下一页。',token)
    } catch (error) {
      if (valid(token)) await quiesce('paused',error instanceof Error ? error.message : '扫描异常，已暂停。',token)
    } finally { busy = false }
  }
  return {
    start: () => run(true), resume: () => run(!baseline),
    nextPage: () => snapshot.state === 'page-complete' ? run(true) : Promise.resolve(),
    pause() { if(stopping)return stopping;const token=++epoch;return quiesce('paused','已暂停自动点击；保存的截图继续识别。',token) },
    async dispose() { if (disposed) return; epoch++; publish({ state: 'stopped' }); disposed = true; await options.driver.close().catch(() => {}) },
  }
}
