import type { ArtifactSetKey } from '../artifacts/types'
import type { StatKey } from '../artifacts/statModel'
import type { BuildProfile, CharacterProfile, SetPlan, StatWeights } from './profileTypes'
import { LEGACY1_PROFILES } from './legacy1'
import { LEGACY23_PROFILES } from './legacy23'
import { LEGACY45_PROFILES } from './legacy45'
import roster from './roster.snapshot.json' with { type: 'json' }

const crit: StatWeights = { critRate: 1, critDamage: 1 }
const atk: StatWeights = { ...crit, atkPercent: .7, atkFlat: .2 }
const hp: StatWeights = { ...crit, hpPercent: .8, hpFlat: .2 }
const def: StatWeights = { ...crit, defPercent: .85, defFlat: .2 }
const em: StatWeights = { ...crit, elementalMastery: .9 }
// Level90 ascension/weapon panel assumptions, separate from artifact weights.
const rechargeAscension: Record<string, number> = { raiden: 32, alyosha: 26.67 }
const assumedWeapons: Record<string, Record<string, { name: string; energyRecharge: number; critRate: number }>> = {
  aino: { support: { name: '90级西风大剑', energyRecharge: 61.3, critRate: 0 } },
  jahoda: { anemo: { name: '90级西风猎弓', energyRecharge: 61.3, critRate: 0 }, lunar: { name: '90级西风猎弓', energyRecharge: 61.3, critRate: 0 } },
  alyosha: { solo: { name: '90级西风长枪', energyRecharge: 30.6, critRate: 0 }, double: { name: '90级西风长枪', energyRecharge: 30.6, critRate: 0 } },
  raiden: { burst: { name: '90级渔获（不自动假定被动命中暴击）', energyRecharge: 45.9, critRate: 0 } },
  columbina: { support: { name: '试作金珀（回能影响目标，非面板充能）', energyRecharge: 0, critRate: 0 } },
  neuvillette: { charged: { name: '试作金珀（回能影响目标，非面板充能）', energyRecharge: 0, critRate: 0 } },
}
const supportAtk: StatWeights = { energyRecharge: 1.1, atkPercent: .9, atkFlat: .25, critRate: .3 }
const supportEm: StatWeights = { energyRecharge: 1.1, elementalMastery: 1, critRate: .25 }
const four = (key: ArtifactSetKey, condition: string, label: SetPlan['label'] = '首选'): SetPlan => ({ label, pieces: [{ key, count: 4 }], condition })
const pair = (a: ArtifactSetKey, b: ArtifactSetKey, condition: string, label: SetPlan['label'] = '过渡'): SetPlan => ({ label, pieces: [{ key: a, count: 2 }, { key: b, count: 2 }], condition })
function build(id: string, label: string, mains: [StatKey[], StatKey[], StatKey[]], weights: StatWeights, er: [number, number, string], sets: SetPlan[], notes: string[]): BuildProfile {
  return { id, label, description: '默认零命、常见武器；条件见下方说明。数值权重为工具启发式，不是官方标准或实战伤害。', mainStats: { '时之沙': mains[0], '空之杯': mains[1], '理之冠': mains[2] }, weights, recharge: { min: er[0], max: er[1], note: er[2] }, sets, notes }
}
function profile(id: string, name: string, version: string, rarity: 4 | 5, element: string, weapon: string, role: string, builds: BuildProfile[], ascensionCritRate = 0): CharacterProfile {
  return { id, name, version, rarity, element, weapon, role, builds: builds.map(b => ({ ...b, assumedWeapon: assumedWeapons[id]?.[b.id] })), ascensionCritRate, ascensionEnergyRecharge: rechargeAscension[id] ?? 0, reviewedAt: '2026-10-17', sources: [{ title: 'KQM 原作者配装与机制指南', url: `https://keqingmains.com/q/${id}-quickguide/` }] }
}

const lunarSet = four('night-of-the-skys-unveiling', '站场月反应且达到辉月；套装30%暴击属于有条件增益。')
const windSet = four('a-day-carved-from-rising-winds', '完成魔女课业并满足触发条件；套装20%暴击不是常驻面板。')
const silken = four('silken-moons-serenade', '队伍没有其他更合适的纺月持有者；同类团队增益不应重复占位。')
const gildedTransition = four('gilded-dreams', '过渡用，不能据同分假定与专用套伤害相同。', '过渡')
const emTransition = pair('gilded-dreams', 'wanderers-troupe', '两种精通二件套过渡，均为五星圣遗物。')

