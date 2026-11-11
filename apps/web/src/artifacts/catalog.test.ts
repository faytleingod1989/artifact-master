import { expect, test } from 'vitest'
import { AUDITED_FIVE_STAR_ARTIFACT_ROWS } from './catalog.snapshot'
import { FIVE_STAR_ARTIFACT_SETS, findArtifactSetByName } from './catalog'
import { ARTIFACT_SET_NAME_ALIASES } from './catalog.aliases'

const AUDITED_FORMAL_NAMES: ReadonlyArray<readonly [string, string]> = [
  ['shenlang-zhongqu', '深廊终曲'], ['heiyao-midian', '黑曜秘典'], ['zhuying-lieren', '逐影猎人'], ['xishi-zhige', '昔时之歌'],
  ['a-day-carved-from-rising-winds', '风起之日'], ['aubade-of-morningstar-and-moon', '晨星与月的晓歌'], ['night-of-the-skys-unveiling', '穹境示现之夜'], ['silken-moons-serenade', '纺月的夜歌'], ['celestial-gift', '天之美赐'], ['disenchantment-in-deep-shadow', '影中沉凝的幻灭'],
  ['emblem-of-severed-fate', '绝缘之旗印'], ['husk-of-opulent-dreams', '华馆梦醒形骸记'], ['blizzard-strayer', '冰风迷途的勇士'], ['thundering-fury', '如雷的盛怒'], ['thundersoother', '平息鸣雷的尊者'], ['archaic-petra', '悠古的磐岩'], ['bloodstained-chivalry', '染血的骑士道'], ['heart-of-depth', '沉沦之心'], ['wanderers-troupe', '流浪大地的乐团'], ['ocean-hued-clam', '海染砗磲'],
  ['lavawalker', '渡过烈火的贤人'], ['crimson-witch-of-flames', '炽烈的炎之魔女'], ['viridescent-venerer', '翠绿之影'], ['maiden-beloved', '被怜爱的少女'], ['retracing-bolide', '逆飞的流星'], ['deepwood-memories', '深林的记忆'], ['flower-of-paradise-lost', '乐园遗落之花'], ['desert-pavilion-chronicle', '沙上楼阁史话'], ['nymphs-dream', '水仙之梦'], ['vourukashas-glow', '花海甘露之光'],
  ['golden-troupe', '黄金剧团'], ['nighttime-whispers-in-the-echoing-woods', '回声之林夜话'], ['scroll-of-the-hero-of-cinder-city', '烬城勇者绘卷'], ['tenacity-of-the-millelith', '千岩牢固'], ['noblesse-oblige', '昔日宗室之仪'], ['echoes-of-an-offering', '来歆余响'], ['pale-flame', '苍白之火'], ['gladiators-finale', '角斗士的终幕礼'], ['vermillion-hereafter', '辰砂往生录'], ['shimenawas-reminiscence', '追忆之注连'], ['gilded-dreams', '饰金之梦'], ['fragment-of-harmonic-whimsy', '谐律异想断章'], ['unfinished-reverie', '未竟的遐思'], ['long-nights-oath', '长夜之誓'],
]

const APPROVED_ALIASES = {
  '灼灼彩菊的芳香': '风起之日',
  '晨星与月的序曲': '晨星与月的晓歌',
  '长夜天光': '穹境示现之夜',
  '柔灯挽歌': '纺月的夜歌',
  '天光之赐': '天之美赐',
  '深黯之境的解离': '影中沉凝的幻灭',
} as const

test('freezes a unique five-star set roster', () => {
  expect(FIVE_STAR_ARTIFACT_SETS).toHaveLength(46)
  expect(findArtifactSetByName('炉火融炼之心')?.key).toBe('heart-of-the-furnace')
  expect(findArtifactSetByName('血红之证')?.key).toBe('scarlet-proof')
  expect(new Set(FIVE_STAR_ARTIFACT_SETS.map((entry) => entry.key)).size).toBe(FIVE_STAR_ARTIFACT_SETS.length)
  expect(new Set(FIVE_STAR_ARTIFACT_SETS.map((entry) => entry.name)).size).toBe(FIVE_STAR_ARTIFACT_SETS.length)
  expect(findArtifactSetByName('深廊终曲')?.key).toBe('shenlang-zhongqu')
})

test('resolves formal and legacy names to the same set key', () => {
  expect(findArtifactSetByName('纺月的夜歌')?.key).toBe('silken-moons-serenade')
  expect(findArtifactSetByName('柔灯挽歌')?.key).toBe('silken-moons-serenade')
})

test('keeps exactly the six audited aliases and resolves each to its formal set key', () => {
  expect(ARTIFACT_SET_NAME_ALIASES).toEqual(APPROVED_ALIASES)
  for (const [oldName, formalName] of Object.entries(APPROVED_ALIASES)) {
    expect(findArtifactSetByName(oldName)?.key).toBe(findArtifactSetByName(formalName)?.key)
  }
})

test('catalog names match every audited formal roster pair', () => {
  expect(FIVE_STAR_ARTIFACT_SETS.slice(0, 44).map(({ key, name }) => [key, name])).toEqual(AUDITED_FORMAL_NAMES)
})

test('catalog rows match the canonical audited snapshot', () => {
  expect(FIVE_STAR_ARTIFACT_SETS).toEqual(AUDITED_FIVE_STAR_ARTIFACT_ROWS.map(([key, name, sourceName]) => ({ key, name, sourceName })))
})

test('preserves all legacy set keys', () => {
  expect(['shenlang-zhongqu', 'heiyao-midian', 'zhuying-lieren', 'xishi-zhige'].every((key) => FIVE_STAR_ARTIFACT_SETS.some((entry) => entry.key === key))).toBe(true)
})
