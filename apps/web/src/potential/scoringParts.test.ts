import { expect, test } from 'vitest'
import { createSingleArtifactScorer, scoreArtifact } from '../scoring'
import { CHARACTER_PROFILES } from '../characters/profiles'
import { parseStat } from '../artifacts/statModel'
const piece = { id: 1, name: 'test', slot: '理之冠', level: 20, main: '暴击率 31.1%', subs: ['元素充能效率 22.7%', '暴击伤害 14.0%', '攻击力 5.8%', '生命值 209'] }
test('single-piece contribution kernel matches the existing score for every role/build and overflow context', () => {
  for (const profile of CHARACTER_PROFILES) for (const build of profile.builds) for (const extraCritRate of [0, 80, 100]) {
    const options = { buildId: build.id, extraCritRate, extraEnergyRecharge: 80 }
    const scorer = createSingleArtifactScorer(piece, profile.name, options)
    expect(scorer.finish(scorer.main + piece.subs.reduce((sum, text) => sum + scorer.sub(parseStat(text)!), 0))).toBe(scoreArtifact(piece, profile.name, options))
  }
})
