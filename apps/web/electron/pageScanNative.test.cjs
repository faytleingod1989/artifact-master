const { test } = require('node:test'), assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process'), path = require('node:path'), fs = require('node:fs')
const script = path.resolve(__dirname, '../native-capture/PageScanInput.ps1')
const original = path.resolve(__dirname, '../../../bc截图/ScreenShot_2026-10-01_200932_297.png')
function analyze(file) {
  const run = spawnSync('powershell.exe', ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-AnalyzeImage',file], { encoding: 'utf8', windowsHide: true, timeout: 15000 })
  assert.equal(run.status, 0, run.stderr); return JSON.parse(run.stdout.trim())
}
test('native grid analysis finds all 20 visible five-star cards without treating character gold effects as rows', { skip: !fs.existsSync(original) }, () => {
  const result = analyze(original)
  assert.equal(result.validLayout, true)
  assert.equal(result.cells.length, 20)
  assert.equal(result.cells.at(-1).id, 'r4c3')
  assert.equal(result.selectedCellId,'r0c0')
})
test('native grid analysis refuses the program screenshot rather than inventing actionable cells', { skip: !fs.existsSync(path.resolve(__dirname, '../../../tests/private/ocr/pending-ui-replay.png')) }, () => {
  const result = analyze(path.resolve(__dirname, '../../../tests/private/ocr/pending-ui-replay.png'))
  assert.equal(result.validLayout, false); assert.equal(result.cells.length, 0)
})
const partial=path.resolve(__dirname,'../../../tests/private/ocr/flower-shadow-level20-compare.png')
const liveInventory=path.resolve(__dirname,'../../../tests/private/ocr/live-20261020-inventory.png')
const appearanceBefore=path.resolve(__dirname,'../../../bc截图/ScreenShot_2026-10-30_214006_873.png')
const appearanceAfter=path.resolve(__dirname,'../../../bc截图/ScreenShot_2026-10-30_214050_609.png')
const selectionBefore=path.resolve(__dirname,'../../../bc截图/ScreenShot_2026-10-30_225246_693.png')
const selectionAfter=path.resolve(__dirname,'../../../bc截图/ScreenShot_2026-10-30_225257_017.png')
const novFirst=path.resolve(__dirname,'../../../tests/private/ocr/scan-user-20261101-first-cropped.png')
const novThird=path.resolve(__dirname,'../../../tests/private/ocr/scan-user-20261101-third.png')
const hoverFalseSelection=path.resolve(__dirname,'../../../tests/private/ocr/live-20261101-1793529082055/r1c1.jpg')
for(const [pointer,accepted] of [['parked',true],['hover',false],['during',false],['unavailable',false]])test(`native freeze ${pointer} pointer ${accepted?'allows':'rejects'} a stable image`,{skip:!fs.existsSync(original)},()=>{
  const run=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(__dirname,'fixtures/pageScanPointerProbe.ps1'),'-Source',script,'-Image',original,'-Pointer',pointer],{encoding:'utf8',windowsHide:true,timeout:15000})
  assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout.trim())
  assert.equal(result.selected,'r0c0');assert.equal(result.accepted,accepted)
})
test('cursor over any card blocks claiming the hovered border is the selected artifact',{skip:!fs.existsSync(hoverFalseSelection)},()=>{
  const run=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(__dirname,'fixtures/pageScanPairProbe.ps1'),'-Source',script,'-Before',hoverFalseSelection,'-After',hoverFalseSelection,'-PointerX','1200','-PointerY','780'],{encoding:'utf8',windowsHide:true,timeout:15000})
  assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout.trim())
  assert.equal(result.before.selectedCellId,'r2c5','fixture documents the misleading hover classification')
  assert.equal(result.anchored.selectedCellId,null,'overlapping pointer must make selection unknown')
  assert.equal(result.anchored.cells.some(cell=>cell.selected),false)
})
test('cursor parked outside the grid does not by itself erase selection evidence',{skip:!fs.existsSync(hoverFalseSelection)},()=>{
  const run=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(__dirname,'fixtures/pageScanPairProbe.ps1'),'-Source',script,'-Before',hoverFalseSelection,'-After',hoverFalseSelection,'-PointerX','1280','-PointerY','1400'],{encoding:'utf8',windowsHide:true,timeout:15000})
  assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout.trim())
  assert.equal(result.anchored.selectedCellId,result.before.selectedCellId)
})
// Shrinking in-place leaves old icon pixels around the smaller image; that is
// not a faithful rendering fixture. Only enlarged, fully covered draws qualify.
for(const scale of [1.02,1.03])test(`each of the 32 visible card slots survives a ${scale} rendering-scale transition without changing the sealed page`,{skip:!fs.existsSync(novThird),timeout:90000},()=>{
  const failed=[]
  for(let target=0;target<32;target++){
    const run=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(__dirname,'fixtures/pageScanPairProbe.ps1'),'-Source',script,'-Before',novThird,'-After',novThird,'-Mode','scaled-card','-Target',String(target),'-Scale',String(scale)],{encoding:'utf8',windowsHide:true,timeout:15000})
    assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout.trim())
    if(!result.anchored.validLayout||result.before.pageSignature!==result.anchored.pageSignature)failed.push({target,valid:result.anchored.validLayout,mismatches:result.mismatches})
  }
  assert.deepEqual(failed,[])
})
test('a three-percent card animation does not look like a page change',{skip:!fs.existsSync(novThird)},()=>{
  const run=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(__dirname,'fixtures/pageScanPairProbe.ps1'),'-Source',script,'-Before',novThird,'-After',novThird,'-Mode','scaled-card','-Target','5','-Scale','1.03'],{encoding:'utf8',windowsHide:true,timeout:15000})
  assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout.trim())
  assert.equal(result.anchored.validLayout,true)
  assert.equal(result.anchored.pageSignature,result.before.pageSignature)
})
test('does not accept only two rows when a later row has an obscured first star but visible later five-star cards',{skip:!fs.existsSync(novThird)},()=>{
  const run=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(__dirname,'fixtures/pageScanPairProbe.ps1'),'-Source',script,'-Before',novThird,'-After',novThird,'-Mode','warm-obscured'],{encoding:'utf8',windowsHide:true,timeout:15000})
  assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout.trim())
  assert.equal(result.before.cells.length,32)
  assert.equal(result.raw.validLayout,false,'an incomplete projected row must not masquerade as a complete 16-cell page')
})
test('same inventory remains the same page across the reported first-to-third transition',{skip:![novFirst,novThird].every(file=>fs.existsSync(file))},()=>{
  const run=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(__dirname,'fixtures/pageScanPairProbe.ps1'),'-Source',script,'-Before',novThird,'-After',novFirst,'-CropX','54','-CropY','30'],{encoding:'utf8',windowsHide:true,timeout:15000})
  assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout.trim())
  assert.equal(result.before.validLayout,true);assert.equal(result.anchored.validLayout,true)
  assert.equal(result.before.cells.length,32);assert.equal(result.anchored.cells.length,32)
  assert.equal(result.before.selectedCellId,'r0c2');assert.equal(result.anchored.selectedCellId,'r0c0')
  assert.equal(result.anchored.pageSignature,result.before.pageSignature,`same page rejected at ${result.mismatches.join(', ')}`)
})
test('full-card selection glow and 1.05x expansion on r0c3 and r3c4 preserve page identity from unknown baseline selection',{skip:![novFirst,novThird].every(file=>fs.existsSync(file))},()=>{
  for(const [target,cellId] of [[3,'r0c3'],[4,'r0c4'],[27,'r3c3'],[28,'r3c4']]){
    const run=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(__dirname,'fixtures/pageScanPairProbe.ps1'),'-Source',script,'-Before',novThird,'-After',novFirst,'-CropX','54','-CropY','30','-Mode','selected-glow','-Target',String(target),'-Scale','1.05','-ReferenceSelectionUnknown'],{encoding:'utf8',windowsHide:true,timeout:15000})
    assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout.trim())
    assert.equal(result.before.selectedCellId,null)
    assert.equal(result.anchored.validLayout,true)
    assert.equal(result.anchored.selectedCellId,cellId)
    assert.equal(result.anchored.pageSignature,result.before.pageSignature,`same page rejected at ${cellId}: ${result.mismatches.join(', ')}`)
  }
})
const hoverSelection=path.resolve(__dirname,'../../../bc截图/ScreenShot_2026-10-31_210646_184.png')
const clearSelection=path.resolve(__dirname,'../../../bc截图/ScreenShot_2026-10-31_210655_016.png')
for(const mode of ['actual','state-icon','state-recolor','state-level','state-unavailable'])test(`real simultaneous hover and selection ${mode} keeps display evidence independent of unknown selection`,{skip:![hoverSelection,clearSelection,appearanceBefore].every(file=>fs.existsSync(file))},()=>{
  const run=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(__dirname,'fixtures/pageScanPairProbe.ps1'),'-Source',script,'-Before',hoverSelection,'-After',clearSelection,'-Mode',mode,'-LevelImage',appearanceBefore],{encoding:'utf8',windowsHide:true,timeout:15000})
  assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout.trim())
  assert.equal(result.before.selectedCellId,null,'ambiguous rims must not invent a selected artifact')
  assert.equal(result.anchored.selectedCellId,'r0c0');assert.equal(result.anchored.validLayout,true)
  assert.equal(result.before.cells.length,32);assert.equal(result.anchored.cells.length,32)
  if(mode==='actual'){
    assert.equal(result.anchored.pageSignature,result.before.pageSignature,'hover and selected display states do not change physical artifacts')
    assert.equal(result.anchored.pageStatus,'SAME')
    assert.equal(result.anchored.mismatches.length,0)
  }else{
    assert.notEqual(result.anchored.pageSignature,result.before.pageSignature,'unknown selection cannot waive icon, palette, level or missing evidence checks')
    assert.equal(result.anchored.mismatches[0].id,'r0c0')
    assert.equal(result.anchored.mismatches[0].branch,mode==='state-level'?'level':mode==='state-unavailable'?'reference-level-unreadable':'upper-icon')
  }
})
for(const [level,x,y] of [[19,0,0],[18,292,0],[17,1460,0],[16,584,356]])test(`different real +${level} glyph cannot replace the +20 card level`,{skip:![hoverSelection,clearSelection,appearanceBefore].every(file=>fs.existsSync(file))},()=>{
  const run=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(__dirname,'fixtures/pageScanPairProbe.ps1'),'-Source',script,'-Before',hoverSelection,'-After',clearSelection,'-Mode','state-level','-LevelImage',appearanceBefore,'-LevelOffsetX',String(x),'-LevelOffsetY',String(y)],{encoding:'utf8',windowsHide:true,timeout:15000})
  assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout.trim())
  assert.equal(result.anchored.validLayout,true);assert.notEqual(result.anchored.pageSignature,result.before.pageSignature)
})
test('same artifact icon at +18 cannot masquerade as the original +19 card',{skip:!fs.existsSync(appearanceBefore)},()=>{
  const run=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(__dirname,'fixtures/pageScanPairProbe.ps1'),'-Source',script,'-Before',appearanceBefore,'-After',appearanceBefore,'-Mode','level'],{encoding:'utf8',windowsHide:true,timeout:15000})
  assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout.trim())
  assert.equal(result.anchored.validLayout,true);assert.notEqual(result.anchored.pageSignature,result.before.pageSignature)
})
test('same artifact icon at +0 cannot masquerade as the original +20 card',{skip:!fs.existsSync(original)},()=>{
  const run=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(__dirname,'fixtures/pageScanPairProbe.ps1'),'-Source',script,'-Before',original,'-After',original,'-Mode','level'],{encoding:'utf8',windowsHide:true,timeout:15000})
  assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout.trim())
  assert.equal(result.anchored.validLayout,true);assert.notEqual(result.anchored.pageSignature,result.before.pageSignature)
})
test('a changed lower icon cannot masquerade as the same card during a selection transition',{skip:![hoverSelection,clearSelection].every(file=>fs.existsSync(file))},()=>{
  const run=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(__dirname,'fixtures/pageScanPairProbe.ps1'),'-Source',script,'-Before',hoverSelection,'-After',clearSelection,'-Mode','state-icon-lower'],{encoding:'utf8',windowsHide:true,timeout:15000})
  assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout.trim())
  assert.equal(result.anchored.validLayout,true);assert.notEqual(result.anchored.pageSignature,result.before.pageSignature)
})
test('restoring a page preserves simultaneous hover and selection without inventing a unique selection',{skip:![hoverSelection,clearSelection].every(file=>fs.existsSync(file))},()=>{
  const run=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(__dirname,'fixtures/pageScanAnchorSnapshotProbe.ps1'),'-Source',script,'-Image',hoverSelection,'-After',clearSelection,'-AfterCropX','0','-AfterCropY','0'],{encoding:'utf8',windowsHide:true,timeout:15000})
  assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout.trim())
  assert.equal(typeof result.before,'string');assert.equal(typeof result.after,'string')
  assert.equal(result.before,result.after)
})
test('hover arriving on a different card preserves page identity but keeps selection ambiguous',{skip:![hoverSelection,clearSelection].every(file=>fs.existsSync(file))},()=>{
  const run=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(__dirname,'fixtures/pageScanPairProbe.ps1'),'-Source',script,'-Before',clearSelection,'-After',hoverSelection],{encoding:'utf8',windowsHide:true,timeout:15000})
  assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout.trim())
  assert.equal(result.before.selectedCellId,'r0c0');assert.equal(result.anchored.selectedCellId,null)
  assert.equal(result.anchored.validLayout,true);assert.equal(result.anchored.cells.length,32)
  assert.equal(result.anchored.pageSignature,result.before.pageSignature)
})
test('mid-grid emphasized card (r2c5) and backpack background drift preserve page and detail signatures',{skip:![appearanceBefore,liveInventory,selectionAfter,clearSelection].every(file=>fs.existsSync(file))},()=>{
  const run=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(__dirname,'fixtures/pageScanPairProbe.ps1'),'-Source',script,'-Before',appearanceBefore,'-After',liveInventory],{encoding:'utf8',windowsHide:true,timeout:15000})
  assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout.trim())
  assert.equal(result.anchored.validLayout,true);assert.equal(result.anchored.cells.length,32)
  assert.equal(result.anchored.pageSignature,result.before.pageSignature)
  assert.equal(result.anchored.detailSignature,result.before.detailSignature)
  const detailRun=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(__dirname,'fixtures/pageScanPairProbe.ps1'),'-Source',script,'-Before',selectionAfter,'-After',clearSelection],{encoding:'utf8',windowsHide:true,timeout:15000})
  assert.equal(detailRun.status,0,detailRun.stderr);const detailResult=JSON.parse(detailRun.stdout.trim())
  assert.equal(detailResult.anchored.detailSignature,detailResult.before.detailSignature)
})
for(const mode of ['actual','state-icon','state-recolor','state-level','state-unavailable'])test(`real selected-state ${mode} preserves only the same icon and level across r0c1 to r0c0`,{skip:![selectionBefore,selectionAfter,appearanceBefore].every(file=>fs.existsSync(file))},()=>{
  const run=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(__dirname,'fixtures/pageScanPairProbe.ps1'),'-Source',script,'-Before',selectionBefore,'-After',selectionAfter,'-Mode',mode,'-LevelImage',appearanceBefore],{encoding:'utf8',windowsHide:true,timeout:15000})
  assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout.trim())
  assert.equal(result.before.selectedCellId,'r0c1');assert.equal(result.anchored.selectedCellId,'r0c0');assert.equal(result.anchored.validLayout,true)
  assert.equal(result.before.cells.length,32);assert.equal(result.anchored.cells.length,32)
  if(mode==='actual')assert.equal(result.anchored.pageSignature,result.before.pageSignature,'selected zoom and font tint are UI state, not a different artifact')
  else assert.notEqual(result.anchored.pageSignature,result.before.pageSignature,'state normalization must still reject a different icon, palette, or grade')
})
for(const mode of ['actual','state-icon','state-recolor','state-level','state-unavailable'])test(`same-cell selected-rim zoom transition (r0c0->r0c0, 1.00x->1.05x) ${mode} accepts only identical artifact evidence`,{skip:![selectionBefore,selectionAfter,appearanceBefore].every(file=>fs.existsSync(file))},()=>{
  const run=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(__dirname,'fixtures/pageScanPairProbe.ps1'),'-Source',script,'-Before',selectionBefore,'-After',selectionAfter,'-Mode',mode,'-LevelImage',appearanceBefore,'-ReferenceSelectedUnzoomed'],{encoding:'utf8',windowsHide:true,timeout:15000})
  assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout.trim())
  assert.equal(result.before.selectedCellId,'r0c0');assert.equal(result.anchored.selectedCellId,'r0c0');assert.equal(result.anchored.validLayout,true)
  assert.equal(result.before.cells.length,32);assert.equal(result.anchored.cells.length,32)
  if(mode==='actual')assert.equal(result.anchored.pageSignature,result.before.pageSignature,'clicking an already-selected 1.00x r0c0 that expands to 1.05x must preserve page identity')
  else assert.notEqual(result.anchored.pageSignature,result.before.pageSignature,'same-cell zoom normalization must still reject a different icon, palette, or grade')
})
test('real Oct30 inventory includes all four complete rows, not only rows above the warm scene background',{skip:!fs.existsSync(appearanceBefore)},()=>{
  const result=analyze(appearanceBefore)
  assert.equal(result.validLayout,true);assert.equal(result.cells.length,32);assert.equal(result.cells.at(-1).id,'r3c7')
})
const singleRowWarmScene=path.resolve(__dirname,'../../../bc截图/ScreenShot_2026-11-12_235249_anchor.jpg')
test('inventory with warm scene background starting below row 0 still recovers all four complete rows (32 cells)',{skip:!fs.existsSync(singleRowWarmScene)},()=>{
  const result=analyze(singleRowWarmScene)
  assert.equal(result.validLayout,true);assert.equal(result.cells.length,32);assert.equal(result.cells[0].id,'r0c0');assert.equal(result.cells.at(-1).id,'r3c7')
})
test('actual native JSON transport restores bounded appearance evidence larger than the old line cap and rejects excess',{skip:!fs.existsSync(liveInventory)},()=>{
  const run=input=>{
    const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(__dirname,'fixtures/pageScanAnchorSnapshotProbe.ps1'),'-Source',script,'-Image',liveInventory,'-Serve'],{input,encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:2000000})
    assert.equal(result.status,0,result.stderr);return result.stdout.trim().split(/\r?\n/).map(line=>JSON.parse(line))
  }
  const first=run([JSON.stringify({id:1,action:'resume'}),JSON.stringify({id:2,action:'observe'}),JSON.stringify({id:3,action:'anchor'}),''].join('\n'))
  const token=first.at(-1).data.anchor;assert.ok(token.length>8192&&token.length<=1048576)
  const second=run([
    JSON.stringify({id:1,action:'restore-anchor',anchor:token}),JSON.stringify({id:2,action:'resume'}),JSON.stringify({id:3,action:'observe'}),
    JSON.stringify({id:4,action:'restore-anchor',anchor:'A'.repeat(1048577)}),' '.repeat(1049601),'',
  ].join('\n'))
  assert.equal(second[1].data.ok,true);assert.equal(second[2].data.ok,true)
  assert.equal(second[3].data.pageSignature,first[2].data.pageSignature)
  assert.ok(second[4].error);assert.match(second[5].error,/INVALID_COMMAND/)
})
for(const mode of ['actual','reorder','level'])test(`real Oct30 ${mode} evidence distinguishes rendering changes from swapped items or changed levels`,{skip:![appearanceBefore,appearanceAfter].every(file=>fs.existsSync(file))},()=>{
  const run=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(__dirname,'fixtures/pageScanPairProbe.ps1'),'-Source',script,'-Before',appearanceBefore,'-After',appearanceAfter,'-CropX','12','-CropY','6','-Mode',mode],{encoding:'utf8',windowsHide:true,timeout:15000})
  assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout.trim())
  assert.equal(result.before.cells.length,32);assert.equal(result.anchored.validLayout,true)
  assert.notEqual(result.raw.pageSignature,result.before.pageSignature)
  if(mode==='actual')assert.equal(result.anchored.pageSignature,result.before.pageSignature,'same physical page must survive the actual small render changes, including the unselected second card')
  else assert.notEqual(result.anchored.pageSignature,result.before.pageSignature,'same artifact icon is insufficient when levels or physical order change')
})
for(const mode of ['four-stars','no-footer'])test(`projected lower rows reject ${mode} scenery instead of inventing clickable cards`,{skip:![appearanceBefore,appearanceAfter].every(file=>fs.existsSync(file))},()=>{
  const run=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(__dirname,'fixtures/pageScanPairProbe.ps1'),'-Source',script,'-Before',appearanceBefore,'-After',appearanceAfter,'-Mode',mode],{encoding:'utf8',windowsHide:true,timeout:15000})
  assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout.trim())
  assert.equal(result.raw.cells.length,16);assert.equal(result.anchored.validLayout,false)
})
test('later-row border expansion does not change recovered grid count or anchored page identity',{skip:![appearanceBefore,appearanceAfter].every(file=>fs.existsSync(file))},()=>{
  const run=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(__dirname,'fixtures/pageScanPairProbe.ps1'),'-Source',script,'-Before',appearanceBefore,'-After',appearanceAfter,'-Mode','row-border'],{encoding:'utf8',windowsHide:true,timeout:15000})
  assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout.trim())
  assert.equal(result.raw.cells.length,32);assert.notEqual(result.raw.gridSignature,result.before.gridSignature)
  assert.equal(result.anchored.validLayout,true);assert.equal(result.anchored.pageSignature,result.before.pageSignature)
})
test('native anchor snapshots restore the sealed appearance across real rendering changes',{skip:![appearanceBefore,appearanceAfter].every(file=>fs.existsSync(file))},()=>{
  const run=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(__dirname,'fixtures/pageScanAnchorSnapshotProbe.ps1'),'-Source',script,'-Image',appearanceBefore,'-After',appearanceAfter],{encoding:'utf8',windowsHide:true,timeout:15000})
  assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout.trim())
  assert.equal(result.before,result.after,'a restarted helper must retain the first reference, not adopt a newly rendered page')
})
test('native anchor snapshots restore only in the same paused process and geometry, never from malformed payloads',{skip:!fs.existsSync(liveInventory)},()=>{
  const run=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'fixtures/pageScanAnchorSnapshotProbe.ps1'),'-Source',script,'-Image',liveInventory],{encoding:'utf8',windowsHide:true,timeout:15000})
  assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout.trim())
  assert.equal(result.supportsSnapshot,true)
  assert.equal(result.repeatSame,true);assert.equal(result.before,result.after);assert.ok(result.tokenChars<1048576)
  assert.deepEqual(result.failures.map(f=>[f.case,f.rejected,f.assigned]),['owner','geometry','unpaused','truncated','extra','oversized','version','first-row','bounds','render-state','multiple-selected'].map(name=>[name,true,false]))
})
test('restored anchors retain the original selected-state reference for the actual r0c1 to r0c0 change',{skip:![selectionBefore,selectionAfter].every(file=>fs.existsSync(file))},()=>{
  const run=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(__dirname,'fixtures/pageScanAnchorSnapshotProbe.ps1'),'-Source',script,'-Image',selectionBefore,'-After',selectionAfter,'-AfterCropX','0','-AfterCropY','0'],{encoding:'utf8',windowsHide:true,timeout:15000})
  assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout.trim())
  assert.equal(result.before,result.after);assert.equal(result.repeatSame,true)
})
for(const mode of ['edges','reorder','translate','missing'])test(`anchored page evidence handles ${mode} without confusing local boundary noise with a new physical page`,{skip:!fs.existsSync(liveInventory)},()=>{
  const run=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'fixtures/pageScanAnchorProbe.ps1'),'-Source',script,'-Image',liveInventory,'-Mode',mode],{encoding:'utf8',windowsHide:true,timeout:15000})
  assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout.trim())
  assert.equal(result.supportsAnchors,true,'native page hashing must support a pinned grid')
  assert.equal(result.before.cells.length,32)
  if(mode==='edges'){
    assert.notEqual(result.raw.gridSignature,result.before.gridSignature)
    assert.equal(result.anchored.validLayout,true)
    assert.equal(result.anchored.pageSignature,result.before.pageSignature)
  }else if(mode==='reorder'){
    assert.equal(result.anchored.validLayout,true)
    assert.notEqual(result.anchored.pageSignature,result.before.pageSignature)
  }else assert.equal(result.anchored.validLayout,false)
})
const hoverFixtures={off:'live-stability-20261026-wdgVEl/0.png',hover:'live-stability-20261026-ERf6c3/0.png',selected:'live-stability-20261026-mko7QB/0.png'}
for(const key of Object.keys(hoverFixtures))hoverFixtures[key]=path.resolve(__dirname,'../../../tests/private/ocr',hoverFixtures[key])
test('native click clears real inventory hover before page and selected-detail evidence is consumed',{skip:!Object.values(hoverFixtures).every(file=>fs.existsSync(file))},()=>{
  const run=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'fixtures/pageScanCursorProbe.ps1'),'-Source',script,'-Off',hoverFixtures.off,'-Hover',hoverFixtures.hover,'-Selected',hoverFixtures.selected],{encoding:'utf8',windowsHide:true,timeout:15000})
  assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout.trim())
  assert.equal(result.after.pageSignature,result.before.pageSignature,'hover inflation must not survive a completed native click')
  assert.equal(result.after.selectedCellId,'r0c0');assert.notEqual(result.after.detailSignature,result.before.detailSignature)
  assert.deepEqual(result.moves,['move:360,484','click','move:1920,2095'])
  assert.equal(result.prepareExists,true)
  assert.match(result.before.gridSignature,/^[a-f0-9]{64}$/)
  assert.equal(result.before.gridSignature,result.after.gridSignature)
  assert.equal(result.prepared.pageSignature,result.before.pageSignature);assert.equal(result.prepared.selectedCellId,'r0c1')
  assert.equal(result.prepared.detailSignature,result.before.detailSignature);assert.deepEqual(result.prepareMoves,['move:1920,2095'])
  assert.deepEqual(result.guards.map(g=>[g.guard,g.rejected,g.moves]),[['paused',true,0],['focus',true,0],['right',true,0]])
})
test('chronological replay across off, hover, and selected live sequences preserves SAME page status with zero mismatches',{skip:!Object.values(hoverFixtures).every(file=>fs.existsSync(file))},()=>{
  for(const [before,after] of [[hoverFixtures.off,hoverFixtures.hover],[hoverFixtures.hover,hoverFixtures.selected],[hoverFixtures.selected,hoverFixtures.off]]){
    const run=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(__dirname,'fixtures/pageScanPairProbe.ps1'),'-Source',script,'-Before',before,'-After',after],{encoding:'utf8',windowsHide:true,timeout:15000})
    assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout.trim())
    assert.equal(result.anchored.validLayout,true)
    assert.equal(result.anchored.pageStatus,'SAME')
    assert.equal(result.anchored.mismatches.length,0)
    assert.equal(result.anchored.pageSignature,result.before.pageSignature)
  }
})
test('eight-column live inventory includes 32 complete cards and excludes the clipped final row',{skip:!fs.existsSync(liveInventory)},()=>{
  const result=analyze(liveInventory)
  assert.equal(result.validLayout,true);assert.equal(result.cells.length,32);assert.equal(result.cells.at(-1).id,'r3c7')
})
test('partial last row contains only the six real cards, with its actual selected first cell', {skip:!fs.existsSync(partial)},()=>{
  const result=analyze(partial)
  assert.equal(result.validLayout,true);assert.equal(result.cells.length,6)
  assert.equal(result.cells.at(-1).id,'r1c1');assert.equal(result.selectedCellId,'r0c0')
})
test('invalid HWND exits before enabling any native input',()=>{
  const run=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-WindowHandle','1'],{encoding:'utf8',windowsHide:true,timeout:15000})
  assert.equal(run.status,1);assert.match(run.stdout,/"ready":false/)
})
for(const mode of ['freeze','reorder','selection'])test(`native ${mode} evidence cannot accept changed detail or reordered card pixels`,{skip:!fs.existsSync(original)},()=>{
  const run=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'fixtures/pageScanImageProbe.ps1'),'-Source',script,'-Image',original,'-Mode',mode],{encoding:'utf8',windowsHide:true,timeout:15000})
  assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout.trim())
  assert.equal(result.before.validLayout,true);assert.equal(result.after.validLayout,true)
  assert.equal(result.after.cells.length,20);assert.equal(result.after.selectedCellId,mode==='selection'?'r0c1':'r0c0')
  if(mode==='freeze'){assert.notEqual(result.before.detailSignature,result.after.detailSignature);assert.equal(result.rejected,true)}
  else if(mode==='reorder')assert.notEqual(result.before.pageSignature,result.after.pageSignature)
  else assert.equal(result.before.pageSignature,result.after.pageSignature)
})
