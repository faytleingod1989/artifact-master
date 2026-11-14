import type { PageObservation, PageScanOptions, PageScanSnapshot } from './pageScanTypes'
import { validatePageObservation } from './pageScanLayout'
import { createPageStability } from './pageScanStability'
export function createPageScanController(options: PageScanOptions) {
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)))
  const now = options.now ?? (() => performance.now())
  let epoch = 0, busy = false, disposed = false, baseline: PageObservation | undefined
  let previousRowSignatures: readonly string[] = []
  let snapshot: PageScanSnapshot = { pageId: '', state: 'idle', cells: [] }
  let stopping:Promise<void>|undefined
  const publish = (next: Partial<PageScanSnapshot>) => { snapshot = { ...snapshot, ...next }; if (!disposed) options.onState(snapshot) }
  const valid = (token: number) => token === epoch && !disposed
  const quiesce=(state:'paused'|'page-complete'|'completed'|'emergency_stopped',reason:string,token:number):Promise<void>=>{
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
  const samePageAnchor = (ref: PageObservation, current: PageObservation): boolean => {
    if (ref.geometryKey !== current.geometryKey || ref.width !== current.width || ref.height !== current.height) return false
    if (ref.cells.length !== current.cells.length || ref.cells.some((cell, index) => cell.id !== current.cells[index]?.id)) return false
    if (ref.scrollAnchor && current.scrollAnchor) {
      if (ref.scrollAnchor !== current.scrollAnchor) return false
      if (current.pageStatus === 'CHANGED' && (current.mismatches?.length ?? 0) > Math.max(3, Math.floor(current.cells.length * 0.25))) return false
      return true
    }
    return ref.pageSignature === current.pageSignature
  }
  const check = (observation: PageObservation, comparePage = true, stage = '页面校验') => {
    validatePageObservation(observation, options.sourceId)
    if (observation.emergencyStop) throw Error('鼠标右键已停止扫描，请确认页面后手动继续。')
    if (!observation.foreground) throw Error('原神已失去前台，已暂停，不会点击其他窗口。')
    if (!observation.validLayout || !observation.cells.length) throw Error(`未确认五星圣遗物列表，请打开详情页；可改用 F8 手动录入。${observation.layoutIssue ? `（诊断：${observation.layoutIssue}）` : ''}`)
    if (baseline && ((comparePage && !samePageAnchor(baseline, observation)) || baseline.geometryKey !== observation.geometryKey || baseline.width !== observation.width || baseline.height !== observation.height)) {
      const kind=baseline.width!==observation.width||baseline.height!==observation.height?'窗口尺寸变化':baseline.geometryKey!==observation.geometryKey?'窗口位置变化':baseline.gridSignature&&observation.gridSignature?(baseline.gridSignature===observation.gridSignature?'列表画面变化（格位边缘未变）':'列表画面变化（格位边缘也有变化，不代表已经翻页）'):'列表画面变化（缺少独立边缘信息）'
      const ver=observation.scriptVersion?` [${observation.scriptVersion}/${observation.matcherVersion ?? 'default'}]`:''
      throw Error(`[${stage}] ${kind}。格位 ${baseline.cells.length}→${observation.cells.length}；选中 ${baseline.selectedCellId??'未知'}→${observation.selectedCellId??'未知'}；窗口 ${baseline.geometryKey}→${observation.geometryKey}；页面 ${baseline.pageSignature.slice(0,8)}→${observation.pageSignature.slice(0,8)}；布局 ${baseline.gridSignature?.slice(0,8)??'未知'}→${observation.gridSignature?.slice(0,8)??'未知'}。${formatMismatches(observation)}请勿翻页后沿用旧格位。${ver}`)
    }
  }
  const stabilizePage = async (initial: PageObservation, token: number, compareAgainstBaseline: boolean): Promise<PageObservation | undefined> => {
    const preparationAnchor = initial
    await options.driver.prepare(); if (!valid(token)) return undefined
    const checkPrepared = (value: PageObservation) => {
      check(value, false, '清除悬停后')
      if (value.geometryKey !== preparationAnchor.geometryKey || value.width !== preparationAnchor.width || value.height !== preparationAnchor.height) {
        throw Error(`[清除悬停后] 窗口位置或尺寸已变化（${preparationAnchor.geometryKey}→${value.geometryKey}），未建立新页基线。`)
      }
    }
    // Pin the bounded native appearance reference BEFORE asking for stable
    // evidence. Unsealed raw rendering hashes can keep changing forever.
    // Sealing is read-only; no cell click occurs until the new-frame gate.
    let observation = await options.driver.observe(); if (!valid(token)) return undefined; checkPrepared(observation)
    if (compareAgainstBaseline) check(observation, true, '封存启动参考前')
    const startupReference = observation
    await options.driver.anchor(); if (!valid(token)) return undefined
    const initialStable = createPageStability(), preparedAt = now()
    let prepared = false, newFrames = 0, detailChanges = 0, lastSequence = startupReference.frameSequence, lastDetail = startupReference.detailSignature
    while (valid(token) && now() - preparedAt <= 1500) {
      observation = await options.driver.observe(); if (!valid(token)) return undefined; checkPrepared(observation)
      const structureChanged = observation.cells.length !== startupReference.cells.length || observation.cells.some((cell, index) => cell.id !== startupReference.cells[index]?.id)
      const sameStartupPage = samePageAnchor(startupReference, observation)
      if (structureChanged || (!sameStartupPage && observation.pageStatus !== 'TRANSIENT')) {
        throw Error(`[启动前参考校验] 列表画面或格位证据变化（${startupReference.pageSignature.slice(0, 8)}→${observation.pageSignature.slice(0, 8)}），已暂停，未点击圣遗物。${formatMismatches(observation)}`)
      }
      if (observation.frameSequence > lastSequence) {
        newFrames++
        if (observation.detailSignature !== lastDetail) detailChanges++
        lastSequence = observation.frameSequence
        lastDetail = observation.detailSignature
      }
      if (initialStable(sameStartupPage ? observation : { ...observation, pageSignature: '', scrollAnchor: '' }, undefined, now()) && sameStartupPage) {
        prepared = true
        break
      }
      await sleep(50)
    }
    if (!valid(token)) return undefined
    if (!prepared) {
      if (!samePageAnchor(startupReference, observation)) {
        throw Error(`[启动前参考校验] 列表画面或格位证据变化（${startupReference.pageSignature.slice(0, 8)}→${observation.pageSignature.slice(0, 8)}），已暂停，未点击圣遗物。${formatMismatches(observation)}`)
      }
      throw Error(`启动前详情证据未稳定（新帧${newFrames}，详情变化${detailChanges}，用时${Math.round(now() - preparedAt)}毫秒），已暂停，未点击圣遗物。`)
    }
    check(observation, compareAgainstBaseline, '建立或恢复当前页')
    return observation
  }
  const countOverlapRows = (prevRows: readonly string[], currRows: readonly string[]): number => {
    const maxOverlap = Math.min(prevRows.length, currRows.length - 1)
    for (let overlap = maxOverlap; overlap >= 1; overlap--) {
      let matched = true
      for (let i = 0; i < overlap; i++) {
        const sig = currRows[i]
        if (!sig || prevRows[prevRows.length - overlap + i] !== sig) { matched = false; break }
      }
      if (matched) return overlap
    }
    return 0
  }
  const buildPageCells = (observation: PageObservation) => {
    const overlapRows = countOverlapRows(previousRowSignatures, observation.rowSignatures ?? [])
    return [...observation.cells]
      .sort((a, b) => a.row - b.row || a.col - b.col)
      .map(cell => ({
        id: cell.id,
        state: cell.row < overlapRows ? 'captured' as const : 'waiting' as const,
      }))
  }
  async function run(fresh: boolean) {
    if (disposed) return
    if (busy||stopping||snapshot.state==='pausing') { publish({ reason: '上一操作正在结束，请稍后继续；未确认停止前不恢复 F8。' }); return }
    const token = ++epoch; busy = true
    if (fresh) previousRowSignatures = []
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
      const established = await stabilizePage(observation, token, true)
      if (!established || !valid(token)) return
      observation = established
      if (fresh) {
        baseline = observation
        publish({ pageId: crypto.randomUUID(), state: 'scanning', reason: undefined, cells: buildPageCells(observation) })
      } else publish({ state: 'scanning', reason: undefined })
      const maxPages = Math.max(1, options.maxPages ?? 80)
      let pagesScanned = 0
      while (valid(token)) {
        for (const cell of snapshot.cells.filter(cell => cell.state === 'waiting')) {
          if (!valid(token)) return
          const stopReason = options.stopRequested?.()
          if (stopReason) { await quiesce('completed', stopReason, token); return }
          if (!options.canCapture()) throw Error('采集队列或图片预算已满／引擎暂停，请先核对或丢弃，再确认当前页未改变后继续。')
          observation = await options.driver.observe(); if (!valid(token)) return
          const preClickAt = now()
          while (valid(token) && baseline && !samePageAnchor(baseline, observation) && observation.pageStatus === 'TRANSIENT' && now() - preClickAt <= 400) {
            check(observation, false, `点击 ${cell.id} 前`)
            await sleep(50); if (!valid(token)) return
            observation = await options.driver.observe(); if (!valid(token)) return
          }
          check(observation,true,`点击 ${cell.id} 前`)
          if(!options.canCapture())throw Error('采集容量或引擎状态已变化，未点击下一格。')
          if (options.autoScroll?.()) {
            const jitter = Math.round((options.random?.() ?? Math.random()) * 35)
            if (jitter > 0) { await sleep(jitter); if (!valid(token)) return }
          }
          await options.driver.select(cell.id); if (!valid(token)) return
          const stable = createPageStability(), switchedAt = now()
          let ready = false
          while (valid(token) && now() - switchedAt <= 3000) {
            observation = await options.driver.observe(); if (!valid(token)) return; check(observation,false,`格位 ${cell.id} 等待稳定`)
            const sameBaselinePage = !baseline || samePageAnchor(baseline, observation)
            if (stable(sameBaselinePage ? observation : { ...observation, pageSignature: '', scrollAnchor: '' }, cell.id, now()) && sameBaselinePage) { check(observation,true,`格位 ${cell.id} 稳定后`); ready = true; break }
            await sleep(50)
          }
          if (!valid(token)) return
          if (!ready) {
            // A transient mismatch is never accepted or rebased. If it remains
            // after the bounded wait, retain the detailed page-change reason.
            if (baseline && !samePageAnchor(baseline, observation)) check(observation,true,`格位 ${cell.id} 稳定后`)
            const selInfo = observation.selection ? `，候选 ${observation.selection.candidate ?? '无'}(${observation.selection.best}/${observation.selection.runnerUp})` : ''
            throw Error(`格位 ${cell.id} 的详情切换未稳定，已暂停；不会采集上一件冒充下一件。（选中 ${observation.selectedCellId ?? '未知'}${selInfo}，页面 ${!baseline || samePageAnchor(baseline, observation) ? '一致' : `${baseline.pageSignature.slice(0, 8)}→${observation.pageSignature.slice(0, 8)}`}，详情 ${observation.detailSignature.slice(0, 8)}）`)
          }
          const freezeStarted = now(), frozen = await options.driver.freeze(cell.id); if (!valid(token)) return
          const frame = { ...frozen, captureMs: Math.round(now() - freezeStarted) }
          if (frame.width !== baseline!.width || frame.height !== baseline!.height) throw Error('截图尺寸已变化，未加入队列。')
          const result = options.enqueue(frame, snapshot.pageId, cell.id)
          if (result.outcome !== 'started' || !result.jobId) throw Error('截图未能加入队列，已暂停；请处理已有任务后继续此格。')
          publish({ cells: snapshot.cells.map(item => item.id === cell.id ? { ...item, state: 'captured', jobId: result.jobId } : item) })
        }
        if (!valid(token)) return
        const prevRowSigs = baseline?.rowSignatures ?? []
        previousRowSignatures = prevRowSigs
        pagesScanned++
        const postPageStopReason = options.stopRequested?.()
        if (postPageStopReason) { await quiesce('completed', postPageStopReason, token); return }
        if (!options.autoScroll?.()) {
          await quiesce('page-complete','本页截图已保存；识别继续后台进行。请手动翻页后点击下一页。',token)
          return
        }
        if (baseline?.hasFourStar) {
          await quiesce('completed', '检测到四星圣遗物边界，已自动停止五星扫描。', token)
          return
        }
        if (!options.driver.scrollDown) {
          await quiesce('page-complete','本页截图已保存；识别继续后台进行。请手动翻页后点击下一页。',token)
          return
        }
        if (pagesScanned >= maxPages) {
          await quiesce('completed', '已达到单次全自动扫描页数上限，已自动完成。', token)
          return
        }
        const prevAnchor = baseline?.scrollAnchor ?? ''
        const prevPageSig = baseline?.pageSignature ?? ''
        baseline = undefined
        publish({ state: 'scrolling', reason: '正在自动向下翻页并等待列表静止…' })
        await options.driver.scrollDown(5); if (!valid(token)) return
        await sleep(550 + Math.round((options.random?.() ?? Math.random()) * 200)); if (!valid(token)) return
        observation = await options.driver.observe(); if (!valid(token)) return
        check(observation, false, '翻页后校验')
        if (!options.canCapture()) throw Error('采集容量或引擎状态已变化，翻页后已暂停。')
        const nextPageObs = await stabilizePage(observation, token, false)
        if (!nextPageObs || !valid(token)) return
        observation = nextPageObs
        const curAnchor = observation.scrollAnchor ?? ''
        const samePageAfterScroll = Boolean((prevAnchor && curAnchor && prevAnchor === curAnchor) || (!prevAnchor && prevPageSig === observation.pageSignature))
        const currRowSigs = observation.rowSignatures ?? []
        const exactRowMatch = prevRowSigs.length > 0 && currRowSigs.length === prevRowSigs.length && currRowSigs.every((sig, index) => Boolean(sig) && sig === prevRowSigs[index])
        if (samePageAfterScroll || exactRowMatch) {
          await quiesce('completed', '已到达列表底部，全自动扫描完成。', token)
          return
        }
        baseline = observation
        publish({ pageId: crypto.randomUUID(), state: 'scanning', reason: undefined, cells: buildPageCells(observation) })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '扫描异常，已暂停。'
      const nextState = options.autoScroll?.() && message.includes('鼠标右键已停止') ? 'emergency_stopped' : 'paused'
      if (valid(token)) await quiesce(nextState, message, token)
    } finally { busy = false }
  }
  return {
    start: () => run(true), resume: () => run(!baseline),
    nextPage: () => snapshot.state === 'page-complete' ? run(true) : Promise.resolve(),
    pause() { if(stopping)return stopping;const token=++epoch;return quiesce('paused','已暂停自动点击；保存的截图继续识别。',token) },
    async dispose() { if (disposed) return; epoch++; publish({ state: 'stopped' }); disposed = true; await options.driver.close().catch(() => {}) },
  }
}
