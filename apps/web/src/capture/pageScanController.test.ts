import { expect, test } from 'vitest'
import { createPageScanController } from './pageScanController'

test('page anchors are sealed after pointer preparation and before the first click, not rebuilt per artifact',async()=>{
  const x=harness(2),observe=x.driver.observe,select=x.driver.select;let pinned=false,drifted=false
  Object.assign(x.driver,{anchor:async()=>{pinned=true},resetPage:async()=>{pinned=false}})
  x.driver.observe=async()=>({...await observe(),pageSignature:drifted&&!pinned?'boundary-drift':'page-one'})
  x.driver.select=async id=>{await select(id);drifted=true}
  await x.controller.start()
  expect(x.frames).toEqual(['r0c0','r0c1']);expect(x.state().state).toBe('page-complete')
})

test('startup seals bounded native appearance before testing stability instead of requiring raw render hashes to stop changing',async()=>{
  const x=harness(2),observe=x.driver.observe,select=x.driver.select
  let prepared=false,pinned=false,lastRaw='',reference='',raw=0,stableObservations=0
  x.driver.prepare=async()=>{prepared=true}
  x.driver.anchor=async()=>{expect(prepared).toBe(true);pinned=true;reference=lastRaw}
  x.driver.observe=async()=>{
    const value=await observe()
    if(pinned){stableObservations++;return{...value,pageSignature:reference}}
    lastRaw=`render-${++raw}`;return{...value,pageSignature:lastRaw}
  }
  x.driver.select=async id=>{expect(stableObservations).toBeGreaterThanOrEqual(3);await select(id)}
  await x.controller.start()
  expect(x.frames).toEqual(['r0c0','r0c1']);expect(x.state().state).toBe('page-complete')
})

test('a stable different page during startup cannot replace the sealed appearance reference',async()=>{
  const x=harness(2),observe=x.driver.observe;let pinned=false
  x.driver.anchor=async()=>{pinned=true}
  x.driver.observe=async()=>({...await observe(),pageSignature:pinned?'different-physical-page':'page-one'})
  await x.controller.start()
  expect(x.frames).toEqual([]);expect(x.clicks).toEqual([]);expect(x.state().state).toBe('paused')
})

test('startup still refuses changing detail evidence and reports that rather than claiming a hover failure',async()=>{
  const x=harness(2),observe=x.driver.observe;let serial=0
  x.driver.observe=async()=>({...await observe(),detailSignature:`detail-${++serial}`})
  await x.controller.start()
  expect(x.frames).toEqual([]);expect(x.clicks).toEqual([]);expect(x.state().state).toBe('paused')
  expect(x.state().reason).toContain('详情证据未稳定');expect(x.state().reason).not.toContain('悬停动画')
  expect(x.state().reason).toMatch(/新帧\d+.*详情变化\d+.*用时\d+毫秒/)
})

test('new pages explicitly clear the native anchor but capacity continuation retains it',async()=>{
  const x=harness(2);let resets=0
  Object.assign(x.driver,{resetPage:async()=>{resets++},anchor:async()=>{}})
  x.setCapacity(1);await x.controller.start();x.setCapacity(2);await x.controller.resume()
  expect(x.frames).toEqual(['r0c0','r0c1']);expect(resets).toBe(1)
  x.setCapacity(2);x.setSignature('new-page');await x.controller.nextPage()
  expect(x.frames).toHaveLength(4);expect(resets).toBe(2)
})

test('a late anchor acknowledgement after pause cannot send the first click',async()=>{
  const x=harness();let complete!:()=>void
  Object.assign(x.driver,{resetPage:async()=>{},anchor:()=>new Promise<void>(resolve=>{complete=resolve})})
  const running=x.controller.start()
  for(let i=0;i<40&&!complete;i++)await Promise.resolve()
  expect(complete).toBeTypeOf('function');await x.controller.pause();complete();await running
  expect(x.clicks).toEqual([]);expect(x.frames).toEqual([]);expect(x.state().state).toBe('paused')
})

