import { expect, test } from 'vitest'
import { CHARACTERS, CHARACTER_PROFILES, getCharacterProfile } from './characterProfiles'
import { FIVE_STAR_ARTIFACT_SETS } from '../artifacts/catalog'
import { getLegalMainStats, SUB_STAT_KEYS } from '../artifacts/statModel'
import roster from '../characters/roster.snapshot.json'

test('released 6.0 through 7.1 roster includes all nineteen new characters and retains the four older profiles', () => {
  const names = CHARACTERS.map(row => row[0])
  expect(names.length).toBeGreaterThanOrEqual(23)
  for (const name of ['菈乌玛', '菲林斯', '爱诺', '奈芙尔', '杜林', '雅珂达', '月之少女·哥伦比娅', '兹白', '叶洛亚', '法尔伽', '莉奈娅', '尼可', '洛恩', '布伦妮', '木偶·桑多涅', '奥黛塔', '阿罗夏', '薇斯纳', '沃雅妮莎', '雷电将军', '那维莱特', '芙宁娜', '阿蕾奇诺']) expect(names).toContain(name)
  expect(new Set(names).size).toBe(names.length)
})
test('remaining released eras and collaboration characters have real build profiles', () => {
  for (const name of ['旅行者', '安柏', '凯亚', '丽莎', '迪卢克', '琴', '温迪', '可莉', '钟离', '甘雨', '胡桃', '枫原万叶', '神里绫华', '珊瑚宫心海', '埃洛伊', '八重神子', '夜兰', '久岐忍', '提纳里', '纳西妲', '艾尔海森', '白术', '莱欧斯利', '娜维娅', '闲云', '千织', '克洛琳德', '希格雯', '艾梅莉埃', '玛拉妮', '基尼奇', '希诺宁', '玛薇卡', '茜特菈莉', '梦见月瑞希', '瓦雷莎', '伊安珊', '爱可菲', '伊法', '丝柯克', '塔利雅', '伊涅芙']) {
    expect(getCharacterProfile(name), name).toBeDefined()
    expect(getCharacterProfile(name)?.builds.length, name).toBeGreaterThan(0)
  }
})
test('the complete formal roster is covered once and identity metadata is not guessed', () => {
  const names = CHARACTER_PROFILES.map(p => p.name.split('·').at(-1))
  expect(names).toHaveLength(121)
  expect(new Set(names).size).toBe(121)
  expect([...names].sort()).toEqual(roster.entries.map(p => p.name).sort())
  expect(new Set(CHARACTER_PROFILES.map(p => p.id)).size).toBe(121)
  for (const identity of roster.entries) {
    const p = getCharacterProfile(identity.name)!
    expect(p.rarity, p.name).toBe(identity.rarity)
    expect(p.weapon, p.name).toBe(identity.weapon)
    expect(p.element, p.name).toBe(identity.element)
    expect(p.releaseOrder, p.name).toBeTruthy()
  }
  expect(getCharacterProfile('旅行者')?.elements?.slice().sort()).toEqual(['火', '水', '风', '雷', '草', '冰', '岩'].sort())
})
test('every profile supplies actual five-star schemes, legal main stats, scoped ER assumptions and traceable sources', () => {
  for (const profile of CHARACTER_PROFILES) {
    expect(profile.sources.length).toBeGreaterThan(0)
    expect(profile.builds.length).toBeGreaterThan(0)
    for (const build of profile.builds) {
      expect(build.recharge.min).toBeGreaterThanOrEqual(100)
      expect(build.recharge.max).toBeGreaterThanOrEqual(build.recharge.min)
      expect(build.recharge.note.length).toBeGreaterThan(10)
      for (const [slot, keys] of Object.entries(build.mainStats)) for (const key of keys) expect(getLegalMainStats(slot as '时之沙')).toContain(key)
      for (const plan of build.sets) {
        expect(plan.pieces.reduce((sum,p) => sum+p.count,0)).toBe(4)
        for (const part of plan.pieces) expect(FIVE_STAR_ARTIFACT_SETS.some(s => s.key === part.key)).toBe(true)
      }
      for (const [key, weight] of Object.entries(build.weights)) { expect(SUB_STAT_KEYS).toContain(key); expect(Number.isFinite(weight) && weight >= 0).toBe(true) }
    }
  }
  expect(getCharacterProfile('哥伦比娅')?.name).toBe('月之少女·哥伦比娅')
})
