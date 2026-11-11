import {test,expect} from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs/promises'

test('single-page UI saves identical cells, pauses F8 while armed, and restores manual capture after completion',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message))
  await page.route('**/__page_fixture.png',route=>route.fulfill({contentType:'image/png',path:path.resolve('../../tests/private/ocr/flower-shadow-level20-compare.png')}))
  await page.addInitScript(()=>{
    let foreground=false,selected='r0c0',sequence=0,captures=0,trigger:(()=>void)|undefined,encoded:Promise<string>|undefined
    const image=()=>encoded??=fetch('/__page_fixture.png').then(response=>response.blob()).then(blob=>new Promise<string>(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.readAsDataURL(blob)}))
    Object.assign(window,{__pageForeground:()=>{foreground=true},__pageF8:()=>trigger?.(),__pageLiveFrames:()=>captures,artifactDesktop:{
      queryShowcase:async()=>({ok:false}),setRealtimeShortcut:async()=>true,onRealtimeCapture:(callback:()=>void)=>{trigger=callback;return()=>{trigger=undefined}},
      listCaptureSources:async()=>[{id:'window:123:0',name:'单页安全回放',kind:'window',thumbnail:'/__page_fixture.png',appIcon:null}],
      captureWindowFrame:async(sourceId:string)=>{captures++;return{sourceId,width:3840,height:2160,image:await image()}},
      nativeOcr:{open:async()=>'page-replay',close:async()=>{},recognize:async(_session:string,data:string)=>{
        const bitmap=await createImageBitmap(await(await fetch(data)).blob()),width=bitmap.width,height=bitmap.height;bitmap.close()
        const text=width<1200&&height<400?['桑多涅已装备']:['止于荣礼的缎彩','生之花','生命值 717','+0','暴击率+3.1%','攻击力+19','暴击伤害+5.4%','生命值+4.1%(待激活)','影中沉凝的幻灭：(4)']
        return{engine:'PP-OCRv5-server',width,height,elapsedMs:1,lines:text.map((text,i)=>({text,score:.99,occluded:false,box:[[5,i*65],[700,i*65],[700,i*65+45],[5,i*65+45]]}))}
      }},
      pageScan:{open:async()=>'page-replay',close:async()=>{},anchor:async()=>{},resetPage:async()=>{},prepare:async()=>{},resume:async()=>{},pause:async()=>{},select:async(_session:string,id:string)=>{selected=id},
        freeze:async()=>({sourceId:'window:123:0',width:3840,height:2160,image:await image(),gameLocked:true}),
        observe:async()=>({sourceId:'window:123:0',width:3840,height:2160,geometryKey:'3840x2160@0,0',frameSequence:++sequence,foreground,validLayout:true,emergencyStop:false,pageSignature:'page-one',detailSignature:'identical-attributes',selectedCellId:selected,cells:['r0c0','r0c1'].map((id,col)=>({id,row:0,col,rarity:5,selected:id===selected}))})}
    }})
  })
  await page.setViewportSize({width:1440,height:1000});await page.goto('/')
  await page.getByRole('button',{name:'实时录入',exact:true}).click();await page.getByRole('button',{name:'刷新窗口',exact:true}).click()
  await page.getByRole('button',{name:/单页安全回放/}).click();await page.getByRole('radio',{name:'当前页扫描',exact:true}).check()
  await page.getByRole('button',{name:'启动当前页扫描',exact:true}).click();await expect(page.getByText('等待切回游戏',{exact:true})).toBeVisible()
  await page.evaluate(()=> (window as unknown as {__pageF8:()=>void}).__pageF8())
  await expect(page.getByText(/已收到 F8：0 次/)).toBeVisible()
  await page.evaluate(()=> (window as unknown as {__pageForeground:()=>void}).__pageForeground())
  await expect(page.getByText('本页已保存 2 / 2',{exact:true})).toBeVisible({timeout:15000})
  await expect(page.getByRole('list',{name:'单页格位进度',exact:true})).toHaveCSS('display','grid')
  await expect(page.getByRole('heading',{name:'待确认 2 / 20 件',exact:true})).toBeVisible({timeout:15000})
  expect(await page.evaluate(()=> (window as unknown as {__pageLiveFrames:()=>number}).__pageLiveFrames())).toBe(1)
  await expect(page.getByText(/游戏锁定：已观察到锁定；装备角色：桑多涅/)).toBeVisible()
  await expect(page.getByRole('button',{name:'已手动翻页，下一页继续',exact:true})).toBeVisible()
  await fs.mkdir('C:/Users/Administrator/AppData/Local/Temp/ys-yas-optimization',{recursive:true})
  await page.screenshot({path:'C:/Users/Administrator/AppData/Local/Temp/ys-yas-optimization/page-complete.png',fullPage:true})
  await page.evaluate(()=> (window as unknown as {__pageF8:()=>void}).__pageF8())
  await expect.poll(()=>page.evaluate(()=> (window as unknown as {__pageLiveFrames:()=>number}).__pageLiveFrames())).toBe(2)
  expect(errors).toEqual([])
})