for(const changed of ['pixels','grid'] as const)test(`page refusal identifies ${changed} changes and the exact failing scan phase`,async()=>{
  const x=harness(1),observe=x.driver.observe,select=x.driver.select;let clicked=false
  x.driver.observe=async()=>({...await observe(),gridSignature:clicked&&changed==='grid'?'b'.repeat(64):'a'.repeat(64)})
  x.driver.select=async id=>{await select(id);clicked=true;x.setSignature('page-two')}
  await x.controller.start()
  expect(x.frames).toEqual([])
  expect(x.state().reason).toContain('格位 r0c0 稳定后')
  expect(x.state().reason).toContain(changed==='grid'?'列表画面变化（格位边缘也有变化，不代表已经翻页）':'列表画面变化（格位边缘未变）')
  expect(x.state().reason).not.toContain('格位布局变化')
  expect(x.state().reason).toContain('格位 1→1')
})

test('hover is cleared before establishing a baseline, without accepting a real page change',async()=>{
  const x=harness(2);let hovered=true
  Object.assign(x.driver,{prepare:async()=>{hovered=false}})
  const observe=x.driver.observe,select=x.driver.select
  x.driver.observe=async()=>({...await observe(),pageSignature:hovered?'inflated-hover':'page-one'})
  x.driver.select=async id=>{await select(id);hovered=false}
  await x.controller.start()
  expect(x.frames).toEqual(['r0c0','r0c1']);expect(x.state().state).toBe('page-complete')
})

test('transient post-click hover is allowed to settle but is never frozen as a changed page',async()=>{
  const x=harness(2);const observe=x.driver.observe,select=x.driver.select;let transition=0
  Object.assign(x.driver,{prepare:async()=>{}})
  x.driver.select=async id=>{await select(id);transition=2}
  x.driver.observe=async()=>({...await observe(),pageSignature:transition-->0?'inflated-hover':'page-one'})
  await x.controller.start();expect(x.frames).toEqual(['r0c0','r0c1'])
})

test('a stable real reordering after a click is still rejected before freeze or the next click',async()=>{
  const x=harness(2),select=x.driver.select
  x.driver.select=async id=>{await select(id);x.setSignature('reordered-page')}
  await x.controller.start()
  expect(x.frames).toEqual([]);expect(x.clicks).toEqual(['r0c0']);expect(x.state().reason).toMatch(/页面|翻页/)
})

test('a pointer preparation finishing after pause cannot create a baseline or click',async()=>{
  const x=harness();let complete!:()=>void
  x.driver.prepare=()=>new Promise(resolve=>{complete=resolve})
  const running=x.controller.start()
  for(let i=0;i<20&&!complete;i++)await Promise.resolve()
  expect(complete).toBeTypeOf('function');await x.controller.pause();complete();await running
  expect(x.frames).toEqual([]);expect(x.clicks).toEqual([]);expect(x.state().state).toBe('paused')
})

