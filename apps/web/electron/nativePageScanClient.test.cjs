const { test } = require('node:test'), assert = require('node:assert/strict')
const { sanitizePageObservation } = require('./nativePageScanClient.cjs')
const {EventEmitter}=require('node:events'),{compileFunction}=require('node:vm'),fs=require('node:fs'),path=require('node:path')
const anchorToken=Buffer.alloc(64,7).toString('base64')
test('private bounded visual references survive helper restart without reaching the renderer',async()=>{
  const x=nativeHarness(),client=x.create('window:123:0','fixed.ps1'),large=Buffer.alloc(560000,7).toString('base64')
  try{
    await client.command({action:'resume'});x.children[0].anchor=large
    assert.deepEqual(await client.command({action:'anchor'}),{ok:true})
    await client.command({action:'pause'});await client.command({action:'resume'})
    assert.equal(x.children[1].writes[0].anchor,large)
  }finally{await client.dispose().catch(()=>{})}
})
function nativeHarness(){
  const children=[],timeouts=[],module={exports:{}}
  compileFunction(fs.readFileSync(path.join(__dirname,'nativePageScanClient.cjs'),'utf8'),['require','module','setTimeout'])(name=>name==='node:child_process'?{spawn:()=>{
    const child=new EventEmitter();children.push(child);child.stdout=new EventEmitter();child.stdout.setEncoding=()=>{};child.stderr=new EventEmitter();child.stdin=new EventEmitter();child.writes=[];child.kills=0;child.autoExit=true
    child.kill=()=>{child.kills++;if(child.autoExit)queueMicrotask(()=>child.emit('exit',1));return true}
    child.stdin.write=input=>{const request=JSON.parse(input);child.writes.push(request);if(['resume','anchor','restore-anchor'].includes(request.action)&&!(request.action==='restore-anchor'&&child.holdRestore))queueMicrotask(()=>child.stdout.emit('data',JSON.stringify({id:request.id,...(child.errorCode?{error:child.errorCode}:{data:{ok:true,...(request.action==='anchor'?{anchor:child.anchor??anchorToken}:{})}})})+'\n'))}
    queueMicrotask(()=>child.stdout.emit('data',JSON.stringify({ready:true,protocol:'page-scan-v1',pid:child.identity??1234,started:'638900000000000000'})+'\n'));return child
  }}:require(name),module,(callback,ms)=>{if(ms===5000)timeouts.push(callback);return setTimeout(callback,ms)})
  return{children,timeouts,create:module.exports.createNativePageScanClient}
}

test('anchor coordinates stay private and restore before resume after a confirmed helper exit',async()=>{
  const x=nativeHarness(),client=x.create('window:123:0','fixed.ps1')
  try{
    await client.command({action:'resume'})
    assert.deepEqual(await client.command({action:'anchor'}),{ok:true})
    await client.command({action:'pause'});await client.command({action:'resume'})
    assert.deepEqual(x.children[1].writes.map(r=>r.action),['restore-anchor','resume'])
    assert.equal(x.children[1].writes[0].anchor,anchorToken)
    await client.command({action:'pause'});await client.command({action:'reset-page'});await client.command({action:'resume'})
    assert.deepEqual(x.children[2].writes.map(r=>r.action),['resume'])
  }finally{await client.dispose()}
})

test('pause during internal anchor restore cannot release a delayed resume',async()=>{
  const x=nativeHarness(),client=x.create('window:123:0','fixed.ps1')
  try{
    await client.command({action:'resume'});await client.command({action:'anchor'});await client.command({action:'pause'})
    const resuming=client.command({action:'resume'}),rejected=assert.rejects(resuming)
    x.children[1].holdRestore=true
    await new Promise(resolve=>setImmediate(resolve));await client.command({action:'pause'});await rejected
    assert.deepEqual(x.children[1].writes.map(r=>r.action),['restore-anchor'])
  }finally{await client.dispose()}
})

test('a malformed native anchor cannot escape to renderer or become saved input coordinates',async()=>{
  const x=nativeHarness(),client=x.create('window:123:0','fixed.ps1')
  try{
    await client.command({action:'resume'});x.children[0].anchor='../arbitrary-path'
    await assert.rejects(client.command({action:'anchor'}))
    await assert.rejects(client.command({action:'resume'}))
  }finally{await client.dispose().catch(()=>{})}
})