const columbina = profile('columbina', '月之少女·哥伦比娅', '6.3', 5, '水', '法器', '后台月反应辅助 / 输出', [
  build('support', '双水金珀 · 月反应辅助', [['hpPercent', 'energyRecharge'], ['hpPercent'], ['critRate', 'critDamage', 'hpPercent']], { ...hp, energyRecharge: .95, elementalMastery: .25 }, [115, 150, '假设双水、试作金珀、每轮大招。普通武器双水约165–195%；单水普通武器可能235–300%以上，不能沿用此目标。'], [silken, four('aubade-of-morningstar-and-moon', '队友已持纺月、哥伦比娅主要处于后台。', '替代'), pair('tenacity-of-the-millelith', 'vourukashas-glow', '生命二件套过渡。')], ['35000生命仅封顶一项团队月反应基础提升，继续堆生命仍有个人伤害收益。', '自身天赋有15%条件暴击；配穹境再加30%，月绽放菈乌玛再加10%，须预留暴击空间。']),
  build('offfield', '双水普通武器 · 后台输出', [['hpPercent', 'energyRecharge'], ['hpPercent'], ['critRate', 'critDamage']], { ...hp, energyRecharge: 1 }, [165, 195, '双水、非回能武器，每轮开大；单水或隔轮大需重新调整。'], [four('aubade-of-morningstar-and-moon', '长期后台且队内已有纺月辅助。'), silken], ['不是生生生固定模板；优先循环，再平衡双暴与生命。']),
], 19.2)
const sandrone = profile('sandrone', '木偶·桑多涅', '6.7', 5, '冰', '双手剑', '站场星超导输出', [
  build('lunar', '星超导 · 按需开大', [['atkPercent'], ['atkPercent'], ['critRate', 'critDamage']], { ...atk, elementalMastery: .4, energyRecharge: .15 }, [100, 120, '按需或隔轮开大，不为每轮Q牺牲大量攻击与双暴。每轮Q双冰约130–165%，三冰/三雷约120–140%，依西风而变。'], [four('disenchantment-in-deep-shadow', '星超导条件满足；16%条件暴击，双冰冻结/冰附着还可能额外15%。'), gildedTransition, pair('gladiators-finale', 'gilded-dreams', '攻击与精通二件套过渡。')], ['主要星超导不吃冰元素伤害杯，使用攻击杯。', '2000攻击仅对应被动的一部分上限，不将后续攻击价值归零。']),
], 19.2)
const zibai = profile('zibai', '兹白', '6.3', 5, '岩', '单手剑', '站场月结晶输出', [
  build('lunar', '月结晶 · 按需开大', [['defPercent'], ['defPercent'], ['critRate', 'critDamage']], { ...def, elementalMastery: .4, energyRecharge: .1 }, [100, 100, 'Q有就开，不强制每轮；双岩每轮Q约130–145%，三岩105–140%，含西风假设。'], [lunarSet, four('husk-of-opulent-dreams', '四件穹境暂缺时过渡，不能视为同等收益。', '过渡'), pair('husk-of-opulent-dreams', 'gilded-dreams', '防御与精通过渡。')], ['默认防御杯，不是岩伤杯。2000防御只封顶一项月结晶基础增益。', '穹境触发30%暴击，静态面板通常留在70%以内，另扣武器/队友加成。']),
])
const durin = profile('durin', '杜林', '6.2', 5, '火', '单手剑', '后台爆发 / 减抗辅助', [
  build('damage', '后台个人输出', [['atkPercent', 'energyRecharge'], ['pyroDmgBonus', 'atkPercent'], ['critRate', 'critDamage']], { ...atk, energyRecharge: .9, elementalMastery: .35 }, [120, 150, '每轮一次E与Q，单火后台；双火100–150%，两名火队友约100–110%，两E循环通常不专堆。'], [windSet, four('noblesse-oblige', '队伍缺加攻宗室且以辅助为主。', '替代')], ['风起需完成魔女课业；20%条件暴击须防溢出。', '精通仅在蒸发、融化等本人确实触发反应时提高收益。']),
  build('support', '魔导直伤队 · 团队辅助', [['atkPercent', 'energyRecharge'], ['pyroDmgBonus', 'atkPercent'], ['critRate', 'critDamage']], { ...atk, energyRecharge: 1, elementalMastery: .3 }, [120, 150, '每轮一次E，非回能武器；按队伍调整。'], [four('celestial-gift', '队友吃元素直伤增益，优先双魔导且不与另一美赐持有者重复。'), four('deepwood-memories', '草伤队缺少草抗削减持有者。', '替代'), windSet], ['这是团队增益方案，不代表杜林个人伤害最高。']),
])
const varkaBuild = (id: string, element: StatKey, title: string) => build(id, `${title}转换 · 站场输出`, [['atkPercent'], [element, 'atkPercent'], ['critRate', 'critDamage']], { ...atk, energyRecharge: .05, elementalMastery: .05 }, [100, 100, '通常不使用Q，不专门堆充能；不是固定每轮爆发循环。'], [windSet, four('zhuying-lieren', '仅有芙宁娜等可靠生命变化并维持套装效果时。', '替代'), pair('gladiators-finale', 'shimenawas-reminiscence', '攻击二件套过渡。')], ['默认双风加两名同元素队友，并有魔导协作；按实际队伍选择转换杯。', '2500攻击只封顶一项增伤被动，之后攻击仍有效。C2以后风伤杯竞争力会变化。'])
const varka = profile('varka', '法尔伽', '6.4', 5, '风', '双手剑', '双元素站场输出', [varkaBuild('pyro', 'pyroDmgBonus', '火'), varkaBuild('hydro', 'hydroDmgBonus', '水'), varkaBuild('electro', 'electroDmgBonus', '雷'), varkaBuild('cryo', 'cryoDmgBonus', '冰')])
const nefer = profile('nefer', '奈芙尔', '6.1', 5, '草', '法器', '站场月绽放输出', [
  build('lunar', '月绽放 · 隔轮开大', [['elementalMastery'], ['elementalMastery'], ['critRate', 'critDamage']], { ...em, elementalMastery: 1.05, energyRecharge: .1 }, [100, 105, '双/三草隔轮Q可100%，单草约105%；不强求每轮Q。'], [lunarSet, gildedTransition, emTransition], ['不推荐默认攻击沙或草伤杯。800/1000精通分别是部分被动上限，不是总精通收益上限。', '穹境30%加菈乌玛10%条件暴击，通常面板60%便接近实战满暴，仍须考虑武器。']),
])
const raiden = profile('raiden', '雷电将军', '2.1', 5, '雷', '长柄武器', '充能爆发 / 超绽放', [
  build('burst', '站场爆发', [['energyRecharge', 'atkPercent'], ['electroDmgBonus', 'atkPercent'], ['critRate', 'critDamage']], { ...atk, energyRecharge: 1 }, [220, 250, '零命渔获等常见武器，按队伍与循环调整；薙草等武器会改变充能收益。'], [four('emblem-of-severed-fate', '以Q站场输出，先满足循环。'), pair('emblem-of-severed-fate', 'noblesse-oblige', '缺绝缘4时过渡。')], ['充能达标后的价值不会一概归零，但不能只追充能忽略双暴攻击。']),
  build('hyperbloom', '后台超绽放触发', [['elementalMastery'], ['elementalMastery'], ['elementalMastery']], { elementalMastery: 1 }, [100, 100, '以E触发超绽放，不依赖Q。'], [four('flower-of-paradise-lost', '本人稳定触发超绽放。'), four('gilded-dreams', '副词条和队伍条件合适。', '替代'), emTransition], ['此玩法优先等级与精通，不按直伤双暴打分。']),
])
const neuvillette = profile('neuvillette', '那维莱特', '4.1', 5, '水', '法器', '生命倍率站场水伤', [
  build('charged', '生命水伤 · 金珀双E循环', [['hpPercent'], ['hydroDmgBonus', 'hpPercent'], ['critRate', 'critDamage', 'hpPercent']], { ...hp, energyRecharge: .8 }, [120, 140, '两E一Q及队友回能假设；武器、单双水与西风会改变需求，单E循环不套用此值。'], [four('zhuying-lieren', '自身生命变化触发，满层额外36%暴击。'), pair('tenacity-of-the-millelith', 'heart-of-depth', '生命与水伤二件套过渡。')], ['主要伤害按生命成长，攻击词条不计有效权重。暴击需扣除逐影条件36%。']),
])
const furina = profile('furina', '芙宁娜', '4.2', 5, '水', '单手剑', '后台生命伤害 / 全队增伤', [
  build('offfield', '双水 · 后台增伤', [['hpPercent', 'energyRecharge'], ['hpPercent', 'hydroDmgBonus'], ['critRate', 'critDamage']], { ...hp, energyRecharge: 1.05 }, [180, 210, '双水且队友每轮一次E；那维莱特队约130–150%，单水200%以上，西风可降需求。'], [four('golden-troupe', '后台E输出，搭配可靠治疗维持团队循环。'), pair('tenacity-of-the-millelith', 'vourukashas-glow', '生命二件套过渡。')], ['Q循环是团队增伤关键。C6站场逐影并非零命默认方案。']),
], 19.2)
const arlecchino = profile('arlecchino', '阿蕾奇诺', '4.6', 5, '火', '长柄武器', '生命之契站场火伤', [
  build('onfield', '常规火伤站场', [['atkPercent'], ['pyroDmgBonus', 'atkPercent'], ['critRate', 'critDamage']], { ...atk, elementalMastery: .2, energyRecharge: .05 }, [100, 100, '通常不追求每轮Q；Q用于生存与重置，按实战安排。'], [four('fragment-of-harmonic-whimsy', '维持生命之契与套装层数。'), four('gladiators-finale', '已有优秀旧装，可作为替代。', '替代')], ['蒸发队精通才有明显价值；治疗限制使逐影不能按芙宁娜模板无条件推荐。']),
])

