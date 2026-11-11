import type { ArtifactRecord } from '../artifacts/types'

// Explicit regression fixtures, never seeded into a user's warehouse.
export const legacyLibrary: ArtifactRecord[] = [
  { id: 1, name: '星海的指引', set: '深廊终曲', slot: '时之沙', level: 20, score: 45.8, main: '攻击力 46.6%', subs: ['暴击率 +10.9%', '暴击伤害 +21.0%', '元素充能效率 +11.0%', '攻击力 +33'], locked: true, hue: 'blue' },
  { id: 2, name: '晨曦的花', set: '深廊终曲', slot: '生之花', level: 20, score: 42.6, main: '生命值 4,780', subs: ['暴击率 +7.8%', '暴击伤害 +19.4%', '攻击力 +9.9%', '元素精通 +23'], locked: true, hue: 'violet' },
  { id: 3, name: '白银羽饰', set: '黑曜秘典', slot: '死之羽', level: 20, score: 40.1, main: '攻击力 311', subs: ['暴击率 +9.7%', '暴击伤害 +14.8%', '攻击力 +10.5%', '元素充能效率 +5.8%'], locked: true, hue: 'gold' },
  { id: 4, name: '誓约之杯', set: '黑曜秘典', slot: '空之杯', level: 16, score: 37.4, main: '火元素伤害加成 38.8%', subs: ['暴击率 +6.2%', '暴击伤害 +12.4%', '攻击力 +4.1%', '生命值 +508'], locked: false, hue: 'red' },
  { id: 5, name: '静谧冠冕', set: '逐影猎人', slot: '理之冠', level: 20, score: 38.9, main: '暴击伤害 62.2%', subs: ['暴击率 +6.6%', '生命值 +9.3%', '攻击力 +10.5%', '元素充能效率 +11.0%'], locked: true, hue: 'teal' },
  { id: 6, name: '雪夜之羽', set: '深廊终曲', slot: '死之羽', level: 12, score: 31.6, main: '攻击力 232', subs: ['暴击率 +7.0%', '暴击伤害 +7.0%', '攻击力 +4.7%'], locked: false, hue: 'blue' },
  { id: 7, name: '无瑕之花', set: '黑曜秘典', slot: '生之花', level: 20, score: 36.2, main: '生命值 4,780', subs: ['暴击率 +3.5%', '暴击伤害 +20.2%', '攻击力 +9.3%', '元素精通 +19'], locked: true, hue: 'violet' },
  { id: 8, name: '流光沙漏', set: '昔时之歌', slot: '时之沙', level: 0, score: 28.4, main: '元素充能效率 51.8%', subs: ['暴击率 +3.9%', '暴击伤害 +7.8%', '生命值 +5.3%', '攻击力 +16'], locked: false, hue: 'gold' },
]