for(const refusal of ['false','throw'])test(`a command timeout cannot acknowledge pause or close when native kill returns ${refusal}`,async()=>{
  const x=nativeHarness(),client=x.create('window:123:0','fixed.ps1')
  try{
    await client.command({action:'resume'});const child=x.children[0]
    child.kill=()=>{if(refusal==='throw')throw Error('Access denied');return false}
    const preparing=client.command({action:'prepare'}),rejected=assert.rejects(preparing)
    await new Promise(resolve=>setImmediate(resolve));x.timeouts.at(-1)();await rejected
    await assert.rejects(client.command({action:'pause'}))
    await assert.rejects(client.dispose())
    await assert.rejects(client.command({action:'resume'}));assert.equal(x.children.length,1)
  }finally{await client.dispose().catch(()=>{})}
})

test('a command timeout waits for delayed native exit before acknowledging pause',async()=>{
  const x=nativeHarness(),client=x.create('window:123:0','fixed.ps1');let child
  try{
    await client.command({action:'resume'});child=x.children[0];child.autoExit=false
    const preparing=client.command({action:'prepare'}),rejected=assert.rejects(preparing)
    await new Promise(resolve=>setImmediate(resolve));x.timeouts.at(-1)();await rejected
    let acknowledged=false;const paused=client.command({action:'pause'});paused.then(()=>{acknowledged=true},()=>{})
    await new Promise(resolve=>setImmediate(resolve));assert.equal(acknowledged,false)
    child.emit('exit',1);await paused;assert.equal(acknowledged,true)
  }finally{child?.emit('exit',1);await client.dispose().catch(()=>{})}
})
test('UI pause kills an in-flight helper out-of-band and does not acknowledge until native exit',async()=>{
  const x=nativeHarness(),client=x.create('window:123:0','fixed.ps1')
  let paused
  try{
    await client.command({action:'resume'});const child=x.children[0];child.autoExit=false
    const selecting=client.command({action:'select',cellId:'r0c0'});const rejected=assert.rejects(selecting)
    await new Promise(resolve=>setImmediate(resolve));let acknowledged=false
    paused=client.command({action:'pause'});paused.then(()=>{acknowledged=true},()=>{})
    await new Promise(resolve=>setImmediate(resolve))
    assert.equal(child.kills,1);assert.equal(acknowledged,false)
    assert.equal(child.writes.some(request=>request.action==='pause'),false)
    child.emit('exit',1);await paused;await rejected;assert.equal(acknowledged,true)
    await client.command({action:'resume'});assert.equal(x.children.length,2)
    child.emit('exit',1);assert.equal(x.children[1].kills,0)
  }finally{await client.dispose();await paused?.catch(()=>{})}
})
test('a helper restarted after UI pause cannot bind a recycled HWND to a new process',async()=>{
  const x=nativeHarness(),client=x.create('window:123:0','fixed.ps1')
  try{
    await client.command({action:'resume'});await client.command({action:'pause'})
    const resuming=client.command({action:'resume'}),checked=assert.rejects(resuming,/身份|SOURCE_CHANGED/)
    if(x.children[1])x.children[1].identity=9999
    await checked
  }finally{await client.dispose()}
})
test('an OS refusal to terminate fails closed and forbids a replacement input helper',async()=>{
  const x=nativeHarness(),client=x.create('window:123:0','fixed.ps1')
  await client.command({action:'resume'});x.children[0].kill=()=>{throw Error('Access denied')}
  await assert.rejects(client.command({action:'pause'}))
  await assert.rejects(client.command({action:'resume'}))
  assert.equal(x.children.length,1)
})
test('Windows input refusal gives a manual permission recovery message without automatic elevation',async()=>{
  const x=nativeHarness(),client=x.create('window:123:0','fixed.ps1')
  try{await client.start();x.children[0].errorCode='INPUT_FAILED';await assert.rejects(client.command({action:'resume'}),/管理员身份.*不会自动提权/)}finally{await client.dispose()}
})
const observation = () => ({ width: 3840, height: 2160, frameSequence: 1, foreground: true, validLayout: true, emergencyStop: false, geometryKey: '3840x2160@0,0', pageSignature: '1234abcd', detailSignature: 'abcd1234', selectedCellId: 'r0c0', cells: [{ id: 'r0c0', row: 0, col: 0, rarity: 5, selected: true, rect: { x: 1, y: 2 } }] })
test('page observation exports cell identity but never actionable coordinate payloads', () => {
  const data = sanitizePageObservation(observation(), 'window:123:0')
  assert.equal(data.sourceId, 'window:123:0'); assert.equal(data.cells[0].rect, undefined)
  assert.equal(data.cells[0].id, 'r0c0')
})
test('independent grid diagnostics pass only bounded SHA256 evidence and never coordinates',()=>{
  const value={...observation(),gridSignature:'a'.repeat(64)}
  const data=sanitizePageObservation(value,'window:123:0')
  assert.equal(data.gridSignature,'a'.repeat(64));assert.equal(data.cells[0].rect,undefined)
  for(const gridSignature of [1,'../frame.png','a'.repeat(65)])assert.throws(()=>sanitizePageObservation({...value,gridSignature},'window:123:0'))
})
test('malformed geometry, duplicate cells and invented selected IDs cannot reach the renderer', () => {
  assert.throws(() => sanitizePageObservation({ ...observation(), width: 99999 }, 'window:123:0'))
  const duplicate = observation(); duplicate.cells.push(duplicate.cells[0]); assert.throws(() => sanitizePageObservation(duplicate, 'window:123:0'))
  assert.throws(() => sanitizePageObservation({ ...observation(), selectedCellId: 'r9c9' }, 'window:123:0'))
})
test('diagnostic fields pass bounded per-cell mismatch metrics and distinct error codes without exposing coordinates', () => {
  const { __private } = require('./nativePageScanClient.cjs')
  const data = sanitizePageObservation({
    ...observation(),
    pageStatus: 'CHANGED',
    scriptVersion: 'pagescan-diag-20261110',
    matcherVersion: 'match-20261101-loose',
    layoutIssue: 'EDGE_MOVED r0c0',
    selectionBest: 0.85,
    selectionRunnerUp: 0.35,
    selectionCandidate: 'r0c0',
    grabMs: 12.5,
    analyzeMs: 18.2,
    mismatches: [
      { id: 'r0c0', branch: 'upper-icon', referenceEmphasized: false, currentEmphasized: true, pose: 1.05, raw: [0.91, 16.2, 0.95, 11.4, 0.98, 4.1], norm: [0.91, 16.2, 0.95, 11.4, 0.99, 3.2], rect: { x: 100 } },
      { id: 'r9c9', branch: 'upper-icon', referenceEmphasized: false, currentEmphasized: false },
    ],
  }, 'window:123:0')
  assert.equal(data.pageStatus, 'CHANGED')
  assert.equal(data.scriptVersion, 'pagescan-diag-20261110')
  assert.equal(data.matcherVersion, 'match-20261101-loose')
  assert.deepEqual(data.selection, { best: 0.85, runnerUp: 0.35, candidate: 'r0c0' })
  assert.deepEqual(data.timing, { grabMs: 12.5, analyzeMs: 18.2 })
  assert.equal(data.mismatches.length, 1)
  assert.equal(data.mismatches[0].id, 'r0c0')
  assert.equal(data.mismatches[0].branch, 'upper-icon')
  assert.equal(data.mismatches[0].rect, undefined)
  assert.match(__private.scanError('PAGE_CHANGED:before r0c3 n=1 r2c7/level').message, /\[PAGE_CHANGED\].*r2c7\/level/)
  assert.match(__private.scanError('PAGE_UNCERTAIN:freeze r0c3 layout NO_CARD_ROWS').message, /\[PAGE_UNCERTAIN\].*NO_CARD_ROWS/)
  assert.match(__private.scanError('SELECTION_UNCONFIRMED:freeze r0c3 saw=none').message, /\[SELECTION_UNCONFIRMED\].*saw=none/)
  assert.match(__private.scanError('DETAIL_UNSTABLE:freeze r0c3 aaaa>bbbb').message, /\[DETAIL_UNSTABLE\].*aaaa>bbbb/)
})