const RECENT_PROFILES: readonly CharacterProfile[] = [
  // Preserve the original ten display names/order for existing selection/custom portraits.
  columbina, sandrone, zibai, durin, varka, nefer, raiden, neuvillette, furina, arlecchino,
  profile('lauma', '菈乌玛', '6.0', 5, '草', '法器', '后台绽放 / 月绽放辅助', [
    build('support', '常规双草 · 月绽放辅助', [['elementalMastery', 'energyRecharge'], ['elementalMastery'], ['elementalMastery']], supportEm, [140, 175, '非奈芙尔的双草、零命常见武器；单草170–210%，奈芙尔双草210–225%，西风会降低需求。'], [silken, four('deepwood-memories', '队伍缺草抗削减持有者时优先补位。', '替代'), emTransition], ['800精通只封顶部分被动，爆发辅助与个人伤害仍受更多精通影响。']),
    build('nefer', '奈芙尔双草 · 每轮爆发', [['energyRecharge', 'elementalMastery'], ['elementalMastery'], ['elementalMastery']], { ...supportEm, energyRecharge: 1.2 }, [210, 225, '零命奈芙尔双草参考；西风触发及回能武器需下调目标。'], [silken, four('deepwood-memories', '队内没有深林持有者时。', '替代')], ['循环优先，辉月月绽放的暴击增益是队伍条件，不默认算作本人常驻。']),
  ]),
  profile('flins', '菲林斯', '6.0', 5, '雷', '长柄武器', '站场月感电输出', [
    build('lunar', '零命双雷 · 两次特殊爆发', [['atkPercent'], ['atkPercent'], ['critRate', 'critDamage']], { ...atk, elementalMastery: .4, energyRecharge: 1 }, [110, 135, '菲谢尔/欧洛伦/久岐忍约110–120%，其他雷120–135%；合理西风假设，专武另降需求。'], [lunarSet, four('zhuying-lieren', '仅有芙宁娜和可靠生命变化时。', '替代'), gildedTransition], ['月感电主伤害不吃雷伤杯，默认攻攻双暴。', '2000攻击只封顶部分转精通与基础反应增益；穹境满辉有30%条件暴击。']),
  ]),
  profile('aino', '爱诺', '6.0', 4, '水', '双手剑', '后台挂水 / 月兆辅助', [
    build('support', '零命西风 · 挂水辅助', [['energyRecharge', 'elementalMastery'], ['elementalMastery', 'hydroDmgBonus'], ['elementalMastery', 'critRate', 'critDamage']], { ...supportEm, critRate: .5, critDamage: .2 }, [155, 205, '西风且每Q一次E，含合理队友西风假设；非西风约190–250%以上。'], [silken, pair('emblem-of-severed-fate', 'gilded-dreams', '充能与精通五星过渡，原攻略教官为四星，不纳入本工具推荐。')], ['只负责挂水时，不把攻击双暴当作主要团队收益；本人反应占比决定精通价值。']),
  ]),
  profile('jahoda', '雅珂达', '6.2', 4, '风', '弓', '攻击倍率治疗 / 反应辅助', [
    build('anemo', '双风西风 · 治疗减抗', [['energyRecharge', 'atkPercent'], ['atkPercent'], ['healingBonus', 'critRate', 'atkPercent']], supportAtk, [145, 180, '零命双风西风；单风其他队伍约200–255%，非西风需求更高。'], [four('viridescent-venerer', '需要实际扩散对应元素；E/Q起手风伤使持续覆盖受限。'), silken], ['治疗按攻击，不是风角色一律全精通。西风需要暴率；草主伤队不默认用风套减草抗。']),
    build('lunar', '月反应队 · 单风西风', [['energyRecharge', 'atkPercent'], ['atkPercent'], ['healingBonus', 'critRate', 'atkPercent']], supportAtk, [200, 255, '零命单风西风参考；双雷约190–205%，按循环调整。'], [silken, four('deepwood-memories', '奈芙尔等草伤队且无人持有深林。', '替代')], ['别重复装备同一团队增益套。']),
  ]),
  profile('illuga', '叶洛亚', '6.3', 4, '岩', '长柄武器', '精通倍率月结晶辅助', [
    build('support', '零命双岩 · 月结晶辅助', [['elementalMastery', 'energyRecharge'], ['elementalMastery'], ['elementalMastery', 'critRate']], supportEm, [165, 185, '零命兹白双岩、吃球及队友西风假设；自己西风可降15–30点，一命需求降低。'], [silken, pair('gilded-dreams', 'wanderers-troupe', '队友已有纺月，或需要精通二件套过渡。'), pair('emblem-of-severed-fate', 'gilded-dreams', '循环不足的充能+精通过渡。')], ['主要辅助倍率来自精通，不套用防御岩辅模板。', '零至一命纺月刷新/覆盖较短，二命后台岩伤改善；不假定零命也永久覆盖。']),
  ]),
  profile('linnea', '莉奈娅', '6.5', 5, '岩', '弓', '后台月结晶 / 治疗减抗', [
    build('damage', '后台输出 · 按需治疗', [['defPercent'], ['defPercent'], ['critRate', 'critDamage', 'defPercent']], { ...def, elementalMastery: .25, energyRecharge: .05 }, [100, 100, 'Q按需使用，不追求每轮治疗。'], [four('husk-of-opulent-dreams', '防御同时提供输出、治疗与辅助收益。'), four('aubade-of-morningstar-and-moon', '长期后台月反应输出，按队伍权衡。', '替代'), silken], ['2000防御不是总收益硬上限，继续堆防御仍提高伤害与治疗。']),
    build('healing', '每轮治疗循环', [['energyRecharge', 'defPercent'], ['defPercent'], ['defPercent', 'healingBonus', 'critRate']], { defPercent: 1, defFlat: .25, energyRecharge: 1.1, critRate: .3 }, [170, 185, '每轮开大治疗，队友一次西风可降约15–20点。'], [four('husk-of-opulent-dreams', '兼顾防御倍率治疗和团队收益。'), silken], ['与按需开大的输出方案分开评价。']),
  ], 19.2),
  profile('nicole', '尼可', '6.6', 5, '火', '法器', '全队加攻 / 护盾魔导辅助', [
    build('support', '战技辅助 · 不强求爆发', [['atkPercent'], ['atkPercent'], ['atkPercent']], { atkPercent: 1, atkFlat: .3 }, [100, 100, '不放大或隔轮大，不专堆充能。'], [four('celestial-gift', '魔导/元素直伤队，队伍不重复美赐。'), pair('gladiators-finale', 'shimenawas-reminiscence', '不适合美赐触发或需要攻击二件套时。', '替代'), four('noblesse-oblige', '愿意开大且队伍缺宗室时。', '替代')], ['4000攻击封顶战技加攻，但护盾与部分伤害不必同样归零。', '班尼特等二次转化攻击不能再次转化，不把战斗面板总攻击直接当有效辅助攻击。']),
    build('burst', '双火 · 每轮爆发', [['energyRecharge', 'atkPercent'], ['atkPercent'], ['atkPercent']], { atkPercent: 1, atkFlat: .3, energyRecharge: 1.1 }, [155, 210, '双火非专武；单火约200–230%，专武显著降需求。'], [four('celestial-gift', '魔导直伤辅助。'), four('noblesse-oblige', '队伍无其他宗室持有者。', '替代')], ['保证循环，再追攻击；不是输出双暴模板。']),
  ]),
  profile('lohen', '洛恩', '6.6', 5, '冰', '长柄武器', '站场冰伤 / 融化驾驶员', [
    build('driver', '冰直伤 / 挂冰驾驶', [['atkPercent'], ['cryoDmgBonus', 'atkPercent'], ['critRate', 'critDamage']], { ...atk, elementalMastery: .05, energyRecharge: .1 }, [100, 115, '隔轮Q，单冰约100–115%；不硬追每轮Q的190–230%。'], [windSet, four('blizzard-strayer', '冻结队且敌人可冻结；不可无条件套用于BOSS。', '替代'), four('zhuying-lieren', '仅芙宁娜等可靠生命变化时。', '替代')], ['杜林融化队主要由杜林触发反应，洛恩不因此无脑堆精通。']),
    build('melt', '本人持续反向融化', [['atkPercent', 'elementalMastery'], ['cryoDmgBonus', 'atkPercent'], ['critRate', 'critDamage']], { ...atk, elementalMastery: .6, energyRecharge: .1 }, [100, 115, '零命单冰隔轮Q为基准，回能武器与队友西风触发会改变需求。'], [windSet, four('unfinished-reverie', '稳定燃烧辅助本人融化，已有优秀旧装时。', '替代')], ['仅本人能稳定触发融化时提高精通价值。']),
  ]),
  profile('prune', '布伦妮', '6.6', 4, '风', '法器', '后台扩散 / 魔导增伤辅助', [
    build('support', '零命双风 · 爆发辅助', [['energyRecharge', 'atkPercent'], ['atkPercent'], ['atkPercent', 'critRate']], { ...supportAtk, elementalMastery: .15 }, [185, 205, '零命双风、无额外回能的参考；单风245–285%，西风/证誓可降低。'], [four('viridescent-venerer', '能扩散到主C对应元素。'), four('celestial-gift', '风C队或无法可靠扩散主C元素，并避免与队友重复。', '替代'), four('noblesse-oblige', '队伍已有美赐且无人持宗室。', '替代')], ['4000实战攻击封顶一项天赋；循环优先，西风时兼顾暴率，不主追双暴。']),
  ]),
  profile('odette', '奥黛塔', '7.0', 5, '冰', '单手剑', '星反应后台输出 / 增益', [
    build('support', '星反应后台 · 常规不开大', [['atkPercent'], ['atkPercent'], ['critRate', 'critDamage']], { ...atk, elementalMastery: .4 }, [100, 100, '通常跳过Q；高命/专武改变开大价值时另配循环。'], [four('heart-of-the-furnace', '队伍一套炉火；满足星反应触发条件。'), four('disenchantment-in-deep-shadow', '星超导队已有更合适炉火持有者。', '替代'), four('tenacity-of-the-millelith', '低配置偏团队加攻，仍需可靠触发。', '替代')], ['默认攻攻双暴，冰伤杯不提升主要星反应伤害。2000/3000攻击只是不同被动的上限。']),
  ]),
  profile('alyosha', '阿罗夏', '7.0', 4, '雷', '长柄武器', '前台治疗 / 星超导辅助', [
    build('solo', '零命单雷西风 · 治疗辅助', [['energyRecharge', 'atkPercent'], ['atkPercent'], ['healingBonus', 'atkPercent', 'critRate']], { ...supportAtk, critRate: .5 }, [195, 225, '零命单雷西风；一命以上约150–175%，连续循环不能套用开局满能量。'], [four('heart-of-the-furnace', '本人能触发星超导，且队伍尚无炉火持有者。'), four('noblesse-oblige', '队友已有炉火，需要每轮Q触发宗室。', '替代')], ['治疗按攻击，先充能再西风暴率与攻击；不是双暴输出。']),
    build('double', '零命双雷西风 · 治疗辅助', [['energyRecharge', 'atkPercent'], ['atkPercent'], ['healingBonus', 'atkPercent', 'critRate']], { ...supportAtk, critRate: .5 }, [130, 155, '零命双雷西风；一命以上约105–125%，二命隔轮Q另看开局与循环。'], [four('heart-of-the-furnace', '本人触发星超导，队伍不重复。'), four('noblesse-oblige', '队友已有炉火。', '替代')], ['同角色不同队伍要切换充能配置。']),
  ]),
  { ...profile('vesna', '薇斯纳', '7.1', 5, '风', '单手剑', '站场星扩散输出', [
    build('stellar', '星扩散 · 按需优化爆发', [['atkPercent', 'elementalMastery'], ['atkPercent', 'elementalMastery'], ['critRate', 'critDamage']], { ...atk, elementalMastery: .55, energyRecharge: .35 }, [120, 140, '先以额外20–40%充能优化，不强求每轮。资料模型对无回能单风需求分歧大，需按武器与队伍调节。'], [four('scarlet-proof', '星扩散触发条件满足，条件暴击16%。'), gildedTransition, pair('gladiators-finale', 'gilded-dreams', '攻击/精通二件套过渡。')], ['优先攻攻双暴，加攻充足可换一件精通；风伤杯不提升主要星扩散。', '2000攻击只是基础反应增益上限；突破加暴率，尤其注意武器与套装暴击溢出。']),
  ], 19.2), sources: [{ title: '阿斯盖特正式服配装分析', url: 'https://www.miyoushe.com/ys/article/78338020' }, { title: '官方HoYoWiki角色资料', url: 'https://wiki.hoyolab.com/m/genshin/entry/11661?lang=zh-cn' }] },
  profile('vodyanitsa', '沃雅妮莎', '7.1', 5, '水', '法器', '生命倍率增益 / 治疗减抗', [
    build('atk-team', '攻击倍率队 · 纯辅助', [['hpPercent'], ['hpPercent'], ['hpPercent']], { hpPercent: 1, hpFlat: .25 }, [100, 100, '纯辅助按需开大，不专堆充能；每轮Q双水金珀145–155%，其他武器210–220%。'], [four('tenacity-of-the-millelith', '攻击倍率输出队，E能可靠触发。'), pair('tenacity-of-the-millelith', 'vourukashas-glow', '不需要千岩加攻时生命二件套。', '替代')], ['65000生命封顶一项基础倍率增益，一命加攻不是同一上限；纯辅不追双暴精通。']),
    build('hp-team', '生命倍率队 · 纯辅助', [['hpPercent'], ['hpPercent'], ['hpPercent']], { hpPercent: 1, hpFlat: .25 }, [100, 100, '那维莱特等生命倍率队，按需开大；不固定追每轮Q。'], [pair('tenacity-of-the-millelith', 'vourukashas-glow', '队伍不吃攻击加成，优先生命二件套。', '首选')], ['千岩攻击加成对不吃攻击的主C无效，不机械凑千岩4。']),
  ]),
]

const identityByName = new Map(roster.entries.map(row => [row.name, row]))
export const CHARACTER_PROFILES: readonly CharacterProfile[] = [...RECENT_PROFILES, ...LEGACY1_PROFILES, ...LEGACY23_PROFILES, ...LEGACY45_PROFILES].map(profile => {
  const identity = identityByName.get(profile.name.split('·').at(-1) ?? profile.name)
  if (!identity) throw new Error(`角色身份未核实：${profile.name}`)
  return { ...profile, releaseOrder: identity.releaseOrder, ascensionCritRate: identity.ascensionCritRate, ascensionEnergyRecharge: identity.ascensionEnergyRecharge, critRateAdjustment: profile.id === 'kokomi' ? -100 : undefined }
})
const profilesByName = new Map(CHARACTER_PROFILES.flatMap(profile => [[profile.name, profile], [profile.name.split('·').at(-1) ?? profile.name, profile]] as const))
export function getCharacterProfile(name: string): CharacterProfile | undefined { return profilesByName.get(name) }
export function getBuildProfile(name: string, buildId?: string): BuildProfile | undefined {
  const p = getCharacterProfile(name)
  return p?.builds.find(b => b.id === buildId) ?? p?.builds[0]
}
