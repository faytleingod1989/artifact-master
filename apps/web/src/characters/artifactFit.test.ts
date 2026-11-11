import { expect, test } from 'vitest'
import { getArtifactFitOptions } from './artifactFit'
import { CHARACTER_PROFILES } from './profiles'
import type { ArtifactRecord } from '../artifacts/types'
const piece: ArtifactRecord = { id: 1, name: 'test', set: '绝缘之旗印', setKey: 'emblem-of-severed-fate', slot: '时之沙', level: 20, main: '元素充能效率 51.8%', subs: ['暴击率 3.1%', '攻击力 19', '暴击伤害 5.4%'], locked: false, hue: 'blue', score: 0 }
test('suggestions use declared set plans and suitable mains, with all 121 roles available exactly once', () => {
  const options = getArtifactFitOptions(piece), rows = [...options.recommended, ...options.others]
  expect(rows).toHaveLength(121); expect(new Set(rows.map(row => row.characterId)).size).toBe(121)
  expect(options.recommended.find(row => row.characterName === '雷电将军')).toMatchObject({ suggestedBuildId: 'burst', setFit: 'preferred-four', mainMatches: true })
  for (const row of rows) expect(CHARACTER_PROFILES.find(p => p.id === row.characterId)?.builds.some(b => b.id === row.suggestedBuildId)).toBe(true)
})
test('unknown sets cannot invent recommendations and main mismatch remains selectable', () => {
  const unknown = getArtifactFitOptions({ ...piece, set: '未知套装', setKey: undefined })
  expect(unknown.recommended).toHaveLength(0); expect(unknown.others).toHaveLength(121)
  const mismatch = getArtifactFitOptions({ ...piece, main: '防御力 58.3%' })
  expect(mismatch.recommended.some(row => row.characterName === '雷电将军')).toBe(false)
  expect(mismatch.others.some(row => row.characterName === '雷电将军')).toBe(true)
})
test('search filters both groups without duplicating roles and 2-piece transitions remain labelled', () => {
  const search = getArtifactFitOptions(piece, '雷电')
  expect([...search.recommended, ...search.others].map(row => row.characterName)).toEqual(['雷电将军'])
  const flower = getArtifactFitOptions({ ...piece, slot: '生之花', main: '生命值 4780' })
  expect(flower.recommended.some(row => row.setFit === 'two-piece' && row.label.includes('2件'))).toBe(true)
})
