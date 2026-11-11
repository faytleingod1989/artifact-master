import { describe, expect, test } from 'vitest'
import { getArtifactOcrRegions, parseArtifactOcr } from './artifactOcr'

describe('artifact OCR layout', () => {
  test('returns bounded approved regions for a 16:9 screenshot', () => {
    expect(getArtifactOcrRegions(4608, 2160)).toEqual([
      { id: 'title', x: 2811, y: 22, width: 1751, height: 389 },
      { id: 'stats', x: 2811, y: 367, width: 1751, height: 648 },
      { id: 'set', x: 2811, y: 950, width: 1751, height: 302 },
    ])
  })

  test('rejects a non-landscape or nearly-square image', () => {
    expect(getArtifactOcrRegions(1000, 1000)).toBeNull()
    expect(getArtifactOcrRegions(1299, 1000)).toBeNull()
    expect(getArtifactOcrRegions(1000, 1299)).toBeNull()
  })
})

describe('artifact OCR field parsing', () => {
  test('canonicalizes the charge label and removes only nonnumeric trailing decoration', () => {
    const parsed = parseArtifactOcr({ title: '生之花\n+20', stats: '生命值 4780\n元素苑能效率+6.5% - “', set: '影中沉凝的幻灭' })
    expect(parsed.subs).toEqual(['元素充能效率 +6.5%'])
    expect(parsed.warnings?.join()).toContain('元素苑能效率')
    const ambiguous = parseArtifactOcr({ title: '生之花\n+20', stats: '生命值 4780\n元素充能效率+6.5%2', set: '影中沉凝的幻灭' })
    expect(ambiguous.subs).toEqual(['元素充能效率+6.5%2'])
  })
  test('dictionary repairs labels/piece identity, never changes a 9.9 number to 3.9', () => {
    const parsed = parseArtifactOcr({ title: '献与月的银蝎\n理之完', stats: '暴击伤害 62.2%\n+20\n暴击率+9.9%\n元素苑能效率+22.7%', set: '晨星与月的晓歌' })
    expect(parsed.slot).toBe('理之冠'); expect(parsed.name).toBe('献与月的银冕')
    expect(parsed.subs).toEqual(['暴击率 +9.9%', '元素充能效率 +22.7%'])
    expect(parsed.warnings?.length).toBeGreaterThan(0)
  })
  test('ignores punctuation outside fields and normalizes unambiguous integer thousands grouping only', () => {
    const parsed = parseArtifactOcr({ title: '生之花\n+20', stats: '生命值 . 4.780\n ，“暴击伤害+21.0%\n暴击率+9.9%', set: '深廊终曲' })
    expect(parsed.main).toBe('生命值 4,780'); expect(parsed.subs).toEqual(['暴击伤害 +21.0%', '暴击率 +9.9%'])
    expect(parsed.warnings?.join()).toContain('分隔符')
  })
  test('retains an unreadable stat line rather than silently losing a substat', () => {
    const parsed = parseArtifactOcr({ title: '理之冠\n+20', stats: '暴击伤害 62.2%\n元素充能效率+6.5硼\n暴击率+3.9%', set: '深廊终曲' })
    expect(parsed.subs).toContain('元素充能效率+6.5硼')
  })
  test('parses game bullets and internal Chinese spaces without changing digits', () => {
    const parsed = parseArtifactOcr({ title: '司 信 者 的 圣 冕\n理 之 冠', stats: '暴 击 伤 害 62.2%\n+20\n· 元 素 精 通 +40\n• 防 御 力 +16\n· 暴 击 率 +3.9%\n· 元素充能效率 +22.7%', set: '纺 月 的 夜 歌：(0)' })
    expect(parsed).toMatchObject({ name: '司信者的圣冕', set: '纺月的夜歌', slot: '理之冠', level: 20, main: '暴击伤害 62.2%', subs: ['元素精通 +40', '防御力 +16', '暴击率 +3.9%', '元素充能效率 +22.7%'] })
  })
  test('parses the exact supplied crown fixture with level in the stats region', () => {
    expect(parseArtifactOcr({
      title: '司信者的圣冕\n理之冠',
      stats: '+20\n暴击伤害 62.2%\n元素精通 +40\n防御力 +16\n暴击率 +3.9%\n元素充能效率 +22.7%',
      set: '纺月的夜歌\n2件套：元素充能效率提高20%',
    })).toEqual({
      name: '司信者的圣冕', set: '纺月的夜歌', slot: '理之冠', level: 20,
      main: '暴击伤害 62.2%', subs: ['元素精通 +40', '防御力 +16', '暴击率 +3.9%', '元素充能效率 +22.7%'],
    })
  })

  test('parses the supplied screenshot fields and normalises stat whitespace', () => {
    expect(parseArtifactOcr({
      title: '星海的指引\n时之沙\n＋20',
      stats: '攻击力   46.6%\n暴击率 +10.9%\n暴击伤害　+21.0%\n元素充能效率 +11.0%\n攻击力 +33\n套装效果：两件套攻击力提高18%',
      set: '深廊终曲\n两件套：攻击力提高18%。四件套：……',
    })).toEqual({
      name: '星海的指引',
      set: '深廊终曲',
      slot: '时之沙',
      level: 20,
      main: '攻击力 46.6%',
      subs: ['暴击率 +10.9%', '暴击伤害 +21.0%', '元素充能效率 +11.0%', '攻击力 +33'],
    })
  })

  test('accepts historical set aliases but returns the formal catalog name', () => {
    expect(parseArtifactOcr({ title: '花\n生之花\n+0', stats: '', set: '柔灯挽歌' })).toMatchObject({
      set: '纺月的夜歌',
      slot: '生之花',
      level: 0,
    })
  })

  test('ignores descriptions and noise instead of overriding valid fields', () => {
    expect(parseArtifactOcr({
      title: '誓约之杯\n空之杯\n+21\n+20',
      stats: '套装效果：攻击力提高18%\n不是词条 999\n生命值 4,780\n暴击率 +7.8%\n暴击伤害 +19.4%\n攻击力 +9.9%\n元素精通 +23',
      set: '黑曜秘典\n四件套效果：装备者冲刺后……',
    })).toEqual({
      name: '誓约之杯', set: '黑曜秘典', slot: '空之杯', level: undefined,
      main: '生命值 4,780', subs: ['暴击率 +7.8%', '暴击伤害 +19.4%', '攻击力 +9.9%', '元素精通 +23'],
    })
  })
})
