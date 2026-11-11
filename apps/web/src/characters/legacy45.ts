import type { BuildProfile, CharacterProfile } from './profileTypes'
import { b, p, four, pair, atk, hp, def, em, supportAtk, supportEm } from './legacyFactory'

// Main stats / set choices / rotation conditions: linked KQM author guides, checked 2026-10-18.
// Numeric weights are our normalized heuristic, not a damage simulation or KQM's weights.
const crit = ['critRate', 'critDamage'] as const
const vv = four('viridescent-venerer', '本人实际扩散主输出对应的火水雷冰；不能减风、岩、草抗。')
const scroll = four('scroll-of-the-hero-of-cinder-city', '夜魂状态下本人触发所需元素反应，才有完整40%增伤；同元素增益不叠加。')
const hunter = four('zhuying-lieren', '自身或芙宁娜等可靠生命变化；满层36%条件暴击须留空间。', '替代')
const codex = four('heiyao-midian', '前台夜魂消耗触发；40%条件暴击并非常驻面板。')
const atkPair = pair('gladiators-finale', 'shimenawas-reminiscence', '攻击二件套过渡；不能把相同评分当作相同伤害。')
const emPair = pair('gilded-dreams', 'wanderers-troupe', '精通二件套过渡，均为五星套装。')
const hpPair = pair('tenacity-of-the-millelith', 'vourukashas-glow', '生命二件套，提高治疗或护盾。')
const noEr = [100, 100, '不为每轮Q专堆充能；有能量才开，不把开局满能量当循环。'] as [number, number, string]
function fav(build: BuildProfile, name: string, energyRecharge: number): BuildProfile {
  return { ...build, assumedWeapon: { name: `90级${name}（须在场触发西风被动）`, energyRecharge, critRate: 0 } }
}

