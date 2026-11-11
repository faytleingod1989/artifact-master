import type { CharacterProfile, StatWeights } from './profileTypes'
import { b, p, four, pair, atk, hp, def, em, supportAtk } from './legacyFactory'

// Role-specific heuristic weights, not simulated DPS. Pure reaction/healing builds
// intentionally do not inherit the offensive CRIT defaults from atk/hp/em.
const healingHp: StatWeights = { hpPercent: 1, hpFlat: .25, energyRecharge: 1.1 }
const shieldHp: StatWeights = { hpPercent: 1, hpFlat: .25 }
const reactionEm: StatWeights = { elementalMastery: 1 }
const reactionEr: StatWeights = { elementalMastery: 1, energyRecharge: 1.1 }
const emPair = pair('gilded-dreams', 'wanderers-troupe', '两种五星精通二件套过渡；不等于四件套实战收益。')
const atkPair = pair('gladiators-finale', 'shimenawas-reminiscence', '攻击二件套过渡，优先主词条和副词条。')
const hpPair = pair('tenacity-of-the-millelith', 'vourukashas-glow', '生命二件套；不提供千岩四件的团队加攻。')
const noblesse = four('noblesse-oblige', '每轮开大，队内没有其他宗室持有者。', '替代')
const assumedWeapons: Record<string, Record<string, { name: string; energyRecharge: number; critRate: number }>> = {
  kokomi: {
    offfield: { name: '90级讨龙英杰谭', energyRecharge: 0, critRate: 0 },
    onfield: { name: '90级试作金珀（精1；回能不是面板充能）', energyRecharge: 0, critRate: 0 },
    bloom: { name: '90级试作金珀（精1；回能不是面板充能）', energyRecharge: 0, critRate: 0 },
  },
  thoma: {
    burgeon: { name: '90级喜多院十文字（精3；回能不是面板充能）', energyRecharge: 0, critRate: 0 },
    shield: { name: '90级西风长枪', energyRecharge: 30.6, critRate: 0 },
  },
  gorou: { support: { name: '90级西风猎弓', energyRecharge: 61.3, critRate: 0 } },
  shenhe: { support: { name: '90级西风长枪', energyRecharge: 30.6, critRate: 0 } },
  yunjin: { support: { name: '90级西风长枪', energyRecharge: 30.6, critRate: 0 } },
  yelan: {
    offfield: { name: '90级西风猎弓', energyRecharge: 61.3, critRate: 0 },
    solo: { name: '90级西风猎弓', energyRecharge: 61.3, critRate: 0 },
  },
  collei: {
    support: { name: '90级西风猎弓', energyRecharge: 61.3, critRate: 0 },
    bloom: { name: '90级西风猎弓', energyRecharge: 61.3, critRate: 0 },
  },
  dori: { healer: { name: '90级西风大剑', energyRecharge: 61.3, critRate: 0 } },
  faruzan: { support: { name: '90级西风猎弓', energyRecharge: 61.3, critRate: 0 } },
  mika: { healer: { name: '90级西风长枪', energyRecharge: 30.6, critRate: 0 } },
  kaveh: { driver: { name: '90级西风大剑', energyRecharge: 61.3, critRate: 0 } },
  baizhu: { support: { name: '90级试作金珀（精5；回能不是面板充能）', energyRecharge: 0, critRate: 0 } },
}

