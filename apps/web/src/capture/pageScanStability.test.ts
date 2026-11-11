import {expect,test} from 'vitest'
import {createPageStability} from './pageScanStability'
import type {PageObservation} from './pageScanTypes'
test('selected details cannot settle while the card layout is still changing',()=>{
  const stable=createPageStability()
  const observation=(sequence:number,pageSignature:string):PageObservation=>({sourceId:'window:123:0',width:3840,height:2160,geometryKey:'3840x2160@0,0',frameSequence:sequence,foreground:true,validLayout:true,emergencyStop:false,pageSignature,detailSignature:'same-details',selectedCellId:'r0c0',cells:[{id:'r0c0',row:0,col:0,rarity:5,selected:true}]})
  expect(stable(observation(1,'hover'),'r0c0',0)).toBe(false)
  expect(stable(observation(2,'normal'),'r0c0',100)).toBe(false)
  expect(stable(observation(3,'normal'),'r0c0',200)).toBe(false)
  expect(stable(observation(4,'normal'),'r0c0',300)).toBe(true)
})
