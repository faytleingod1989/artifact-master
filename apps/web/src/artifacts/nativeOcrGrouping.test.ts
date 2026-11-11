import { expect, test } from 'vitest'
import { groupedText } from './nativeOcrService'
import type { NativeOcrLine } from './nativeOcrTypes'
import { parseArtifactOcr } from './artifactOcr'
import { ocrToDraft } from '../imports/manualDraft'
import { getRecognitionProblems } from '../imports/recognitionCheck'
const line = (text: string, x: number): NativeOcrLine => ({ text, score: .99, occluded: false, box: [[x, 10], [x + 30, 10], [x + 30, 20], [x, 20]] })
test('separate spurious glyph does not corrupt a complete stat and remains reported', () => {
  const fragment = { ...line('可', 100), score: .2 }
  expect(groupedText([line('元素精通+19', 0), fragment])).toEqual({ text: '元素精通+19', ignored: ['可'], ignoredLines: [fragment] })
})
test('never removes digits, dormant annotations, or a glyph embedded in a stat', () => {
  expect(groupedText([line('元素精通+19', 0), line('2', 100)]).text).toBe('元素精通+19 2')
  expect(groupedText([line('生命值+4.1%', 0), line('待激活', 100)]).text).toBe('生命值+4.1% 待激活')
  expect(groupedText([line('元素精通+19可', 0)]).text).toBe('元素精通+19可')
})
test('the supplied flower with a separate stray glyph retains all four numeric substats', () => {
  const at = (text: string, y: number, x = 0): NativeOcrLine => ({ ...line(text, x), box: [[x,y],[x+30,y],[x+30,y+10],[x,y+10]] })
  const grouped = groupedText([at('生命值 4,780',0),at('暴击率+10.1%',20),at('元素精通+19',40),at('可',40,100),at('攻击力+31',60),at('暴击伤害+13.2%',80)])
  const parsed = parseArtifactOcr({ title:'熔铸者的揣度\n生之花\n+20', stats:grouped.text, set:'炉火融炼之心' })
  const draft = ocrToDraft(parsed,'realtime')
  expect(draft.subs).toEqual([{key:'critRate',value:10.1},{key:'elementalMastery',value:19},{key:'atkFlat',value:31},{key:'critDamage',value:13.2}])
  expect(grouped.ignored).toEqual(['可'])
  expect(getRecognitionProblems(draft)).toEqual([])
})