for(const change of ['position','size'] as const)test(`a fresh scan cannot silently adopt a new window ${change} during hover settling`,async()=>{
  const x=harness(1),observe=x.driver.observe;let count=0
  x.driver.observe=async()=>{
    const value=await observe()
    return ++count===1?value:{...value,...(change==='size'?{width:1920,geometryKey:'1920x2160@0,0'}:{geometryKey:'3840x2160@100,100'})}
  }
  await x.controller.start()
  expect(x.clicks).toEqual([]);expect(x.frames).toEqual([]);expect(x.state().reason).toMatch(/窗口|尺寸|位置/)
})
test('manual F8 cannot resume until an out-of-band native pause has acknowledged quiescence',async()=>{
  const x=harness();let finish!:()=>void
  x.driver.pause=()=>new Promise(resolve=>{finish=resolve})
  const stopping=x.controller.pause()
  expect(x.state().state).toBe('pausing')
  finish();await stopping;expect(x.state().state).toBe('paused')
})
test('capacity changing during the pre-click observation prevents that click',async()=>{
  const x=harness(),observe=x.driver.observe;let observations=0
  x.driver.observe=async()=>{const value=await observe();if(++observations===2)x.setCapacity(0);return value}
  await x.controller.start();expect(x.clicks).toEqual([]);expect(x.state().state).toBe('paused')
})
import type { PageObservation, PageScanSnapshot, PageScanDriver } from './pageScanTypes'
function harness(count = 3) {
  let clock = 0, seq = 0, selected = 'r0c0', signature = 'page-one', foreground = true, capacity = 20
  const clicks: string[] = [], frames: string[] = [], sourceId = 'window:123:0'
  let state: PageScanSnapshot = { pageId: '', state: 'idle', cells: [] }
  const observation = (): PageObservation => ({ sourceId, width: 3840, height: 2160, geometryKey: '3840x2160@0,0', frameSequence: ++seq, foreground, validLayout: true, emergencyStop: false, pageSignature: signature, detailSignature: 'same-attributes', selectedCellId: selected, cells: Array.from({ length: count }, (_, i) => ({ id: `r${Math.floor(i/6)}c${i%6}`, row: Math.floor(i/6), col: i%6, rarity: 5 as const, selected: selected === `r${Math.floor(i/6)}c${i%6}` })) })
  const driver: PageScanDriver = { anchor: async()=>{}, resetPage: async()=>{}, prepare: async()=>{}, observe: async () => observation(), select: async id => { clicks.push(id); selected = id }, freeze: async id => { frames.push(id); return { ocrImage: new Blob([id]), width: 3840, height: 2160, roi: { x: 0, y: 0, width: 3840, height: 2160 } } }, resume: async () => {}, pause: async () => {}, close: async () => {} }
  const controller = createPageScanController({ sourceId, driver, canCapture: () => capacity > 0, enqueue: (_frame, _page, id) => { capacity--; return { outcome: 'started', jobId: 'job-' + id } }, onState: next => { state = next }, now: () => clock, sleep: async ms => { clock += ms } })
  return { controller, driver, clicks, frames, state: () => state, setCapacity: (value: number) => { capacity = value }, setSignature: (value: string) => { signature = value }, setForeground: (value: boolean) => { foreground = value } }
}
test('two identical artifacts are captured separately by selected grid identity', async () => {
  const x = harness(2); await x.controller.start()
  expect(x.frames).toEqual(['r0c0', 'r0c1'])
  expect(x.state().state).toBe('page-complete')
  expect(x.state().cells.map(cell => cell.jobId)).toEqual(['job-r0c0', 'job-r0c1'])
})
test('temporary same-slot page rendering mismatch can settle without accepting the changed frame', async () => {
  const x=harness(1), select=x.driver.select, observe=x.driver.observe;let clicked=false,afterClick=0
  x.driver.select=async id=>{await select(id);clicked=true;x.setSignature('transient')}
  x.driver.observe=async()=>{if(clicked&&++afterClick===5)x.setSignature('page-one');return observe()}
  await x.controller.start()
  expect(x.frames).toEqual(['r0c0']);expect(x.clicks).toEqual(['r0c0'])
  expect(x.state().state).toBe('page-complete');expect(afterClick).toBeGreaterThanOrEqual(7)
})
test('capacity pauses before the next click and resumes at the unfinished cell only', async () => {
  const x = harness(3); x.setCapacity(1); await x.controller.start()
  expect(x.clicks).toEqual(['r0c0']); expect(x.state().state).toBe('paused')
  x.setCapacity(2); await x.controller.resume()
  expect(x.frames).toEqual(['r0c0','r0c1','r0c2'])
})
test('30 cells pause at slot 20, then resume exactly the remaining 10 after capacity is released',async()=>{
  const x=harness(30);await x.controller.start();expect(x.clicks).toHaveLength(20)
  expect(x.state().state).toBe('paused');x.setCapacity(20);await x.controller.resume()
  expect(x.frames).toHaveLength(30);expect(new Set(x.frames).size).toBe(30);expect(x.state().state).toBe('page-complete')
})
test('a full 32-cell page visits and freezes every cell once when capacity is available',async()=>{
  const x=harness(32);x.setCapacity(60);await x.controller.start()
  expect(x.state().state).toBe('page-complete')
  expect(x.clicks).toHaveLength(32);expect(x.frames).toHaveLength(32)
  expect(new Set(x.frames).size).toBe(32)
  expect(x.state().cells.every(cell=>cell.state==='captured')).toBe(true)
})
test('page changes reject continuation without clicking new coordinates', async () => {
  const x = harness(); x.setCapacity(1); await x.controller.start(); x.setCapacity(2); x.setSignature('page-two')
  await x.controller.resume()
  expect(x.clicks).toEqual(['r0c0']); expect(x.state().reason).toMatch(/页面|翻页/)
})
test('selection never switching times out without capturing the previous artifact', async () => {
  const x = harness(2); x.driver.select = async id => { x.clicks.push(id) }; await x.controller.start()
  expect(x.frames).toEqual(['r0c0']); expect(x.state().state).toBe('paused'); expect(x.state().reason).toMatch(/切换|稳定/)
})
test('focus loss during selection prevents all subsequent captures and clicks', async () => {
  const x = harness(); const oldSelect = x.driver.select
  x.driver.select = async id => { await oldSelect(id); x.setForeground(false) }
  await x.controller.start()
  expect(x.frames).toEqual([]); expect(x.clicks).toEqual(['r0c0']); expect(x.state().state).toBe('paused')
})
test('pause while an observation is pending cannot be undone by a late callback', async () => {
  const x = harness(); let finish!: (value: PageObservation) => void
  const oldObserve = x.driver.observe
  x.driver.observe = () => new Promise(resolve => { finish = resolve })
  const starting = x.controller.start(); await Promise.resolve(); await Promise.resolve()
  x.controller.pause(); finish(await oldObserve()); await starting
  expect(x.clicks).toEqual([]); expect(x.state().state).toBe('paused')
  x.driver.observe=oldObserve;await x.controller.resume()
  expect(x.frames).toHaveLength(3)
})
for(const scenario of ['unknown','four-star','emergency','destroyed'] as const)test(`${scenario} observation stops before the first click`,async()=>{
  const x=harness(),observe=x.driver.observe
  x.driver.observe=async()=>{
    const value=await observe()
    if(scenario==='destroyed')throw Error('SOURCE_CHANGED')
    return {...value,validLayout:scenario==='unknown'?false:value.validLayout,emergencyStop:scenario==='emergency',cells:scenario==='four-star'?value.cells.map(cell=>({...cell,rarity:4 as never})):value.cells}
  }
  await x.controller.start();expect(x.clicks).toEqual([]);expect(x.state().state).toBe('paused')
})
test('disposal during a saved-frame request cannot enqueue a late frame',async()=>{
  const x=harness();let complete!:()=>void
  const freeze=x.driver.freeze;x.driver.freeze=async id=>{await new Promise<void>(resolve=>{complete=resolve});return freeze(id)}
  const running=x.controller.start()
  for(let i=0;i<30&&!complete;i++)await Promise.resolve()
  expect(complete).toBeTypeOf('function');await x.controller.dispose();complete();await running
  expect(x.state().cells.every(cell=>cell.state==='waiting')).toBe(true)
})
test('page refusal surfaces first and all mismatched cells, band metrics, and script version',async()=>{
  const x=harness(2),observe=x.driver.observe,select=x.driver.select;let clicked=false
  x.driver.select=async id=>{await select(id);clicked=true;x.setSignature('changed-page')}
  x.driver.observe=async()=>{
    const value=await observe()
    if(!clicked)return value
    return {...value,pageStatus:'CHANGED',scriptVersion:'pagescan-diag-20261110',matcherVersion:'match-20261101-loose',mismatches:[{id:'r0c1',branch:'level',referenceEmphasized:false,currentEmphasized:false,pose:1.02,norm:[0.99,2.5,0.97,11.2,0.52,36.8]}]}
  }
  await x.controller.start()
  expect(x.state().state).toBe('paused')
  expect(x.state().reason).toContain('首格 r0c1/level(上0.99/2.5 下0.97/11.2 等级0.52/36.8@1.02x)')
  expect(x.state().reason).toContain('不匹配(1)：r0c1/level')
  expect(x.state().reason).toContain('[pagescan-diag-20261110/match-20261101-loose]')
})
test('bounded TRANSIENT frames before a click can settle to SAME, but persistent TRANSIENT still pauses without clicking',async()=>{
  const x=harness(2),observe=x.driver.observe;let count=0
  x.driver.observe=async()=>{
    const value=await observe()
    count++
    if(count===6)return {...value,pageSignature:'transient-glow',pageStatus:'TRANSIENT'}
    return {...value,pageStatus:'SAME'}
  }
  await x.controller.start()
  expect(x.frames).toEqual(['r0c0','r0c1'])
  expect(x.state().state).toBe('page-complete')
})
test('alternating SAME and TRANSIENT frames during startup reset stability count and never enter the clicking phase',async()=>{
  const x=harness(2),observe=x.driver.observe;let pinned=false,afterAnchor=0
  x.driver.anchor=async()=>{pinned=true}
  x.driver.observe=async()=>{
    const value=await observe()
    if(!pinned)return {...value,pageStatus:'SAME'}
    afterAnchor++
    if(afterAnchor%2===0)return {...value,pageSignature:'transient-glow',pageStatus:'TRANSIENT'}
    return {...value,pageStatus:'SAME'}
  }
  await x.controller.start()
  expect(x.clicks).toEqual([])
  expect(x.frames).toEqual([])
  expect(x.state().state).toBe('paused')
})
