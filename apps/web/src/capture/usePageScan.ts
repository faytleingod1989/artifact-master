import { useEffect, useRef, useState } from 'react'
import { createPageScanController } from './pageScanController'
import { createPageScanDriver } from './pageScanBridge'
import type { CaptureController } from './captureController'
import { PAGE_BATCH_LIMIT, type CaptureQueueSnapshot } from './captureQueueTypes'
import type { PageScanSnapshot } from './pageScanTypes'
type Options = { sourceId: string; begin: () => Promise<void>; controller: () => CaptureController | null; queue: () => CaptureQueueSnapshot; onActive: (active: boolean) => void; onComplete: () => void; onError: (message: string) => void }
const empty: PageScanSnapshot={pageId:'',state:'idle',cells:[]}
export function usePageScan(options: Options) {
  const latest=useRef(options); latest.current=options
  const current=useRef<ReturnType<typeof createPageScanController>|null>(null), alive=useRef(true), epoch=useRef(0), active=useRef(false)
  const [snapshot,setSnapshot]=useState(empty)
  useEffect(()=>{ const lifecycle=alive, token=epoch, scanner=current; lifecycle.current=true; return()=>{ lifecycle.current=false; token.current++; void scanner.current?.dispose(); scanner.current=null } },[])
  const run=async(action:'start'|'resume'|'next')=>{
    const opt=latest.current, bridge=window.artifactDesktop?.pageScan
    if(!bridge||!opt.sourceId.startsWith('window:')) {opt.onError('当前页扫描需要选择原神窗口，不能选择整个屏幕。');return}
    const token=++epoch.current
    try {
      await opt.begin()
      if(!alive.current||token!==epoch.current)return
      if(!current.current) {
        const driver=await createPageScanDriver(bridge,opt.sourceId)
        if(!alive.current||token!==epoch.current){await driver.close();return}
        const scanner=createPageScanController({sourceId:opt.sourceId,driver,
          canCapture:()=>{const q=latest.current.queue();return q.accepting&&!q.capturing&&!q.ocrPaused&&q.jobs.length<PAGE_BATCH_LIMIT&&q.heldSourceBytes<128*1024*1024},
          enqueue:(frame,pageId,cellId)=>{
            const controller=latest.current.controller();if(!controller)return{outcome:'inactive'}
            const outcome=controller.requestPageCapture({frame,pageId,cellId})
            const job=latest.current.queue().jobs.find(job=>job.pageId===pageId&&job.cellId===cellId)
            return{outcome:outcome==='started'&&!job?'capacity':outcome,jobId:job?.id}
          },
          onState:next=>{
            if(!alive.current||current.current!==scanner)return
            const isActive=next.state==='armed'||next.state==='scanning'||next.state==='pausing'
            if(active.current!==isActive){active.current=isActive;latest.current.onActive(isActive)}
            setSnapshot(next)
            if(next.state==='page-complete')latest.current.onComplete()
          },
        })
        current.current=scanner
      }
      if(action==='start')await current.current.start();else if(action==='resume')await current.current.resume();else await current.current.nextPage()
    }catch(error){if(alive.current)latest.current.onError(error instanceof Error?error.message:'当前页扫描未能启动。')}
  }
  return {snapshot,active: snapshot.state==='armed'||snapshot.state==='scanning'||snapshot.state==='pausing',start:()=>run('start'),resume:()=>run('resume'),next:()=>run('next'),pause:()=>{epoch.current++;void current.current?.pause()},async reset(){epoch.current++;const old=current.current;current.current=null;await old?.dispose();active.current=false;if(alive.current)setSnapshot(empty)} }
}