export const LEGACY45_PROFILES: CharacterProfile[] = [
  p('lyney', '林尼', '4.0', 5, '火', '弓', '蓄力重击 / 纯火站场', [
    b('charged', '纯火蓄力 · 每轮爆发', [['atkPercent'], ['pyroDmgBonus', 'atkPercent'], [...crit]], { ...atk, energyRecharge: .65 }, [125, 150, '零命试作澹月等非回能弓、纯火每轮Q；隔轮Q可不堆充能。'], [four('zhuying-lieren', '蓄力耗血及战技回血维持层数，套装满层36%暴击。'), pair('zhuying-lieren', 'crimson-witch-of-flames', '重击与火伤二件套过渡。')], ['突破暴率与逐影叠加，通常优先暴伤冠，先防暴击溢出。', '被动需要敌人火附着及火队友；不默认把蒸发精通当主要收益。']),
  ], 19.2, 0, 'https://keqingmains.com/q/lyney-quickguide/'),
  p('lynette', '琳妮特', '4.0', 4, '风', '单手剑', '后台风伤 / 扩散减抗', [
    fav(b('support', '零命单风西风 · 一E循环', [['energyRecharge', 'atkPercent'], ['anemoDmgBonus', 'atkPercent'], [...crit]], { ...atk, energyRecharge: 1.1 }, [180, 200, '零命西风一E每轮Q；非回能剑同条件240%以上。两E需要四命或祭礼，不默认拥有。'], [vv, pair('emblem-of-severed-fate', 'viridescent-venerer', '充能与风伤过渡，缺少风套减抗。')], ['西风暴击须本人在场；优先循环再双暴攻击。']), '西风剑', 61.3),
    fav(b('reaction', '反应触发 · 全精通减抗', [['energyRecharge', 'elementalMastery'], ['elementalMastery'], ['elementalMastery']], { elementalMastery: 1, energyRecharge: 1.1, critRate: .25 }, [180, 200, '零命西风单风一E每轮Q；以染雷触发超绽放等实际反应归属为前提。'], [vv, emPair], ['普通扩散、超绽放不吃双暴；与直伤模板分开。']), '西风剑', 61.3),
  ], 0, 0, 'https://keqingmains.com/q/lynette-quickguide/'),
  p('freminet', '菲米尼', '4.0', 4, '冰', '双手剑', '物理战技 / 冰伤战技站场', [
    b('physical', '零命物理 · 双冰超导', [['atkPercent', 'energyRecharge'], ['physicalDmgBonus'], [...crit]], { ...atk, energyRecharge: 1 }, [130, 180, '零命双冰、每轮Q，试作古华等非回能武器；单冰150–200%，二命显著降低需求。'], [four('pale-flame', '持续战技维持四件层数。'), pair('pale-flame', 'bloodstained-chivalry', '物伤二件套过渡。')], ['优先超导并适当碎冰触发天赋；精通不是物理主输出词条。']),
    b('cryo', '零命冰伤 · 双冰连续战技', [['atkPercent', 'energyRecharge'], ['cryoDmgBonus'], [...crit]], { ...atk, energyRecharge: .85 }, [110, 150, '零命双冰、每轮Q及高频低阶战技；不能套用二命回能。'], [four('golden-troupe', '主要输出为战技，站场仅按可获得的战技增伤计算。'), four('blizzard-strayer', '能够维持冰附着；冻结额外暴率不适用于不可冻结敌人。', '替代')], ['冰伤与物理连段不同，需切换杯、套装和充能目标。']),
  ], 0, 0, 'https://keqingmains.com/q/freminet-quickguide/'),
  p('wriothesley', '莱欧斯利', '4.1', 5, '冰', '法器', '站场星超导 / 冰伤融化', [
    b('stellar', '星超导 · 不开爆发', [['atkPercent', 'elementalMastery'], ['atkPercent', 'elementalMastery'], [...crit]], { ...atk, elementalMastery: .55, energyRecharge: 0 }, [100, 100, '已完成魔女课业并有奥黛塔/冰旅行者等启用极星领域；星超导玩法跳过Q。'], [four('disenchantment-in-deep-shadow', '完成星超导触发，16%条件暴击。'), four('zhuying-lieren', '自身生命变化触发36%暴击；优秀旧装可以保留。', '替代'), four('gilded-dreams', '缺专用套时精通与攻击过渡。', '过渡')], ['星超导主伤害不吃冰伤杯。沙杯可择一精通，不默认双精通。', '零命常见流浪乐章/纯水流华；过量治疗会影响低血强化重击。']),
    b('melt', '传统反向融化', [['atkPercent', 'elementalMastery'], ['cryoDmgBonus'], [...crit]], { ...atk, elementalMastery: .65, energyRecharge: .15 }, [100, 125, '零命单冰隔轮Q；双冰约100–115%，不追每轮Q的220%以上。'], [four('zhuying-lieren', '自身生命变化维持满层。'), pair('blizzard-strayer', 'gladiators-finale', '冰伤攻击过渡。')], ['本人稳定融化时精通才有明显价值；传统玩法零命应关注治疗与战技血量门槛。']),
    b('freeze', '传统冻结 / 纯冰', [['atkPercent'], ['cryoDmgBonus'], [...crit]], { ...atk, energyRecharge: .1 }, [100, 115, '零命双冰隔轮Q、常见非回能法器。'], [four('zhuying-lieren', '自身耗血与回血，36%条件暴击。'), four('blizzard-strayer', '可靠冰附着和可冻结敌人，需注意暴率溢出。', '替代')], ['没有融化归属时不为精通打高分。']),
  ], 0, 0, 'https://keqingmains.com/q/wriothesley-quickguide/'),
  p('charlotte', '夏洛蒂', '4.2', 4, '冰', '法器', '攻击倍率全队治疗', [
    { ...b('healing', '零命金珀 · 单冰全队治疗', [['energyRecharge', 'atkPercent'], ['atkPercent'], ['healingBonus', 'atkPercent']], { ...supportAtk, critRate: .05 }, [185, 205, 'R5试作金珀、单冰每轮Q；双冰约160%，非回能武器单冰230%以上。四命回能不默认拥有。'], [four('noblesse-oblige', '攻击倍率队友且无人持宗室。'), pair('emblem-of-severed-fate', 'gladiators-finale', '不吃加攻的那维莱特等队伍，充能攻击过渡。', '替代'), four('tenacity-of-the-millelith', '长按战技持续命中，队伍吃加攻。', '替代')], ['治疗按攻击而不是生命；金珀的生命副属性不改变此机制。']), assumedWeapon: { name: '90级R5试作金珀（回能不等于面板充能）', energyRecharge: 0, critRate: 0 } },
  ], 0, 0, 'https://keqingmains.com/q/charlotte-quickguide/'),
  p('navia', '娜维娅', '4.3', 5, '岩', '双手剑', '结晶弹片战技站场', [
    b('skill', '双岩 · 每轮爆发战技输出', [['atkPercent', 'energyRecharge'], ['geoDmgBonus'], [...crit]], { ...atk, energyRecharge: .9 }, [130, 150, '零命浪影阔剑等常见非回能武器，千织/卡齐娜/钟离等双岩、按合理西风触发；希诺宁双岩约100–130%。'], [four('nighttime-whispers-in-the-echoing-woods', '拾取并维持结晶盾，盾破损会降低部分增益。'), hunter, pair('archaic-petra', 'gladiators-finale', '岩伤攻击二件套过渡。')], ['岩伤按攻击，不堆防御。Q提供弹片与结晶，不应只看大招自身伤害而忽略循环。']),
  ], 0, 0, 'https://keqingmains.com/q/navia-quickguide/'),
  p('chevreuse', '夏沃蕾', '4.3', 4, '火', '长柄武器', '火雷超载减抗 / 生命治疗', [
    b('support', '火雷纯辅助 · 按需爆发', [['hpPercent'], ['hpPercent'], ['hpPercent', 'healingBonus']], { hpPercent: 1, hpFlat: .25 }, noEr, [four('scroll-of-the-hero-of-cinder-city', '本人触发超载提供12%增伤；非夜魂角色不能获得40%，队内已有绘卷则另选。'), hpPair, four('xishi-zhige', '六命治疗提高后且队伍已有其他辅助套才考虑；零命不默认封顶。', '替代'), four('noblesse-oblige', '愿意每轮Q且队伍没有宗室，需改配充能。', '替代')], ['零命黑缨枪/沙中伟贤的对答；40000生命封顶一项加攻，更多生命仍增加治疗。', '减抗被动要求全队仅火雷且两种元素均存在；不把超载队等同本人堆精通。']),
    b('burst', '每轮Q宗室辅助', [['energyRecharge', 'hpPercent'], ['hpPercent'], ['hpPercent', 'healingBonus']], { hpPercent: 1, hpFlat: .25, energyRecharge: 1.1 }, [175, 205, '零命非雷电站场、非回能武器每轮Q；雷电站场约105–135%，回能武器需下调。'], [four('noblesse-oblige', '每轮开大且无人持宗室。'), four('scroll-of-the-hero-of-cinder-city', '已有宗室且本人触发超载，仅12%增伤。', '替代')], ['区别于战技辅助；先满足充能再追生命。']),
  ], 0, 0, 'https://keqingmains.com/q/chevreuse-quickguide/'),
  p('xianyun', '闲云', '4.4', 5, '风', '法器', '攻击倍率治疗 / 下落攻击增益', [
    fav(b('support', '单风西风 · 下落治疗辅助', [['energyRecharge', 'atkPercent'], ['atkPercent'], ['atkPercent', 'healingBonus', 'critRate']], supportAtk, [220, 260, '零命单风每轮Q、常见非专武；原攻略无回能单风220–300%，西风触发和吃球可降低。'], [vv, four('xishi-zhige', '魈等不吃风套减抗的下落队，治疗触发团队增益。', '替代'), pair('emblem-of-severed-fate', 'gladiators-finale', '充能与攻击过渡。')], ['治疗与下落增益都按攻击，不用全精通模板。4500攻击只封顶被动一项。', '魈+六命珐露珊约120–130%；不能拿三风低需求套用单风。']), '西风秘典', 45.9),
  ], 0, 0, 'https://keqingmains.com/q/xianyun-quickguide/'),
  p('gaming', '嘉明', '4.4', 4, '火', '双手剑', '下落攻击蒸发 / 融化', [
    b('vape', '零命班尼特 · 蒸发下落', [['elementalMastery', 'atkPercent', 'energyRecharge'], ['pyroDmgBonus'], [...crit]], { ...atk, elementalMastery: .85, energyRecharge: 1 }, [125, 145, '零至三命、班尼特蒸发队、常见雨裁等非回能武器；四命同队约100–110%。'], [four('crimson-witch-of-flames', '连续多次战技下落叠层、本人触发蒸发。'), four('zhuying-lieren', '自身耗血与回血；六命或暴率武器容易暴率溢出。', '替代'), four('long-nights-oath', '下落攻击套装，可作为五星替代。', '替代')], ['每轮Q很关键；雨裁已有精通时攻击沙竞争力上升。']),
    b('melt', '零命班尼特 · 融化下落', [['elementalMastery', 'atkPercent', 'energyRecharge'], ['pyroDmgBonus'], [...crit]], { ...atk, elementalMastery: .9, energyRecharge: 1 }, [170, 180, '零至三命班尼特融化队；四命约130–135%，不能沿用蒸发队较低充能。'], [four('crimson-witch-of-flames', '稳定本人融化且持续战技叠层。'), hunter], ['融化需要调整下落节奏保证冰底；不是所有下落都默认触发融化。']),
  ], 0, 0, 'https://keqingmains.com/q/gaming-quickguide/'),
  p('chiori', '千织', '4.5', 5, '岩', '单手剑', '防御为主的后台战技输出', [
    b('offfield', '零命后台 · 按需爆发', [['defPercent'], ['geoDmgBonus', 'defPercent'], [...crit]], { ...def, atkPercent: .2, atkFlat: .05, energyRecharge: .05 }, noEr, [four('golden-troupe', '长期后台，主要战技与人偶输出。'), four('husk-of-opulent-dreams', '防御岩伤，可保留优秀旧装。', '替代'), pair('husk-of-opulent-dreams', 'golden-troupe', '防御与战技二件套过渡。')], ['零命黎明神剑须维持高血，其条件暴率另计；也可用辰砂之纺锤等。', '零命需要岩造物召第二人偶；防御比攻击收益更高，不强求每轮Q。']),
  ], 19.2, 0, 'https://keqingmains.com/q/chiori-quickguide/'),
  p('clorinde', '克洛琳德', '4.7', 5, '雷', '单手剑', '生命之契站场雷伤 / 激化', [
    b('aggravate', '激化 / 常规站场雷伤', [['atkPercent'], ['electroDmgBonus'], [...crit]], { ...atk, elementalMastery: .3, energyRecharge: .55 }, [120, 140, '零命双雷、海渊终曲等非回能剑；Q可视循环调整，不能假定所有队伍都相同。'], [four('fragment-of-harmonic-whimsy', '生命之契变化维持增伤。'), four('thundering-fury', '队伍反应触发能实际缩短战技冷却并延长输出。', '替代'), four('gladiators-finale', '优秀旧装可作过渡。', '过渡')], ['突破19.2%加天赋20%条件暴率，要预留空间。', '激化精通有用但通常不如攻击；纯超载本人归属较少，不默认高精通权重。']),
    b('quickbloom', '零命激绽 / 燃激化', [['atkPercent', 'elementalMastery'], ['electroDmgBonus'], [...crit]], { ...atk, elementalMastery: .65, energyRecharge: .5 }, [120, 140, '零命双雷参考，常见非回能剑；本人有稳定超绽放或超载归属。'], [four('fragment-of-harmonic-whimsy', '维持生命之契变化。'), four('thundering-fury', '确实利用减冷却延长输出窗口。', '替代')], ['仅有草队友不等于精通沙必优；二命及加攻、精通增益会改变比较。']),
  ], 19.2, 0, 'https://keqingmains.com/q/clorinde-quickguide/'),
  p('sethos', '赛索斯', '4.7', 4, '雷', '弓', '精通倍率激化 / 重击输出', [
    b('burst', '菲谢尔双雷 · 爆发普攻', [['elementalMastery', 'energyRecharge'], ['electroDmgBonus'], [...crit]], { ...em, atkPercent: .2, energyRecharge: .75 }, [100, 110, '零命弹弓等非回能弓、菲谢尔双雷，每轮Q；其他双雷一E约130–160%，两E100–120%。'], [four('wanderers-troupe', '强化普攻实际视为重击伤害。'), four('gilded-dreams', '激化反应、精通与攻击均有收益。', '替代')], ['精通沙优先，不能按普通攻击倍率弓手配置。弹弓31.2%暴率须计入面板。']),
    b('charged', '菲谢尔双雷 · 蓄力重击', [['elementalMastery', 'energyRecharge'], ['electroDmgBonus'], [...crit]], { ...em, atkPercent: .2, energyRecharge: 1 }, [140, 150, '零命菲谢尔双雷、一E四次蓄力；两E约100–110%，其他双雷一E220–270%，减少蓄力次数会降低需求。'], [four('wanderers-troupe', '重击主输出。'), four('gilded-dreams', '缺少优秀乐团套时。', '替代')], ['蓄力会消耗能量，即使不放Q，充能也不能一律计零。']),
  ], 0, 0, 'https://keqingmains.com/q/sethos-quickguide/'),
  p('sigewinne', '希格雯', '4.7', 5, '水', '弓', '生命治疗 / 后台战技增益', [
    b('healing', '战技治疗增益 · 不强求Q', [['hpPercent'], ['hpPercent'], ['hpPercent', 'healingBonus']], { hpPercent: 1, hpFlat: .25 }, noEr, [four('ocean-hued-clam', '稳定全队治疗累计泡沫伤害。'), four('xishi-zhige', '团队有效消费治疗记录增益。', '替代'), hpPair], ['零命反曲弓等生命武器；65000生命封顶后台战技附加倍率，治疗仍可受生命提升。', 'Q不治疗且占场，不把每轮Q当治疗辅助必要条件。']),
    b('burst', '双水速切爆发输出', [['hpPercent', 'energyRecharge'], ['hpPercent', 'hydroDmgBonus'], ['hpPercent', ...crit]], { ...hp, hpPercent: 1, energyRecharge: .85 }, [155, 190, '零命反曲弓等非回能弓、双水一E每轮Q且自己吃球；喂球队友约175–220%，西风和额外回能另调。'], [four('ocean-hued-clam', '零命仍兼顾大量治疗，往往优于绝缘的总伤害。'), four('emblem-of-severed-fate', '只追本人爆发，兼顾相应充能；不是零命全队伤害最优保证。', '替代')], ['生命主词条仍兼顾治疗、个人伤害与增益；不把零命当六命双暴爆发C。']),
  ], 0, 0, 'https://keqingmains.com/q/sigewinne-quickguide/'),
  p('emilie', '艾梅莉埃', '4.8', 5, '草', '长柄武器', '燃烧条件后台草伤', [
    b('burning', '燃烧后台 · 隔轮爆发', [['atkPercent'], ['dendroDmgBonus'], [...crit]], { ...atk, energyRecharge: .2, elementalMastery: 0 }, [100, 120, '零命风信之锋等非专武，通常隔轮Q；每轮Q需求更高，专武回能不能默认。'], [four('unfinished-reverie', '附近持续存在燃烧敌人，主要为草直伤。'), four('deepwood-memories', '队伍无人减草抗，尤其与其他草输出同队。', '替代'), pair('deepwood-memories', 'gladiators-finale', '草伤攻击过渡。')], ['虽然依赖燃烧，但本人主要是攻击倍率草直伤，不以精通打高分。']),
  ], 0, 0, 'https://keqingmains.com/q/emilie-quickguide/'),
  p('mualani', '玛拉妮', '5.0', 5, '水', '法器', '生命倍率前台蒸发', [
    b('vape', '蒸发鲨鱼撕咬 · 按需Q', [['hpPercent', 'elementalMastery'], ['hydroDmgBonus', 'hpPercent'], ['critDamage', 'critRate', 'hpPercent']], { ...hp, elementalMastery: .65, energyRecharge: 0 }, noEr, [codex, pair('heart-of-depth', 'tenacity-of-the-millelith', '水伤生命过渡。')], ['零命木棉之环/流浪乐章等常见法器；生命与蒸发精通都重要，攻击不提升主伤害。', '突破19.2%与黑曜40%暴率相加，暴率武器尤其易溢出；不为Q牺牲有效词条。']),
  ], 19.2, 0, 'https://keqingmains.com/q/mualani-quickguide/'),
  p('kinich', '基尼奇', '5.0', 5, '草', '双手剑', '燃烧 / 烈绽放条件战技草伤', [
    b('burning', '燃烧战技 · 隔轮Q', [['atkPercent'], ['dendroDmgBonus'], [...crit]], { ...atk, energyRecharge: .2, elementalMastery: .05 }, [100, 120, '零命撼地者等非回能武器、单草隔轮Q，含至少一次队友西风；双草100–110%。'], [codex, four('unfinished-reverie', '稳定燃烧且旧装优秀，暴率武器时更易配平。', '替代'), pair('golden-troupe', 'gladiators-finale', '战技攻击过渡。')], ['主要按攻击和双暴成长，不因燃烧就堆全精通。每轮Q单草约200–245%，通常不值得硬追。']),
  ], 0, 0, 'https://keqingmains.com/q/kinich-quickguide/'),
  p('kachina', '卡齐娜', '5.0', 4, '岩', '长柄武器', '绘卷结晶辅助 / 防御岩伤', [
    fav(b('support', '西风绘卷 · 不强求爆发', [['defPercent'], ['geoDmgBonus', 'defPercent'], ['critRate', 'critDamage']], { ...def, critRate: 1, energyRecharge: .05 }, noEr, [scroll, four('tenacity-of-the-millelith', '队内已有绘卷，且队友吃攻击、持续战技能命中。', '替代'), pair('husk-of-opulent-dreams', 'archaic-petra', '仅防御岩伤过渡，团队增益较弱。')], ['零命E即可触发绘卷，不需要为Q强堆充能。', '如需双岩每轮Q，西风约165–195%；单岩20秒循环可210–285%，不能用低充能模板。']), '西风长枪', 30.6),
  ], 0, 0, 'https://keqingmains.com/q/kachina-quickguide/'),
  p('xilonen', '希诺宁', '5.1', 5, '岩', '单手剑', '减抗 / 防御倍率治疗', [
    fav(b('support', '西风减抗治疗 · 单岩一E', [['defPercent', 'energyRecharge'], ['defPercent'], ['healingBonus', 'defPercent', 'critRate']], { defPercent: .8, defFlat: .2, energyRecharge: 1, critRate: .6 }, [140, 160, '零命单岩一E且自己吃球、西风触发，每轮Q治疗；非回能剑约170–190%，喂球给队友还更高。'], [scroll, four('archaic-petra', '队友已有绘卷，能本人拾取所需结晶。', '替代'), pair('husk-of-opulent-dreams', 'emblem-of-severed-fate', '防御充能过渡。')], ['两名以上火水雷冰队友才能使用常规辅助治疗模式。', '减抗不依赖防御；3200防御是专武增益上限，不是零命西风强制目标。']), '西风剑', 61.3),
    b('damage', '纯岩站场 · 防御岩伤', [['defPercent'], ['geoDmgBonus', 'defPercent'], [...crit]], { ...def, energyRecharge: .25 }, [100, 120, '零命纯岩/少于两名火水雷冰队友、息燧之笛，Q按需使用。'], [codex, four('husk-of-opulent-dreams', '防御岩伤旧装。', '替代')], ['此模式不提供常规Q治疗，不能与辅助模式混算收益。']),
  ], 0, 0, 'https://keqingmains.com/q/xilonen-quickguide/'),
  p('chasca', '恰斯卡', '5.2', 5, '风', '弓', '多元素转化重击站场', [
    b('charged', '零命三元素 · 转化弹输出', [['atkPercent'], ['atkPercent'], [...crit]], { ...atk, elementalMastery: .25, energyRecharge: .1 }, noEr, [codex, hunter, four('shimenawas-reminiscence', '放弃Q、每次战技有足够能量支付扣除。', '替代'), atkPair], ['零命缀花之翎/锻造弓，通常三名不同火水雷冰队友。', '主要伤害不全是风伤，优先攻击杯；精通沙杯通常不如攻击。Q有能量才放。']),
  ], 19.2, 0, 'https://keqingmains.com/q/chasca-quickguide/'),
  p('ororon', '欧洛伦', '5.2', 4, '雷', '弓', '后台感电 / 绘卷辅助', [
    b('offfield', '单雷感电 · 一E爆发循环', [['energyRecharge', 'atkPercent'], ['electroDmgBonus', 'atkPercent'], [...crit]], { ...atk, energyRecharge: 1, elementalMastery: .25 }, [160, 195, '零命单雷、非回能弓、一E每轮Q，含一次绘卷二件回能；双雷约100–120%，两E单雷100–120%。'], [scroll, four('golden-troupe', '队内已有绘卷，按实际战技伤害占比选择。', '替代'), pair('thundering-fury', 'gladiators-finale', '雷伤攻击过渡。')], ['战技/天赋感电与挂雷需要实战触发，不套纯精通模板。月感电队精通价值会上升。']),
    b('overload', '本人主触发 · 超载精通', [['elementalMastery', 'energyRecharge'], ['elementalMastery'], ['elementalMastery']], { elementalMastery: 1, energyRecharge: .9 }, [160, 195, '零命单雷一E每轮Q，反应归属需由队伍保证；第二雷或西风降低需求。'], [scroll, four('gilded-dreams', '已有绘卷且本人稳定触发大量超载。', '替代'), emPair], ['仅本人反应归属高才使用；普通感电/直伤玩法不要照抄。']),
  ], 0, 0, 'https://keqingmains.com/q/ororon-quickguide/'),
  p('mavuika', '玛薇卡', '5.3', 5, '火', '双手剑', '战意爆发站场 / 后台火伤', [
    b('vape', '蒸发 / 融化 · 战意站场', [['elementalMastery', 'atkPercent'], ['pyroDmgBonus'], [...crit]], { ...atk, elementalMastery: .8, energyRecharge: 0 }, [100, 100, 'Q消耗战意而不是元素能量；充能效率不加快战意获取。'], [codex, hunter, four('gilded-dreams', '本人蒸发/融化、尚缺黑曜时过渡。', '过渡')], ['零命撼地者等常见武器；需要队友消耗夜魂或普攻积累战意。', '稳定增幅反应时精通沙常有优势；不是所有队伍都默认精通。']),
    b('offfield', '后台战技 / 不蒸发直伤', [['atkPercent'], ['pyroDmgBonus'], [...crit]], { ...atk, elementalMastery: .1, energyRecharge: 0 }, [100, 100, '战意机制不受充能效率影响；后台Q按队伍战意条件决定。'], [scroll, four('golden-troupe', '队友已有绘卷，后台战技伤害占比高。', '替代'), four('deepwood-memories', '基尼奇/艾梅莉埃队缺少深林持有者。', '替代')], ['后台不能稳定触发黑曜前台条件。以本人实际反应归属决定精通，不虚构ER需求。']),
  ], 0, 0, 'https://keqingmains.com/q/mavuika-quickguide/'),
  p('citlali', '茜特菈莉', '5.3', 5, '冰', '法器', '精通护盾 / 火水减抗', [
    b('shield', '零命讨龙 · 精通盾辅', [['elementalMastery', 'energyRecharge'], ['elementalMastery'], ['elementalMastery']], { ...supportEm, critRate: .05 }, [170, 195, '零命单冰、讨龙等非回能法器、绘卷、一次队友西风、每轮Q；双冰170–185%，希诺宁+另一纳塔角色约145–150%。'], [scroll, four('tenacity-of-the-millelith', '队友已有绘卷，E持续命中且队友吃加攻。', '替代'), emPair], ['护盾按精通；不是生命冰盾模板。Q给夜魂并维持后台冰。', '仅战技、不需要后台挂冰时可不堆充能；西风法器和金珀需要另调目标。']),
  ], 0, 0, 'https://keqingmains.com/q/citlali-quickguide/'),
  p('lan-yan', '蓝砚', '5.3', 4, '风', '法器', '攻击护盾 / 扩散驾驶', [
    b('shield', '零命讨龙 · 攻击护盾', [['atkPercent'], ['atkPercent'], ['atkPercent']], { atkPercent: 1, atkFlat: .3 }, noEr, [vv, four('scroll-of-the-hero-of-cinder-city', '风C队扩散触发12%增伤；蓝砚没有夜魂，不能得到40%。', '替代'), atkPair], ['零命讨龙英杰谭/锻造攻击法器；盾量按攻击而非精通生命。', '通常不强求每轮Q；二命盾刷新不默认拥有。']),
    b('driver', '站场反应驾驶 · 精通减抗', [['elementalMastery', 'energyRecharge'], ['elementalMastery'], ['elementalMastery']], { elementalMastery: 1, atkPercent: .2, energyRecharge: .2 }, noEr, [vv, emPair], ['零命祭礼残章等精通武器，Q有能量才用；想每轮聚怪需另算充能。', '全精通减少盾量，零命生存不足时可换一件攻击主词条。']),
  ], 0, 0, 'https://keqingmains.com/q/lan-yan-quickguide/'),
  p('mizuki', '梦见月瑞希', '5.4', 5, '风', '法器', '站场扩散 / 星扩散输出', [
    b('stellar', '星扩散 · 精精双暴', [['elementalMastery'], ['elementalMastery'], [...crit, 'elementalMastery']], { ...em, elementalMastery: 1, energyRecharge: .05 }, noEr, [four('gilded-dreams', '星扩散能暴击，完成魔女课业且队友启用极星领域。'), emPair, four('scarlet-proof', '实际触发星扩散，缺少好饰金/二精通时。', '替代')], ['零命祭礼残章等精通武器；星扩散优先双暴冠，不能沿用普通扩散不能暴击的规则。', 'Q救急/有就开，不专门堆ER；不为双精通换成攻击或风伤杯。']),
    b('swirl', '普通扩散 / 精通治疗', [['elementalMastery', 'energyRecharge'], ['elementalMastery'], ['elementalMastery']], { elementalMastery: 1, energyRecharge: .4 }, [100, 130, '零命非回能法器、隔轮或按需Q；每轮Q通常200%以上，不作为默认目标。'], [vv, emPair], ['普通扩散不暴击，全精通；治疗与反应都受精通影响。', '战技自动攻击无法触发行秋夜兰等依赖普攻输入的协同。']),
  ], 0, 0, 'https://keqingmains.com/q/mizuki-quickguide/'),
  p('varesa', '瓦雷莎', '5.5', 5, '雷', '法器', '下落攻击 / 低耗爆发站场', [
    b('plunge', '双雷 · 每轮两次特殊爆发', [['atkPercent'], ['electroDmgBonus', 'atkPercent'], [...crit]], { ...atk, energyRecharge: .7 }, [120, 145, '零命流浪乐章等常见武器，伊安珊/欧洛伦双雷并含队友西风；菲谢尔双雷约115–120%。'], [four('long-nights-oath', '连续下落与战技维持增益层数。'), codex, atkPair], ['只进行一次特殊Q时可约100%；不值得为单雷两Q硬堆195–200%。', '不依赖激化，默认不追精通；黑曜与高暴率法器注意溢出。']),
    b('solo', '单雷 · 特殊Q有就开', [['atkPercent'], ['electroDmgBonus', 'atkPercent'], [...crit]], { ...atk, energyRecharge: .05 }, [100, 105, '零命单雷，仅有能量时接特殊Q，不以两次特殊Q为每轮硬目标。'], [four('long-nights-oath', '下落攻击主输出。'), codex], ['牺牲充能换攻击双暴，连段按实际能量调整。']),
  ], 19.2, 0, 'https://keqingmains.com/q/varesa-quickguide/'),
  p('iansan', '伊安珊', '5.5', 4, '雷', '长柄武器', '攻击转化增益 / 移动续夜魂', [
    fav(b('support', '零命单雷西风 · 加攻辅助', [['energyRecharge', 'atkPercent'], ['atkPercent'], ['atkPercent', 'critRate']], supportAtk, [180, 210, '零命单雷、西风长枪、绘卷二件回能每轮Q；双雷短于20秒约135–155%，超过24秒约100–105%。'], [scroll, four('noblesse-oblige', '队友已有绘卷或主输出风岩无法触发所需绘卷元素。', '替代'), pair('emblem-of-severed-fate', 'gladiators-finale', '充能攻击过渡。')], ['爆发循环优先，再攻击与西风暴率；不追暴伤。', '主C移动与夜魂机制会影响加攻覆盖，一命回能不默认拥有。']), '西风长枪', 30.6),
  ], 0, 0, 'https://keqingmains.com/q/iansan-quickguide/'),
  p('escoffier', '爱可菲', '5.6', 5, '冰', '长柄武器', '后台战技冰伤 / 攻击治疗减抗', [
    b('offfield', '双冰 · 每轮Q治疗输出', [['atkPercent', 'energyRecharge'], ['cryoDmgBonus', 'atkPercent'], [...crit]], { ...atk, energyRecharge: .95 }, [130, 165, '零命常见非回能长枪、普通双冰队每轮Q；丝柯克双冰约185–200%，三冰约155–175%。'], [four('golden-troupe', '主要后台战技伤害。'), four('tenacity-of-the-millelith', '攻击输出队缺加攻套，持续战技触发。', '替代'), four('scroll-of-the-hero-of-cinder-city', '冰水反应，非夜魂角色只提供12%而非40%。', '替代')], ['治疗按攻击，但主流仍是攻击冰伤双暴；不因治疗身份全堆生命。', '55%减抗需要全队仅冰水；突破暴率、双冰附着暴率和武器需一并检查。']),
    b('healing', '高治疗需求 · 丝柯克双冰', [['energyRecharge', 'atkPercent'], ['atkPercent'], ['healingBonus', 'atkPercent', 'critRate']], { ...supportAtk, critRate: .45 }, [185, 200, '零命丝柯克双冰、常见非回能武器、每轮Q治疗；西风触发可降需求。'], [four('golden-troupe', '保留后台伤害。'), four('noblesse-oblige', '主C吃攻击、每轮Q且无人持宗室。', '替代')], ['仅需要额外治疗时用治疗冠；循环优先。']),
  ], 19.2, 0, 'https://keqingmains.com/q/escoffier-quickguide/'),
  p('ifa', '伊法', '5.6', 4, '风', '法器', '精通治疗 / 感电扩散驾驶', [
    b('swirl', '零命扩散治疗 · 隔轮Q', [['elementalMastery'], ['elementalMastery'], ['elementalMastery', 'healingBonus']], { elementalMastery: 1, energyRecharge: .1, critRate: .1 }, noEr, [vv, four('scroll-of-the-hero-of-cinder-city', '队内已有风套，且本人能扩散触发完整夜魂增伤。', '替代'), emPair], ['零命祭礼残章等精通法器；治疗按精通，可换治疗冠但降低反应伤害。', '常见感电队单风20–22秒每轮Q约160–195%，25秒约135–150%；不强求每轮聚怪。']),
    b('damage', '单体直伤 / 月感电双暴', [['atkPercent'], ['anemoDmgBonus', 'atkPercent'], [...crit]], { ...atk, elementalMastery: .35, energyRecharge: .5 }, [100, 150, '零命常见非回能法器；需求低于150%可每轮Q，高于则改隔轮，风伤杯仅服务天赋直伤。'], [vv, codex], ['当队友已持风套，可用黑曜追个人伤害。月感电占比高时攻击杯更合适，需按队伍调整。']),
  ], 0, 0, 'https://keqingmains.com/q/ifa-quickguide/'),
  p('skirk', '丝柯克', '5.7', 5, '冰', '单手剑', '蛇之狡谋站场 / 速切爆发', [
    b('onfield', '冰水站场 · 普攻输出', [['atkPercent'], ['cryoDmgBonus', 'atkPercent'], [...crit, 'atkPercent']], { ...atk, energyRecharge: 0 }, [100, 100, 'Q消耗蛇之狡谋而非元素能量；充能效率完全不影响该资源。'], [four('shenlang-zhongqu', '普通/爆发伤害模式下避免重击关闭相关套装增益。'), hunter, four('blizzard-strayer', '可冻结目标且持续冰附着；BOSS不默认额外冻结暴率。', '替代')], ['零命海渊终曲需治疗清除生命之契；厄水之祸需护盾，条件暴率另计。', '通常全队冰水，双冰、逐影或武器都可增加暴率，注意溢出。']),
    b('quickswap', '冰水速切 · 重爆发 / 分段轴', [['atkPercent'], ['cryoDmgBonus', 'atkPercent'], [...crit]], { ...atk, energyRecharge: 0 }, [100, 100, '蛇之狡谋机制，不使用能量、不堆ER。'], [four('shenlang-zhongqu', '速切爆发或分段轴优先，不能把逐影前台叠层当作始终满层。'), pair('blizzard-strayer', 'noblesse-oblige', '冰伤与爆发增伤过渡。')], ['零命海渊终曲等常见武器；与纯站场普攻轴的套装排序不同。']),
  ], 0, 0, 'https://keqingmains.com/q/skirk-quickguide/'),
  p('dahlia', '塔利雅', '5.7', 4, '水', '单手剑', '生命护盾 / 普攻攻速辅助', [
    fav(b('shield', '零命单水西风 · 护盾攻速', [['energyRecharge', 'hpPercent'], ['hpPercent'], ['hpPercent', 'critRate']], { hpPercent: 1, hpFlat: .25, energyRecharge: 1.1, critRate: .5 }, [195, 225, '零命单水一E、西风触发每轮Q；原无西风240–270%，一次西风降约45–60点。双水一E需求更低，两E约100–125%（无西风）。'], [four('noblesse-oblige', '攻击倍率主C且无人持宗室。'), four('scroll-of-the-hero-of-cinder-city', '非攻击倍率队/已有宗室，仅非夜魂12%元素增伤。', '替代'), hpPair], ['盾与攻速按生命；一命回能和六命额外攻速不默认拥有。', '西风暴率与生命冠取舍，不能只堆生命忽略Q循环。']), '西风剑', 61.3),
  ], 0, 0, 'https://keqingmains.com/q/dahlia-quickguide/'),
  p('ineffa', '伊涅芙', '5.8', 5, '雷', '长柄武器', '后台月感电 / 攻击护盾', [
    b('lunar', '双雷每轮Q · 月感电输出', [['atkPercent', 'energyRecharge'], ['atkPercent', 'elementalMastery'], [...crit]], { ...atk, atkPercent: .85, elementalMastery: .45, energyRecharge: .9 }, [140, 160, '零命勘探钻机等非回能武器、双雷、两次队友西风；菲谢尔/八重25秒或雷电双雷约100–125%。'], [four('aubade-of-morningstar-and-moon', '长期后台且辉月队伍，月感电个人输出。'), four('silken-moons-serenade', '队内缺纺月且本人能稳定触发，避免重复。', '替代'), four('gilded-dreams', '缺晓歌或无第二月兆队友时过渡。', '过渡'), pair('gladiators-finale', 'gilded-dreams', '攻击精通二件套过渡。')], ['月感电不吃雷伤杯；2000攻击封顶部分基础增益，但攻击还提升护盾、精通转化和本人伤害。', '原指南每轮Q单雷185–205%（含两西风）；隔轮Q单雷120–135%、双雷100%。']),
    b('hyperbloom', '超绽放 / 本人超载触发', [['elementalMastery'], ['elementalMastery'], ['elementalMastery']], { elementalMastery: 1, atkPercent: .15 }, noEr, [four('flower-of-paradise-lost', '本人触发超绽放时使用；不增超载。'), four('gilded-dreams', '本人稳定触发超绽放或超载。', '替代'), emPair], ['零命喜多院十文字等精通武器；这种反应不暴击，不能沿用月感电双暴。', '全精通削弱攻击护盾和部分月感电收益，必须有足够反应归属。']),
  ], 0, 0, 'https://keqingmains.com/q/ineffa-quickguide/'),
]