// Identity/rarity/weapon/element/release dates checked against local game tables:
// AvatarExcelConfigData, AvatarSkillDepot/Skill, AvatarCodex, TextMap_MediumCHS.
// Each KQM URL below was opened and its recommendation sections checked.
export const LEGACY23_PROFILES: CharacterProfile[] = [
  p('ayaka', '神里绫华', '2.0', 5, '冰', '单手剑', '冻结 / 纯冰爆发输出', [
    b('freeze', '双冰冻结 · 爆发输出', [['atkPercent'], ['cryoDmgBonus'], ['critDamage', 'atkPercent', 'critRate']], { ...atk, energyRecharge: .9 }, [130, 150, '双冰供球、每轮两E及Q，普通非回能武器参考约140%；精5天目约100–110%，单E或接球不足需提高。'], [four('blizzard-strayer', '冻结提供40%条件暴击；仅冰附着20%，不可冻结敌人不得按40%计算。'), pair('blizzard-strayer', 'noblesse-oblige', '没有合格冰套4时过渡。', '替代'), pair('blizzard-strayer', 'gladiators-finale', '冰伤与攻击过渡。')], ['双冰共鸣另有15%条件暴击；冻结常见面板45%已近满暴，武器暴击也应计入。', '默认零命，不把多段Q套用为稳定融化；攻击头与暴伤头按队伍加攻情况比较。']),
  ], 0, 0, 'https://keqingmains.com/ayaka/'),
  p('yoimiya', '宵宫', '2.0', 5, '火', '弓', '单体普攻火伤 / 蒸发', [
    b('vape', '蒸发普攻 · 不强求Q', [['atkPercent', 'elementalMastery'], ['pyroDmgBonus'], ['critRate', 'critDamage']], { ...atk, elementalMastery: .55 }, [100, 100, '零命弓藏等普攻武器，Q按需/隔轮；追忆需开E时至少15能量，不等于必须每轮Q。'], [four('shimenawas-reminiscence', '以普攻为主，能够支付15能量且接受少开大。'), four('crimson-witch-of-flames', '稳定蒸发，可正常安排Q。', '替代'), pair('crimson-witch-of-flames', 'gladiators-finale', '火伤加攻击过渡。')], ['精通沙仅适合本人稳定蒸发；保护普攻连段可保持高倍率箭蒸发。']),
    b('mono', '纯火 / 超载直伤', [['atkPercent'], ['pyroDmgBonus'], ['critRate', 'critDamage']], atk, [100, 100, '普攻主导，不以每轮Q为目标。'], [four('shimenawas-reminiscence', '保证每次E消耗所需能量。'), four('lavawalker', '敌人稳定保持火附着；超载队不保证持续覆盖。', '替代'), atkPair], ['不把蒸发精通权重直接套用于纯火；夏沃蕾队也主要看宵宫直伤。']),
  ], 0, 0, 'https://keqingmains.com/yoimiya/'),
  p('sayu', '早柚', '2.0', 4, '风', '双手剑', '扩散减抗 / 攻击倍率治疗', [
    b('healer', '零命后台 · 每轮治疗', [['energyRecharge', 'atkPercent'], ['atkPercent'], ['healingBonus', 'atkPercent', 'critRate']], supportAtk, [200, 240, '单风后台每轮Q通常200%以上；西风与接球可降低，隔轮Q约150–170%。'], [four('viridescent-venerer', '本人在场扩散主C对应元素；不减草抗或岩抗。'), four('noblesse-oblige', '队伍不需要风套减抗且缺少宗室。', '替代'), pair('emblem-of-severed-fate', 'gladiators-finale', '充能与攻击的五星治疗过渡。')], ['零命治疗主要吃攻击；六命才额外按精通提高持续治疗，不默认六命。', '暴率仅用于西风触发，不追暴伤治疗。']),
    b('swirl', '站场滚动 · 扩散驾驶', [['elementalMastery', 'energyRecharge'], ['elementalMastery'], ['elementalMastery']], reactionEr, [160, 180, '零命站场每轮Q参考；四命或双风可降低，但不是默认条件。'], [four('viridescent-venerer', '多目标持续扩散，兼顾团队减抗。'), four('gilded-dreams', '已有其他风套持有者，偏反应伤害。', '替代'), emPair], ['此配置面向扩散，不以治疗量或风直伤双暴评分。']),
  ], 0, 0, 'https://keqingmains.com/q/sayu-quickguide/'),
  p('sara', '九条裟罗', '2.1', 4, '雷', '弓', '基础攻击增益 / 速切爆发', [
    b('burst', '雷电将军 / 菲谢尔双雷 · 爆发辅助', [['energyRecharge', 'atkPercent'], ['electroDmgBonus'], ['critRate', 'critDamage']], { ...atk, energyRecharge: 1.1 }, [170, 200, '零命每轮一次蓄力产球，雷电将军或菲谢尔双雷；普通双雷约230%以上，单雷可能300%以上。'], [four('emblem-of-severed-fate', '宗室已有人持有，兼顾个人Q伤害。'), noblesse, pair('emblem-of-severed-fate', 'noblesse-oblige', '充能与爆发加伤过渡。')], ['加攻只取角色和武器基础攻击，圣遗物攻击词条不提高加攻量，仅提高自身伤害。', '默认零命；六命雷伤暴伤增益非零命能力，需实际覆盖且不能快照。']),
  ], 0, 0, 'https://keqingmains.com/sara/'),
  p('kokomi', '珊瑚宫心海', '2.1', 5, '水', '法器', '生命治疗 / 挂水 / 丰穰绽放', [
    b('offfield', '后台水母 · E治疗挂水', [['hpPercent'], ['hpPercent'], ['healingBonus']], shieldHp, [100, 100, '讨龙等常见武器，20秒E循环，不用Q刷新水母；若每轮Q，普通武器约260–315%，精5金珀195–235%。'], [four('tenacity-of-the-millelith', '水母命中并且主C吃攻击增益。'), four('ocean-hued-clam', '更重视治疗附带伤害。', '替代'), pair('ocean-hued-clam', 'maiden-beloved', '治疗二件套过渡。')], ['天赋降低100%暴击率；普通玩法双暴权重为零。只有实际总暴率超过100%惩罚后才可能常规暴击，不建议因此刻意堆双暴。', '千岩不强化水母治疗；主C不吃攻击时不强行用千岩。']),
    b('onfield', '双水精1金珀 · 站场治疗', [['hpPercent', 'energyRecharge'], ['hydroDmgBonus', 'hpPercent'], ['healingBonus']], healingHp, [150, 170, '双水、精1试作金珀、每轮Q；精5约135–150%，芙宁娜双水精1约110–145%，单水精1约160–205%。'], [four('ocean-hued-clam', '站场开大持续治疗，叠海染泡沫。'), four('tenacity-of-the-millelith', '队友吃攻击，团队收益可能更高。', '替代'), pair('ocean-hued-clam', 'heart-of-depth', '治疗和水伤过渡。')], ['不按双暴输出模板；治疗加成可经天赋提高Q状态普攻收益。']),
    b('bloom', '妮露队 · 丰穰之核触发', [['elementalMastery', 'energyRecharge'], ['elementalMastery', 'hpPercent'], ['elementalMastery', 'healingBonus']], { ...reactionEr, hpPercent: .35, hpFlat: .1 }, [150, 170, '双水精1金珀每轮Q参考；改祭礼等精通武器约185–220%，队伍回能另调。'], [four('flower-of-paradise-lost', '本人拥有较多绽放触发权且治疗够用。'), four('gilded-dreams', '兼顾精通和刷取效率。', '替代'), emPair], ['精通伤害与治疗生存有取舍，允许生命杯或治疗头；普通丰穰之核不吃双暴。']),
  ], 0, 0, 'https://keqingmains.com/q/kokomi-quickguide/'),
  p('aloy', '埃洛伊', '2.1', 5, '冰', '弓', '速切冰爆发 / 反向融化', [
    b('melt', '速切融化爆发', [['atkPercent', 'elementalMastery', 'energyRecharge'], ['cryoDmgBonus'], ['critRate', 'critDamage']], { ...atk, elementalMastery: .6, energyRecharge: .9 }, [140, 165, '普通输出弓、每轮Q的速切参考；西风/祭礼和第二冰产球会改变需求。'], [four('emblem-of-severed-fate', 'Q占伤高，保证充能并能融化。'), pair('wanderers-troupe', 'blizzard-strayer', '精通与冰伤替代。', '替代'), pair('blizzard-strayer', 'noblesse-oblige', '冰伤与爆发伤害过渡。')], ['埃洛伊为特殊五星，最早在2.1于PlayStation发放，其他平台2.2；没有可解锁命座。', '不是稳定冰附魔普攻模板；冰套4不适用于敌人持续挂火的融化场景。']),
  ], 0, 0, 'https://keqingmains.com/aloy/'),
  p('thoma', '托马', '2.2', 4, '火', '长柄武器', '叠盾 / 烈绽放触发', [
    b('burgeon', '零命喜多院 · 烈绽放', [['energyRecharge', 'elementalMastery'], ['elementalMastery'], ['elementalMastery']], reactionEr, [210, 240, '零至三命、精3喜多院、单火、两名西风队友：双E约210%，单E约240%；四命降低需求但不默认。'], [four('flower-of-paradise-lost', '本人稳定触发烈绽放，需水草供应并控制燃烧。'), four('gilded-dreams', '副词条更好或与深林一起刷取。', '替代'), emPair], ['烈绽放只看等级和精通，双暴/火伤/攻击不提高其伤害；先解决每轮Q。', '喜多院先Q后E；堆精通降低盾量，通常仍需治疗。']),
    b('shield', '零命双火西风 · 护盾辅助', [['energyRecharge', 'hpPercent'], ['hpPercent'], ['hpPercent', 'critRate']], { ...healingHp, critRate: .4 }, [200, 220, '零至三命双火精3西风约210%；单火再增加约25%以上，四命约170%不能当零命目标。'], [pair('tenacity-of-the-millelith', 'emblem-of-severed-fate', '生命加充能实用盾辅组合。', '首选'), noblesse, hpPair], ['盾要靠前台普攻触发Q持续叠加；只放E不能取得完整盾量。', 'E不能持续后台命中，千岩4不作为常驻团队增益。']),
  ], 0, 0, 'https://keqingmains.com/q/thoma-quickguide/'),
  p('itto', '荒泷一斗', '2.3', 5, '岩', '双手剑', '防御转攻击岩重击', [
    b('geo', '三岩 · 爆发重击', [['defPercent'], ['geoDmgBonus'], ['critRate', 'critDamage']], { ...def, atkPercent: .2, energyRecharge: .9 }, [130, 140, '零命白影剑/螭骨剑、五郎及第三岩产球，每轮Q；接球与队友西风会改变目标。'], [four('husk-of-opulent-dreams', '保持华馆层数，防御提高爆发转换和重击收益。'), four('retracing-bolide', '可靠护盾覆盖重击输出窗口。', '替代'), pair('husk-of-opulent-dreams', 'archaic-petra', '防御与岩伤过渡。')], ['防御优先于攻击，默认防御沙；Q前接球并规划阿丑E，不能只追双暴。']),
  ], 0, 0, 'https://keqingmains.com/itto/'),
  p('gorou', '五郎', '2.3', 4, '岩', '弓', '防御岩队辅助', [
    b('support', '三岩西风 · 每轮辅助', [['energyRecharge'], ['defPercent'], ['critRate']], { energyRecharge: 1.2, critRate: .7, defPercent: .2, defFlat: .05 }, [200, 220, '西风猎弓、三岩且每轮Q参考；非西风最高约250%，以实际接球调整。'], [four('scroll-of-the-hero-of-cinder-city', '五郎亲自触发结晶；非夜魂角色仅12%相应元素增伤，不是40%。'), noblesse, pair('emblem-of-severed-fate', 'husk-of-opulent-dreams', '先充能与西风暴率，防御仅补个人伤害/高命治疗。')], ['E的固定防御加成取决于天赋等级，不随自身防御提高；零命没有四命治疗。', '原攻略流放者为四星套，本工具仅提供五星方案，不声称回能完全等效。']),
  ], 0, 0, 'https://keqingmains.com/q/gorou-quickguide/'),
  p('shenhe', '申鹤', '2.4', 5, '冰', '长柄武器', '攻击倍率冰翎辅助', [
    b('support', '双冰西风 · 冰翎辅助', [['atkPercent', 'energyRecharge'], ['atkPercent'], ['atkPercent', 'critRate']], supportAtk, [160, 180, '双冰、每轮两E、西风与队友供球参考；单E/不接球可能需200%以上，三冰通常更低。'], [four('noblesse-oblige', '冰C吃攻击，队内没有其他宗室持有者。'), pair('gladiators-finale', 'shimenawas-reminiscence', '已有宗室，优先总攻击提高冰翎。', '替代'), pair('gladiators-finale', 'emblem-of-severed-fate', '充能不足时的攻击充能过渡。')], ['辅助冰翎取自身总攻击，不是冰伤杯和暴伤头提高冰翎基础加值；西风适量暴率有用。', '默认零命，不假设一命额外E或六命无限普重击冰翎。']),
  ], 0, 0, 'https://keqingmains.com/shenhe/'),
  p('yunjin', '云堇', '2.4', 4, '岩', '长柄武器', '防御倍率普攻增益', [
    b('support', '双岩西风 · 普攻辅助', [['defPercent', 'energyRecharge'], ['defPercent'], ['defPercent', 'critRate']], { defPercent: 1, defFlat: .25, energyRecharge: 1.1, critRate: .35 }, [160, 200, '双岩每轮Q；阿贝多约140–160%，单岩约200–270%，西风触发和弹反E产球改变目标。'], [four('husk-of-opulent-dreams', '满层防御强化普攻加值，后台预叠层。'), four('noblesse-oblige', '队伍无宗室且主C吃攻击，权衡自身防御损失。', '替代'), pair('husk-of-opulent-dreams', 'emblem-of-severed-fate', '防御与循环过渡。')], ['普攻增益吃云堇防御，不用岩伤杯或双暴优化辅助倍率；暴率只为西风。']),
  ], 0, 0, 'https://keqingmains.com/yunjin/'),
  p('yae', '八重神子', '2.5', 5, '雷', '法器', '后台战技 / 激化输出', [
    b('aggravate', '双雷激化 · 后台输出', [['atkPercent', 'elementalMastery'], ['electroDmgBonus'], ['critRate', 'critDamage']], { ...atk, elementalMastery: .65, energyRecharge: .7 }, [120, 140, '零命菲谢尔双雷、按队伍周期安排Q；前台菲谢尔约100–110%，雷电队每轮Q约140–150%。'], [four('gilded-dreams', '本人持续触发激化，队伍属性满足精通/攻击转换。'), four('golden-troupe', '后台E伤占比高，长站场或频繁Q会降低优势。', '替代'), pair('thundering-fury', 'gladiators-finale', '雷伤攻击过渡；激化时可用精通二件套。')], ['天赋虽按精通提高E伤，不表示纯雷队应无条件三精通；激化仍吃双暴雷伤。']),
    b('skill', '后台E · 不强求Q', [['atkPercent'], ['electroDmgBonus'], ['critRate', 'critDamage']], atk, [100, 100, '以杀生樱为主、Q按需或跳过；不为每轮90能量Q牺牲大量输出词条。'], [four('golden-troupe', '主要后台E伤，尽量缩短在场时间。'), four('thundersoother', '敌人稳定雷附着；不能无条件用于各种反应队。', '替代'), atkPair], ['不假定一命回24能量；换成每轮Q需改充能目标和套装权衡。']),
  ], 0, 0, 'https://keqingmains.com/q/yae-quickguide/'),
  p('ayato', '神里绫人', '2.6', 5, '水', '单手剑', '水附魔普攻 / 反应驾驶', [
    b('onfield', '单水双E · 站场水伤', [['atkPercent'], ['hydroDmgBonus'], ['critRate', 'critDamage']], { ...atk, hpPercent: .1, energyRecharge: .8 }, [130, 160, '零命、每轮双E与Q、单水，队友合理西风；双水约120–135%，单E后台约155–175%。'], [four('heart-of-depth', 'E后的普攻窗口稳定触发。'), four('gladiators-finale', '常见武器与队伍下可靠替代。', '替代'), pair('heart-of-depth', 'gladiators-finale', '水伤加攻击过渡。')], ['生命只补浪闪附加值，不取代攻击主属性；来歆受网络延迟影响，不设为普适唯一首选。']),
  ], 0, 0, 'https://keqingmains.com/ayato/'),
  p('yelan', '夜兰', '2.7', 5, '水', '弓', '生命倍率后台水伤', [
    b('offfield', '零命双水西风 · 后台协同', [['hpPercent', 'energyRecharge'], ['hydroDmgBonus', 'hpPercent'], ['critRate', 'critDamage']], { ...hp, energyRecharge: 1.1 }, [185, 195, '零命双水西风、每轮一E一Q且西风一次；双E且两次西风约110–140%，普通武器双水单E约220–230%。'], [four('emblem-of-severed-fate', '优先保证Q循环，再用充能转换爆发伤害。'), pair('emblem-of-severed-fate', 'heart-of-depth', '循环与水伤替代。', '替代'), pair('tenacity-of-the-millelith', 'heart-of-depth', '充能够用时生命与水伤过渡。')], ['E和Q主要吃生命，攻击权重为零；不默认一命额外E。', '不以开局满能量判断循环；西风需在场暴击命中。']),
    b('solo', '零命单水西风 · 后台协同', [['energyRecharge', 'hpPercent'], ['hydroDmgBonus', 'hpPercent'], ['critRate', 'critDamage']], { ...hp, energyRecharge: 1.15 }, [215, 260, '零命单水西风、一E一Q且西风一次；可两E并各触发西风约160–165%，非回能武器单E约265–335%。'], [four('emblem-of-severed-fate', '高充能需求下首选，仍不为凑满套装增伤盲目堆充能。'), pair('emblem-of-severed-fate', 'heart-of-depth', '充能水伤替代。', '替代'), pair('emblem-of-severed-fate', 'tenacity-of-the-millelith', '充能生命过渡。')], ['双水和单水的充能需求分开；雷电将军回能队另降，不能假设所有单水都有回能。']),
  ], 0, 0, 'https://keqingmains.com/q/yelan-quickguide/'),
  p('shinobu', '久岐忍', '2.7', 4, '雷', '单手剑', '超绽放触发 / 生命治疗', [
    b('hyperbloom', '铁蜂刺 · 后台超绽放', [['elementalMastery'], ['elementalMastery'], ['elementalMastery']], { ...reactionEm, hpPercent: .15 }, [100, 100, 'E触发超绽放，不依赖Q；Q用于无敌帧/额外挂雷，不硬追循环。'], [four('flower-of-paradise-lost', '本人稳定触发草原核。'), four('gilded-dreams', '实际精通和副词条较好时可选。', '替代'), emPair], ['优先90级和精通，双暴雷伤不提高超绽放；精通也经天赋增加治疗。', '零命E有空窗，二命才延长至接近全覆盖。']),
    b('healer', '纯治疗 / 激化生存位', [['hpPercent'], ['hpPercent'], ['healingBonus']], shieldHp, [100, 100, '治疗来自E，Q按需；不为了治疗堆充能。'], [four('tenacity-of-the-millelith', 'E持续命中、队伍吃攻击，兼顾治疗。'), four('ocean-hued-clam', '队伍不需要千岩攻击，偏治疗附带伤害。', '替代'), pair('ocean-hued-clam', 'maiden-beloved', '治疗过渡。')], ['这是纯治疗不是超绽放伤害方案，不能用生命装替代三精通后声称同等反应输出。']),
  ], 0, 0, 'https://keqingmains.com/q/shinobu-quickguide/'),
  p('heizou', '鹿野院平藏', '2.8', 4, '风', '法器', '风拳速切 / 扩散驾驶', [
    b('crit', '双E速切 · 风伤输出', [['atkPercent'], ['anemoDmgBonus'], ['critRate', 'critDamage']], { ...atk, elementalMastery: .2, energyRecharge: .7 }, [120, 130, '零至三命速切每轮双E；若仅单E每轮Q约200%以上，不能照搬双E。'], [four('viridescent-venerer', '扩散减抗通常比个人套装略高伤更有团队价值。'), pair('viridescent-venerer', 'gladiators-finale', '风主C且已有减抗持有者。', '替代'), atkPair], ['先通过扩散叠满变格再E；不是只按大招一次伤害配装。']),
    b('swirl', '感电 / 超绽放扩散驾驶', [['elementalMastery'], ['elementalMastery'], ['elementalMastery']], reactionEr, [100, 110, '零至三命站场、每轮双E与Q；单E则约170–180%。'], [four('viridescent-venerer', '多目标扩散并为水雷队友减抗。'), four('gilded-dreams', '已另有风套且确实由本人触发反应。', '替代'), emPair], ['全精通面向反应，伤害归属取决于实际扩散与触核；不按单次E暴击评分。']),
  ], 0, 0, 'https://keqingmains.com/q/heizou-quickguide/'),
  p('tighnari', '提纳里', '3.0', 5, '草', '弓', '重击蔓激化速切', [
    b('spread', '双草 · 蔓激化重击', [['elementalMastery', 'atkPercent'], ['dendroDmgBonus'], ['critRate', 'critDamage']], { ...em, atkPercent: .5, atkFlat: .12, energyRecharge: .7 }, [130, 140, '一E一Q、双草、队友一次西风；无西风再约加10点。两E一Q可100–110%，单草一E一Q约150–160%。'], [four('wanderers-troupe', '队友可靠持深林，重击为主。'), four('gilded-dreams', '队友有深林，按武器与精通收益比较。', '替代'), four('deepwood-memories', '队伍没有其他可靠深林持有者时，此方案优先于乐团。', '替代'), pair('deepwood-memories', 'wanderers-troupe', '草伤精通过渡，不提供深林四件减抗。')], ['无人减草抗时深林4优先于乐团；激化可暴击，双暴和草伤仍有效。']),
  ], 0, 0, 'https://keqingmains.com/tighnari/'),
  p('collei', '柯莱', '3.0', 4, '草', '弓', '后台挂草 / 草抗削减', [
    b('support', '零命西风 · 挂草辅助', [['energyRecharge', 'atkPercent', 'elementalMastery'], ['dendroDmgBonus'], ['critRate', 'critDamage']], { ...atk, energyRecharge: 1.15, elementalMastery: .4 }, [170, 190, '零命西风、20秒单E每轮Q参考；双草普通武器约180%，单草约200%，一命可再降约15点。'], [four('deepwood-memories', '队伍草伤或绽放衍生伤害，且无人持有深林。'), four('noblesse-oblige', '已有深林且攻击队缺宗室。', '替代'), pair('emblem-of-severed-fate', 'deepwood-memories', '充能优先的草伤过渡，不替代团队草抗削减。')], ['先四件深林与Q覆盖，再优化个人双暴；西风暴率是功能词条。']),
    b('bloom', '妮露队 · 绽放辅助', [['energyRecharge', 'elementalMastery'], ['elementalMastery'], ['elementalMastery', 'critRate']], { ...reactionEr, critRate: .35 }, [170, 190, '零命西风每轮Q；祭礼触发约160%，第二E与队伍产球需实际满足。'], [four('deepwood-memories', '队内缺少稳定草抗削减。'), four('gilded-dreams', '已有深林且本人确有绽放归属。', '替代'), emPair], ['普通绽放不吃双暴；本人的反应归属少时，优先循环和挂草覆盖。']),
  ], 0, 0, 'https://keqingmains.com/q/collei-quickguide/'),
  p('dori', '多莉', '3.0', 4, '雷', '双手剑', '生命治疗 / 回能辅助', [
    b('healer', '零命单雷西风 · 治疗回能', [['energyRecharge', 'hpPercent'], ['hpPercent'], ['healingBonus', 'critRate']], { ...healingHp, critRate: .4 }, [180, 220, '零命单雷西风每轮Q；非西风约210–260%，双雷西风约140–160%，菲谢尔/雷电进一步降低。'], [four('noblesse-oblige', '队伍吃攻击且没有宗室。'), four('ocean-hued-clam', '更重视治疗附带伤害，按实际治疗量形成泡沫。', '替代'), pair('emblem-of-severed-fate', 'tenacity-of-the-millelith', '充能生命治疗过渡。')], ['治疗按生命，回能依赖Q连接；默认零命，不把六命站场附魔/超绽放驾驶当常规机制。']),
  ], 0, 0, 'https://keqingmains.com/q/dori-quickguide/'),
  p('cyno', '赛诺', '3.1', 5, '雷', '长柄武器', '站场激化 / 激绽', [
    b('quickbloom', '双雷如雷 · 激绽站场', [['elementalMastery', 'atkPercent'], ['electroDmgBonus', 'elementalMastery'], ['critRate', 'critDamage']], { ...em, atkPercent: .5, atkFlat: .12, energyRecharge: .9 }, [110, 140, '如雷4：久岐忍双雷约110–120%，其他雷约120–140%，菲谢尔约100–110%；非如雷双雷需约125–160%。'], [four('thundering-fury', '熟悉额外E节奏，减少冷却并改善产球。'), four('gilded-dreams', '操作更简单但须重新提高充能目标。', '替代'), emPair], ['单雷如雷约140–160%，非如雷可能180–200%；喜多院回能另算。', '激绽兼有可暴击直伤和不吃双暴超绽放，不用纯精通雷神模板。']),
  ], 0, 0, 'https://keqingmains.com/q/cyno-quickguide/'),
  p('candace', '坎蒂丝', '3.1', 4, '水', '长柄武器', '水附魔 / 生命倍率普攻增益', [
    b('support', '零命双水 · 普攻辅助', [['energyRecharge', 'hpPercent'], ['hpPercent'], ['hpPercent', 'critRate']], { ...healingHp, critRate: .4 }, [180, 200, '双水每轮双E只接一组球，20秒每轮Q；单E双水220–250%，单水双E230–260%。西风可下降，按接球调整。'], [four('noblesse-oblige', '主C吃攻击，队伍没有宗室。'), pair('emblem-of-severed-fate', 'tenacity-of-the-millelith', '充能生命功能替代。', '替代'), hpPair], ['默认零命没有六命后台周期水波；不能直接作为六命妮露队挂水玩法。', '普攻增益吃生命，不用攻击或暴伤提高辅助倍率；西风才需要暴率。']),
  ], 0, 0, 'https://keqingmains.com/q/candace-quickguide/'),
  p('nilou', '妮露', '3.1', 5, '水', '单手剑', '生命倍率丰穰之核辅助', [
    b('bloom', '水草限定 · 丰穰绽放辅助', [['hpPercent'], ['hpPercent'], ['hpPercent']], { ...shieldHp, elementalMastery: .3 }, [100, 100, 'Q按需或隔轮，不以每轮Q为配装目标；E四段命中保证水环和产球。'], [pair('tenacity-of-the-millelith', 'vourukashas-glow', '最大化生命，提高全队丰穰之核增益。', '首选'), pair('tenacity-of-the-millelith', 'gilded-dreams', '生命词条不足或已接近被动上限时替代。', '替代'), pair('vourukashas-glow', 'wanderers-troupe', '生命与精通过渡。')], ['队伍仅水草且至少各一名才能启用被动；约74444生命封顶一项丰穰增伤，不把它当治疗/直伤统一上限。', '辅助方案双暴权重为零，精通只提高妮露本人触发的核；不要为直伤水杯牺牲主要团队生命增益。']),
  ], 0, 0, 'https://keqingmains.com/nilou/'),
  p('nahida', '纳西妲', '3.2', 5, '草', '法器', '精通倍率挂草 / 激化 / 绽放', [
    b('offfield', '后台挂草 · 精通辅助', [['elementalMastery'], ['elementalMastery', 'dendroDmgBonus'], ['elementalMastery', 'critRate', 'critDamage']], { ...em, energyRecharge: .8, atkPercent: .2 }, [120, 140, '双草或后台超绽放每轮Q；双雷100–120%，烈绽放140–160%；无需Q的队伍可不追循环。'], [four('deepwood-memories', '队伍草伤/绽放衍生伤害，优先覆盖草抗削减。'), four('gilded-dreams', '已有可靠深林持有者。', '替代'), emPair], ['900–1000精通只是常见被动目标，不是越过后伤害归零；最高精通队友也能决定Q分享。', '天赋给灭净三业最多24%条件暴击，不是普攻或全局常驻暴率。']),
    b('onfield', '站场激化 / 超绽放驾驶', [['elementalMastery'], ['dendroDmgBonus', 'elementalMastery'], ['critRate', 'critDamage', 'elementalMastery']], { ...em, atkPercent: .3, energyRecharge: .6 }, [100, 130, '超绽放前台约100–120%、双草约110–130%；站场能吃Q精通，不要求面板1000。'], [four('deepwood-memories', '队伍唯一深林持有者。'), four('gilded-dreams', '另有稳定深林辅助。', '替代'), pair('deepwood-memories', 'gilded-dreams', '草伤精通过渡。')], ['站场可提高草伤与双暴相对收益；并非所有草角色都三精通。']),
    b('bloom', '妮露队 · 普通丰穰绽放', [['elementalMastery'], ['elementalMastery'], ['elementalMastery']], reactionEr, [120, 140, '单草妮露队前台每轮Q参考，双草可能更低；Q可按团队收益安排。'], [four('deepwood-memories', '队伍需要草抗削减。'), four('gilded-dreams', '已有深林且本人有较多绽放触发权。', '替代'), emPair], ['普通丰穰之核不吃双暴；二命特殊反应暴击不是由面板双暴决定，零命也没有该效果。']),
  ], 0, 0, 'https://keqingmains.com/q/nahida-quickguide/'),
  p('layla', '莱依拉', '3.2', 4, '冰', '单手剑', '生命护盾 / 后台挂冰', [
    b('shield', '护盾优先 · 按需Q', [['hpPercent'], ['hpPercent'], ['hpPercent', 'critRate']], { ...shieldHp, critRate: .25 }, [100, 100, '以E护盾为主，Q按需；若每轮Q，零命双冰120–140%，单冰220%以上，二命会大幅降低但不默认。'], [four('tenacity-of-the-millelith', '护盾星弹持续命中，增加盾量并给攻击队加攻。'), pair('tenacity-of-the-millelith', 'vourukashas-glow', '主C不吃攻击或无法保持千岩效果。', '替代'), pair('tenacity-of-the-millelith', 'emblem-of-severed-fate', '需要Q循环时充能生命过渡。')], ['护盾破掉会停止E产球和星弹；不把脆盾输出装按满覆盖计算。', '暴率仅在西风武器时有功能价值；纯盾不追暴伤。']),
  ], 0, 0, 'https://keqingmains.com/q/layla-quickguide/'),
  p('faruzan', '珐露珊', '3.3', 4, '风', '弓', '风伤增益 / 风抗削减', [
    b('support', '零命双风西风 · 风C辅助', [['energyRecharge'], ['anemoDmgBonus', 'atkPercent'], ['critRate']], { energyRecharge: 1.2, critRate: .6, atkPercent: .2, atkFlat: .05 }, [220, 240, '零命双风、22秒循环、西风一次、两次风压坍陷且接全球；只接半数245–260%，仅一次坍陷275–300%。'], [four('noblesse-oblige', '风C吃攻击且队内无宗室，先保证充能。'), pair('emblem-of-severed-fate', 'viridescent-venerer', '零命高充能优先的五星替代，不虚构团队减抗。', '替代'), pair('emblem-of-severed-fate', 'gladiators-finale', '充能与个人伤害过渡，套装收益次于循环。')], ['零命不能用六命后台坍陷维持千岩4；六命需求较低也不能当默认。', '基础攻击只来自等级与武器，圣遗物攻击不提高基于基础攻击的辅助加值。']),
  ], 0, 0, 'https://keqingmains.com/q/faruzan-quickguide/'),
  p('wanderer', '流浪者', '3.3', 5, '风', '法器', '悬空普攻 / 重击风伤', [
    b('onfield', '零命站场 · 隔轮Q', [['atkPercent'], ['anemoDmgBonus'], ['critRate', 'critDamage']], atk, [100, 100, '零命通常隔轮Q或按需，不专堆充能；追忆想隔轮Q也可能130–140%，不可套用100%循环。'], [four('desert-pavilion-chronicle', '重击触发后站场普重击，保持覆盖。'), four('shimenawas-reminiscence', '有优秀旧装且能满足E消耗，接受降低Q频率。', '替代'), pair('desert-pavilion-chronicle', 'gladiators-finale', '风伤攻击过渡。')], ['吸收冰时天赋20%条件暴击，需要预留空间；二命每轮Q玩法另配充能。']),
  ], 0, 0, 'https://keqingmains.com/wanderer/'),
  p('alhaitham', '艾尔海森', '3.4', 5, '草', '单手剑', '精通倍率草站场 / 激化', [
    b('spread', '纳西妲双草 · 激化站场', [['elementalMastery'], ['dendroDmgBonus'], ['critRate', 'critDamage']], { ...em, atkPercent: .35, atkFlat: .1, energyRecharge: .9 }, [120, 140, '零命铁蜂刺等常见武器，纳西妲双草每轮Q的起始参考；其他草约130–140%，单草175–220%，实际零命队友产球不足需提高。'], [four('gilded-dreams', '队友深林覆盖，保持激化或激绽。'), four('deepwood-memories', '没有其他可靠深林持有者。', '替代'), pair('gilded-dreams', 'wanderers-troupe', '精通二件套过渡。')], ['精通与双暴草伤兼顾，不照抄纯反应三精通；三镜覆盖与Q循环比单一面板更重要。', '指南精确充能表部分假设四星队友满命，此区间不是任意零命队伍保证值。']),
  ], 0, 0, 'https://keqingmains.com/q/alhaitham-quickguide/'),
  p('yaoyao', '瑶瑶', '3.4', 4, '草', '长柄武器', '生命治疗 / 挂草辅助', [
    b('skill', 'E治疗挂草 · 按需Q', [['hpPercent'], ['hpPercent'], ['healingBonus', 'hpPercent', 'critRate']], { ...shieldHp, critRate: .3 }, [100, 100, 'E治疗、Q按需救场，不固定每轮Q；西风在场触发需暴率与攻击动作。'], [four('deepwood-memories', '队伍草伤或绽放衍生伤害且无其他深林。'), four('tenacity-of-the-millelith', '激化攻击队、萝卜能持续命中敌人。', '替代'), pair('ocean-hued-clam', 'maiden-beloved', '纯治疗过渡。')], ['治疗吃生命，不把精通或攻击作为普适治疗倍率；Q需站场才有完整群疗。']),
    b('burst', '零命双草 · 每轮群疗', [['energyRecharge', 'hpPercent'], ['hpPercent'], ['healingBonus', 'hpPercent', 'critRate']], { ...healingHp, critRate: .3 }, [220, 240, '零命双草、20–22秒、一E一Q的普通武器参考；单草260–270%，西风/喜多院可下降，二命不能默认。'], [four('deepwood-memories', '草伤队补减抗。'), four('ocean-hued-clam', '已有深林且Q群疗能叠泡沫。', '替代'), pair('emblem-of-severed-fate', 'tenacity-of-the-millelith', '循环与治疗生命过渡。')], ['与E按需开大配置分开评分，不能把100%充能当每轮群疗达标。']),
  ], 0, 0, 'https://keqingmains.com/q/yaoyao-quickguide/'),
  p('dehya', '迪希雅', '3.5', 5, '火', '双手剑', '承伤抗打断 / 火爆发', [
    b('support', 'E抗打断 · 不开大辅助', [['hpPercent'], ['hpPercent'], ['hpPercent', 'critRate']], { ...shieldHp, critRate: .3 }, [100, 100, 'E为主、通常跳过Q，不为抗打断功能专堆充能。'], [four('tenacity-of-the-millelith', '领域协同攻击命中，主C吃攻击。'), four('deepwood-memories', '燃烧草伤队缺少深林，可由E协同维持。', '替代'), hpPair], ['零命不能保证E领域全覆盖，强抗打断窗口也短于领域；生命主要提高承伤容错。']),
    b('burst', '纯火 / 燃烧 · 爆发输出', [['atkPercent', 'energyRecharge'], ['pyroDmgBonus'], ['critRate', 'critDamage']], { ...atk, hpPercent: .2, energyRecharge: 1.1 }, [160, 180, '零命纯火/燃烧、多火队友供球，每轮Q参考；融化180–225%，芙宁娜蒸发160–210%，单火需重算。'], [four('emblem-of-severed-fate', '零命需要较高充能，Q为主。'), four('vourukashas-glow', '能持续承伤叠层且充能已解决时。', '替代'), pair('emblem-of-severed-fate', 'noblesse-oblige', '充能爆发过渡。')], ['零命攻击一般优于生命沙；一命提高生命倍率不能当默认。', 'Q拳不是普攻触发，不能驱动行秋/夜兰协同攻击。']),
    b('burgeon', 'E触发烈绽放 · 精通', [['elementalMastery'], ['elementalMastery'], ['elementalMastery']], reactionEm, [100, 100, '仅靠E触发烈绽放，Q不用；不依赖爆发循环。'], [four('flower-of-paradise-lost', '本人确实能命中草原核，接受E触发频率限制。'), four('gilded-dreams', '反应精通替代。', '替代'), emPair], ['E触发间隔较长，面对高大敌人可能漏核；不是托马烈绽放的等效覆盖。']),
  ], 0, 0, 'https://keqingmains.com/q/dehya-quickguide/'),
  p('mika', '米卡', '3.5', 4, '冰', '长柄武器', '生命治疗 / 攻速物理辅助', [
    b('healer', '零命西风 · 每轮群疗', [['energyRecharge', 'hpPercent'], ['hpPercent'], ['healingBonus', 'critRate', 'hpPercent']], { ...healingHp, critRate: .4 }, [175, 230, '零命西风每轮一次触发、一E一Q并把E球给主C；其他武器190–250%，精5沙中伟贤约105–140%。'], [four('noblesse-oblige', '攻击型主C队没有宗室。'), four('ocean-hued-clam', '已有宗室，偏治疗附带伤害。', '替代'), pair('emblem-of-severed-fate', 'tenacity-of-the-millelith', '充能生命治疗过渡。')], ['默认没有四命回能或六命物理暴伤；攻速不提高所有角色所有招式等量DPS。', '仅用E攻速且无需治疗时可不追Q；治疗玩法不能按100%充能达标。']),
  ], 0, 0, 'https://keqingmains.com/q/mika-quickguide/'),
  p('kaveh', '卡维', '3.6', 4, '草', '双手剑', '绽放草附魔驾驶', [
    b('driver', '纳西妲双草西风 · 绽放驾驶', [['energyRecharge', 'elementalMastery'], ['elementalMastery'], ['elementalMastery', 'critRate', 'healingBonus']], { ...reactionEr, critRate: .45 }, [120, 140, '纳西妲双草、西风自身两次触发、队友一次西风、每轮三E并接约2/3球；其他双草西风约160–180%，普通武器145–165%起。'], [four('deepwood-memories', '队伍尚无稳定深林；草抗削减提高草原核伤害。'), four('flower-of-paradise-lost', '已有深林且本人稳定拥有较多绽放触发权。', '替代'), emPair], ['先解决Q附魔与挂草，再堆精通；精通也增加天赋自疗。', '引爆草原核不转移其伤害归属，不能因卡维按E引爆就把所有核按他的精通计伤。']),
  ], 0, 0, 'https://keqingmains.com/q/kaveh-quickguide/'),
  p('baizhu', '白术', '3.6', 5, '草', '法器', '生命群疗 / 草反应辅助', [
    b('support', '纳西妲双草精5金珀 · 治疗辅助', [['hpPercent', 'energyRecharge'], ['hpPercent'], ['hpPercent', 'healingBonus']], healingHp, [145, 160, '纳西妲双草精5试作金珀、每轮一E一Q；其他双草170–190%，单草一E250–290%。双E单草约160–180%。'], [four('deepwood-memories', '队内没有其他可靠深林，需确认E/Q能命中目标。'), four('ocean-hued-clam', '队友有深林，兼顾群疗附带伤害。', '替代'), pair('tenacity-of-the-millelith', 'emblem-of-severed-fate', '生命与充能过渡。')], ['50000生命封顶一项反应增益，不等于治疗生命收益归零；循环优先于硬凑生生生。', '无郤气护盾很薄，以周期刷新抗打断为主，不是大盾；不假定一命额外E。']),
  ], 0, 0, 'https://keqingmains.com/q/baizhu-quickguide/'),
  p('kirara', '绮良良', '3.7', 4, '草', '单手剑', '生命护盾 / 速切挂草', [
    b('shield', '护盾优先 · 按需Q', [['hpPercent'], ['hpPercent'], ['hpPercent', 'critRate']], { ...shieldHp, critRate: .25 }, [100, 100, '短E叠盾，Q按需或隔轮；西风暴率仅在装备西风时需要，不为盾量专堆充能。'], [pair('tenacity-of-the-millelith', 'vourukashas-glow', '无条件最大化生命盾量。', '首选'), four('deepwood-memories', '无人持有深林且E/Q能够覆盖目标；后台刷新有限。', '替代'), pair('tenacity-of-the-millelith', 'emblem-of-severed-fate', '需要更频繁Q的生命充能过渡。')], ['零命没有四命后台协同挂草，深林覆盖不能当永久；千岩4也不能短E后永久维持。', '主用途是护盾，攻击双暴不提高盾量；长按叠盾需实战命中。']),
  ], 0, 0, 'https://keqingmains.com/q/kirara-quickguide/'),
].map(profile => ({
  ...profile,
  builds: profile.builds.map(build => ({ ...build, assumedWeapon: assumedWeapons[profile.id]?.[build.id] })),
}))