// One Traveler selection, independent elemental equipment targets. Audited game tables contain
// Cryo depots 505/705 and the released 聚冰成锋 talent; KQM published both Cryo infographics in 7.0.
const traveler = p('traveler', '旅行者', '1.0', 5, '多', '单手剑', '七元素切换 / 挂元素与团队辅助', [
  { ...fav(b('anemo', '风 · 扩散减抗辅助', [['energyRecharge', 'elementalMastery'], ['elementalMastery'], ['elementalMastery', 'critRate']], { elementalMastery: 1, energyRecharge: 1, critRate: .3 }, [160, 180, '零命风主西风剑、每轮Q的一般参考；次数、吃球、命座回能等按队伍调整。'], [vv, emPair], ['普通扩散不吃双暴；西风暴率另需兼顾。C2额外16%充能不是零命固有面板。']), '西风剑', 61.3), element: '风' },
  { ...b('geo', '岩 · 速切输出 / 暴率辅助', [['atkPercent', 'energyRecharge'], ['geoDmgBonus'], [...crit]], { ...atk, energyRecharge: .65 }, [130, 150, '零命常见非回能剑、速切自己吃球；将球喂队友的辅助可需约200%。'], [four('noblesse-oblige', '每轮Q且队内无人持宗室。'), pair('archaic-petra', 'noblesse-oblige', '岩伤爆发过渡。'), atkPair], ['岩主按攻击而不是防御；一命领域10%暴率是条件队伍增益，零命不默认。']), element: '岩' },
  { ...fav(b('electro', '雷 · 双雷充能辅助', [['energyRecharge'], ['atkPercent', 'electroDmgBonus'], ['critRate']], { energyRecharge: 1, critRate: .45, atkPercent: .15 }, [170, 200, '零命双雷、雷主让队友拾取勾玉，每轮Q；自己吃三枚勾玉可降低，但会减少队友回能。'], [four('noblesse-oblige', '每轮爆发且主C吃加攻。'), four('emblem-of-severed-fate', '偏重本人爆发、队伍已有宗室。', '替代'), pair('emblem-of-severed-fate', 'noblesse-oblige', '充能爆发五星过渡。')], ['零命西风剑；指南流放者是四星，本工具只给五星替代。', '充能也影响部分回能辅助；单雷不拾勾玉常难以实现循环。']), '西风剑', 61.3), element: '雷' },
  { ...fav(b('dendro', '草 · 单草挂草深林辅助', [['energyRecharge', 'atkPercent'], ['dendroDmgBonus'], ['critRate', 'critDamage']], { ...atk, energyRecharge: 1.2, elementalMastery: .2 }, [200, 250, '零命单草每轮两E、自己吃球；指南未额外计西风时的起点，一次西风可降低15–30点；一E单草250–300%。'], [four('deepwood-memories', '草伤/绽放队伍优先减草抗。'), four('noblesse-oblige', '激化队仅负责挂草，队内有其他深林且主C吃攻击。', '替代'), pair('emblem-of-severed-fate', 'deepwood-memories', '充能草伤过渡，不能提供深林4减抗。')], ['超绽放通常由雷角色触发，草主不因此全精通。妮露纯绽放本人高归属则需另配精通。']), '西风剑', 61.3), element: '草' },
  { ...b('hydro', '水 · 战技直伤 / 蒸发', [['atkPercent', 'elementalMastery'], ['hydroDmgBonus'], [...crit]], { ...atk, elementalMastery: .35, hpPercent: .1, energyRecharge: .05 }, noEr, [four('zhuying-lieren', '长按战技消耗生命触发，36%条件暴率。'), four('golden-troupe', '站场仅按45%战技增伤，不虚构后台满额效果。', '替代'), pair('heart-of-depth', 'golden-troupe', '水伤战技过渡。')], ['零命海渊终曲等常见剑；主要伤害仍按攻击，不套生命水C模板。', 'Q移动快且实战命中不稳定，不强求每轮；精通仅本人蒸发时有较高收益。']), element: '水' },
  { ...fav(b('pyro', '火 · 后台绘卷挂火', [['energyRecharge', 'atkPercent'], ['pyroDmgBonus', 'atkPercent'], [...crit]], { ...atk, energyRecharge: 1.2, elementalMastery: .2 }, [210, 220, '零命西风剑、绘卷并有纳塔队友每轮Q；无绘卷约220–235%，雷电/欧洛伦等回能队可135–180%。'], [scroll, four('deepwood-memories', '基尼奇/艾梅莉埃队缺少深林，草抗削减优先。', '替代'), four('tenacity-of-the-millelith', '持续战技命中、队内已有对应绘卷且主C吃攻击。', '替代')], ['默认零命后台，不默认六命火附魔。本人烈绽放触发时改全精通、先满足循环。']), '西风剑', 61.3), element: '火' },
  { ...b('cryo', '冰 · 零命星超导 / 按需爆发', [['atkPercent'], ['atkPercent'], [...crit]], { ...atk, elementalMastery: .4, energyRecharge: .15 }, [100, 100, '零命海渊终曲等非回能剑，Q有能量才用，不设未经验证的每轮Q硬目标；指南105–130%要求一命+星锋剑，不能直接用于零命。'], [four('disenchantment-in-deep-shadow', '站场星超导输出，16%条件暴击。'), four('a-day-carved-from-rising-winds', '仅使用可触发的基础攻击部分；不假定旅行者满足魔导套装全部效果。', '替代'), pair('gladiators-finale', 'gilded-dreams', '攻击精通二件套过渡。')], ['冰形态已在正式服7.0开放；冰伤杯不增加主要星反应伤害。', '一命每次星烁伤害回复5能量（0.5秒间隔），对循环影响很大；不要混用命座参考。']), element: '冰' },
  { ...b('cryo-c1', '冰 · 一命星锋剑星超导', [['atkPercent'], ['atkPercent'], ['critDamage', 'critRate']], { ...atk, elementalMastery: .4, energyRecharge: .65 }, [105, 130, '明确一命+免费星锋剑、一名冰队友、每轮Q；额外一名冰或两名雷队友可再降约30点，最低按100%。'], [four('disenchantment-in-deep-shadow', '站场星超导，16%条件暴击。'), four('a-day-carved-from-rising-winds', '可用攻击增益，不能默认旅行者满足全套魔导条件。', '替代'), pair('gladiators-finale', 'gilded-dreams', '攻击精通五星过渡。')], ['这是攻略明确的一命回能条件方案，不是零命默认。', '星锋剑暴率、冰共鸣与被动条件暴率需一起扣除；通常优先暴伤冠。']), element: '冰', assumedWeapon: { name: '90级星锋剑（旅行者专属被动另按任务解锁）', energyRecharge: 0, critRate: 33.1 } },
  { ...b('cryo-swirl', '冰 · 一命星锋剑星扩散辅助', [['atkPercent', 'elementalMastery'], ['atkPercent', 'elementalMastery'], ['critDamage', 'critRate']], { ...atk, elementalMastery: .4, energyRecharge: .05 }, [100, 100, 'KQM星扩散辅助图明确一命+星锋剑不需额外ER；零命或未解锁武器被动不能照抄此结论。'], [four('heart-of-the-furnace', '仅队伍没有其他合适炉火持有者且本人实际触发时。'), four('tenacity-of-the-millelith', '奥黛塔等已持炉火，后台战技持续命中且队友吃攻击。', '替代'), atkPair], ['攻击沙杯通常优于精通；不是风伤或冰伤杯。', '只辅助瑞希不需要长时间站场，炉火覆盖须按实际触发时间检查。']), element: '冰', assumedWeapon: { name: '90级星锋剑（旅行者专属被动另按任务解锁）', energyRecharge: 0, critRate: 33.1 } },
], 0, 0, 'https://keqingmains.com/anemo-traveler/')
LEGACY45_PROFILES.push({
  ...traveler,
  elements: ['风', '岩', '雷', '草', '水', '火', '冰'],
  sources: [
    { title: 'KQM 风旅行者指南', url: 'https://keqingmains.com/anemo-traveler/' },
    { title: 'KQM 岩旅行者指南', url: 'https://keqingmains.com/geo-traveler/' },
    { title: 'KQM 雷旅行者指南', url: 'https://keqingmains.com/electro-traveler/' },
    { title: 'KQM 草旅行者指南', url: 'https://keqingmains.com/q/dendro-traveler-quickguide/' },
    { title: 'KQM 水旅行者指南', url: 'https://keqingmains.com/q/hydro-traveler-quickguide/' },
    { title: 'KQM 火旅行者指南', url: 'https://keqingmains.com/q/pyro-traveler-quickguide/' },
    { title: 'KQM 冰旅行者星超导配装图', url: 'https://keqingmains.com/i/cryo-traveler-stellar-conduct/' },
    { title: 'KQM 冰旅行者星扩散配装图', url: 'https://keqingmains.com/i/cryo-traveler-stellar-swirl/' },
  ],
})
