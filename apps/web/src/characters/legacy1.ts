import type { CharacterProfile } from './profileTypes'
import { b, p, four, pair, atk, def, supportEm } from './legacyFactory'

// Reviewed against the original KQM guides on 2026-10-18. Numbers below are
// transparent sorting heuristics, not fitted DPS derivatives. ER is total panel
// ER under the stated rotation; constellation-dependent alternatives say so.
const vv = four('viridescent-venerer', '在前台扩散队友对应元素以减抗；不能降低草、岩或风抗。')
const no = four('noblesse-oblige', '队伍没有其他宗室持有者，每轮爆发且主输出吃攻击加成。')
const emblem = four('emblem-of-severed-fate', '爆发为主要伤害来源，先满足该队循环。')
const emPair = pair('gilded-dreams', 'wanderers-troupe', '两种五星精通二件套过渡。')
const atkPair = pair('gladiators-finale', 'shimenawas-reminiscence', '攻击二件套过渡；不假定与完整四件套同等。')
const pureEm = { elementalMastery: 1, energyRecharge: 0, critRate: 0, critDamage: 0, atkPercent: 0, atkFlat: 0, hpPercent: 0, hpFlat: 0, defPercent: 0, defFlat: 0 }
const healerHp = { hpPercent: 1, hpFlat: .25, energyRecharge: 1, critRate: 0, critDamage: 0, atkPercent: 0, atkFlat: 0, elementalMastery: 0, defPercent: 0, defFlat: 0 }
const healerAtk = { atkPercent: 1, atkFlat: .3, energyRecharge: 0, critRate: 0, critDamage: 0, hpPercent: 0, hpFlat: 0, elementalMastery: 0, defPercent: 0, defFlat: 0 }
const assumedWeapons: Record<string, Record<string, { name: string; energyRecharge: number; critRate: number }>> = {
  amber: { support: { name: '90级西风猎弓', energyRecharge: 61.3, critRate: 0 } },
  xingqiu: { favonius: { name: '90级西风剑', energyRecharge: 61.3, critRate: 0 }, sacrificial: { name: '90级祭礼剑（精三以上且重置成功）', energyRecharge: 61.3, critRate: 0 } },
  noelle: { driver: { name: '90级西风大剑', energyRecharge: 61.3, critRate: 0 } },
  mona: { support: { name: '90级讨龙英杰谭（非回能武器）', energyRecharge: 0, critRate: 0 } },
  diona: { support: { name: '90级西风猎弓', energyRecharge: 61.3, critRate: 0 } },
}
const manualCritNotes: Record<string, string> = {
  amber: '爆发天赋的10%暴率只作用于Q，蓄力弱点必暴也不是通用面板暴率；本工具不自动混算各段覆盖。',
  kaeya: '本工具未自动计入冰套20%/冻结40%、双冰15%等条件暴率；请按实际覆盖填“额外暴击率”，不要与武器重复。',
  keqing: 'Q后天赋15%条件暴率未自动计入，请在覆盖成立时加入“额外暴击率”；套装条件选项不能代替该天赋。',
  ganyu: '冰套20%/冻结40%、双冰15%及霜华箭天赋20%均未自动计入；请按对应攻击覆盖设置额外暴率，霜华箭加成不作用于Q。',
  rosaria: '背袭天赋12%暴率未自动计入，请仅在能命中背后时填入额外暴率；冰套条件暴率不增加团队分享。',
}

export const LEGACY1_PROFILES: CharacterProfile[] = [
  p('amber', '安柏', '1.0', 4, '火', '弓', '融化蓄力 / 爆发挂火辅助', [
    b('melt', '零命融化蓄力 · 非弱点专用', [['elementalMastery', 'atkPercent'], ['pyroDmgBonus'], ['critRate', 'critDamage']], { ...atk, elementalMastery: .8, energyRecharge: 0 }, [100, 100, '零命蓄力融化不安排Q；不套用四命兔兔爆破的充能值。'], [four('wanderers-troupe', '稳定融化蓄力箭。'), four('shimenawas-reminiscence', '不放Q且E后有能量支付，注意十秒覆盖。', '替代'), pair('crimson-witch-of-flames', 'wanderers-troupe', '火伤与精通过渡。')], ['默认并非每个敌人都有弱点，不能把暴率权重普遍归零；弱点百暴玩法需单独调整。']),
    b('support', '零命西风 · 爆发挂火', [['energyRecharge', 'atkPercent'], ['pyroDmgBonus'], ['critRate', 'critDamage']], { ...atk, energyRecharge: 1.2, critRate: 1, elementalMastery: 0 }, [165, 175, '西风触发并由自己吃球，不放E，无额外队友西风；终末无队友西风约225–240%。'], [no, four('scroll-of-the-hero-of-cinder-city', '本人触发反应；非夜魂仅12%元素增伤。', '替代')], ['辅助优先四件套与充能，不为个人双暴破坏循环；四星教官不在本工具五星推荐范围。']),
    b('burgeon', '零命烈绽放 · 蓄力触发', [['elementalMastery'], ['elementalMastery'], ['elementalMastery']], pureEm, [100, 100, '蓄力点草原核，不放Q；避免对敌过量挂火导致燃烧。'], [four('flower-of-paradise-lost', '本人持续触发烈绽放。'), four('gilded-dreams', '按队伍元素构成触发精通增益。', '替代'), emPair], ['以等级与精通为主，烈绽放不按双暴、攻击评分。']),
  ]),
  p('kaeya', '凯亚', '1.0', 4, '冰', '单手剑', '后台冰伤 / 融化 / 充能辅助', [
    b('freeze', '零命双冰冻结 · 后台输出', [['atkPercent', 'energyRecharge'], ['cryoDmgBonus'], ['critRate', 'critDamage']], { ...atk, energyRecharge: 1, elementalMastery: 0 }, [135, 160, '20秒双冰冻结，两次E，其中一次自己吃球，E命中一个冻结目标；非冻结约150–190%。'], [four('blizzard-strayer', '敌人可冻结；对不可冻结首领不能计入40%暴率。'), emblem, pair('blizzard-strayer', 'noblesse-oblige', '冰伤与爆发伤害过渡。')], ['冰套、双冰共鸣和一命仅普攻暴率的适用范围不同，不应全部当全技能常驻暴率。']),
    b('melt', '零命双冰 · 反向融化', [['atkPercent', 'energyRecharge', 'elementalMastery'], ['cryoDmgBonus'], ['critRate', 'critDamage']], { ...atk, elementalMastery: .55, energyRecharge: 1 }, [150, 190, '20秒双冰、两E、一次自己吃球；单冰同条件195–230%，非六命。'], [emblem, four('unfinished-reverie', '仅稳定燃烧融化时。', '替代'), four('gilded-dreams', '实际由凯亚触发融化，较低充能时。', '替代')], ['不能在反向融化队沿用冰套冻结暴率。']),
    b('support', '零命双冰 · 团队辅助', [['energyRecharge', 'atkPercent'], ['cryoDmgBonus'], ['critRate']], { energyRecharge: 1, critRate: .6, atkPercent: .25, atkFlat: .05, critDamage: .15, elementalMastery: 0 }, [150, 190, '两E双冰、非回能剑参考；西风实际触发可下调约15–25点。'], [no, four('scroll-of-the-hero-of-cinder-city', '本人触发目标元素反应且队友不适合加攻；只能12%增伤。', '替代')], ['西风需前台暴击；零命不假定六命15点回能。']),
  ]),
  p('lisa', '丽莎', '1.0', 4, '雷', '法器', '站场激化 / 后台减防', [
    b('aggravate', '零命双雷 · 站场激化', [['atkPercent', 'elementalMastery'], ['electroDmgBonus'], ['critRate', 'critDamage']], { ...atk, elementalMastery: .65, energyRecharge: .8 }, [100, 130, '雷共鸣，至少一次长按E成功产球，站场吃球；单雷站场约130–160%。'], [four('thundering-fury', '草激化队，前台触发反应缩短E冷却。'), four('gilded-dreams', '草相关反应队，按元素组成获得精通和攻击。', '替代'), pair('thundering-fury', 'gladiators-finale', '雷伤与攻击过渡。')], ['长按E若被打断，不能沿用此充能目标；纯雷无草时降低精通权重。']),
    b('support', '零命双雷 · 爆发减防', [['energyRecharge', 'atkPercent'], ['electroDmgBonus'], ['critRate', 'critDamage']], { energyRecharge: 1, critRate: .25, critDamage: .25, atkPercent: .2, atkFlat: .05, elementalMastery: 0 }, [180, 210, '雷共鸣，后台不长按E；若一轮成功一次长E约130–160%，单雷长E约170–200%。'], [no, emblem], ['减防靠爆发命中，优先循环；讨龙辅助不等于必须给攻击或精通高权重。']),
  ]),
  p('jean', '琴', '1.0', 5, '风', '单手剑', '全队治疗 / 风套 / 日炎', [
    b('support', '零命单风 · 治疗兼直伤', [['energyRecharge', 'atkPercent'], ['anemoDmgBonus', 'atkPercent'], ['critRate', 'critDamage', 'healingBonus']], { ...atk, energyRecharge: 1, elementalMastery: 0 }, [160, 200, '非回能剑，每轮两E一Q；双风或雷神约140–160%，天目两层可明显下降。'], [vv, four('noblesse-oblige', '风C等队伍不需风套减抗且无人持宗室。', '替代'), four('ocean-hued-clam', '风套与宗室均不需要，利用全队瞬抬治疗。', '替代')], ['治疗按攻击成长；偏生存可攻杯治疗头，兼个人输出可风杯双暴头。']),
    b('sunfire', '零命日炎 · 班尼特自附火扩散', [['elementalMastery', 'energyRecharge'], ['elementalMastery'], ['elementalMastery']], { ...pureEm, energyRecharge: 1 }, [160, 200, '单风两E一Q、非回能剑；需与班尼特领域重叠。'], [vv, emPair], ['日炎扩散主要吃等级精通，不把普通治疗/直伤双暴模板直接复用。']),
  ]),
  p('diluc', '迪卢克', '1.0', 5, '火', '双手剑', '蒸发 / 融化站场', [
    b('reaction', '零命蒸发 / 融化', [['elementalMastery', 'atkPercent'], ['pyroDmgBonus'], ['critRate', 'critDamage']], { ...atk, elementalMastery: .65, energyRecharge: .35 }, [100, 115, '与班尼特组队且每轮Q；无班尼特约120–130%，依吃球调整。'], [four('crimson-witch-of-flames', '多段E维持魔女层数并由本人触发增幅反应。'), four('zhuying-lieren', '仅芙宁娜及可靠生命变化维持层数时。', '替代'), pair('crimson-witch-of-flames', 'wanderers-troupe', '火伤精通过渡。')], ['精通针对本人蒸发/融化；纯火队应降低至零。下落队仍按实际反应和队伍增益选择沙。']),
    b('mono', '零命纯火 · 非反应输出', [['atkPercent'], ['pyroDmgBonus'], ['critRate', 'critDamage']], { ...atk, elementalMastery: 0, energyRecharge: .25 }, [100, 115, '双火约115%，三火约100%；不假定每次都由自己触发反应。'], [four('lavawalker', '敌人持续火附着才有效，不对自带其他元素敌人无条件推荐。'), four('crimson-witch-of-flames', '自身E可叠层，通用旧装替代。', '替代'), atkPair], ['纯火精通不提升主要直伤。']),
  ]),
  p('barbara', '芭芭拉', '1.0', 4, '水', '法器', '生命治疗 / 站场挂水 / 绽放', [
    b('healer', '零命治疗 / 感电挂水驾驶', [['hpPercent'], ['hpPercent'], ['healingBonus', 'hpPercent']], { ...healerHp, energyRecharge: 0 }, [100, 100, '以E与前台普攻治疗，Q作为应急，不要求每轮。'], [four('ocean-hued-clam', '站场治疗累积泡沫，兼顾非双暴伤害。'), four('maiden-beloved', '只需强化治疗时。', '替代'), pair('tenacity-of-the-millelith', 'ocean-hued-clam', '生命和治疗过渡。')], ['治疗和海染泡沫不吃双暴，不给攻击、暴伤有效分；感电驾驶员也不等于反应全由她触发。']),
    b('bloom', '零命妮露绽放 · 水草队', [['elementalMastery', 'hpPercent'], ['elementalMastery', 'hpPercent'], ['elementalMastery', 'healingBonus']], { ...pureEm, hpPercent: .4, hpFlat: .1 }, [100, 100, '妮露队水草限定，站场触发部分丰穰之核，Q应急。'], [four('flower-of-paradise-lost', '芭芭拉确实拥有较高草原核触发占比。'), four('gilded-dreams', '精通与生存之间按队伍调整。', '替代'), four('ocean-hued-clam', '队伍更需要可靠治疗，精通主词条可保留。', '替代')], ['精通与治疗取舍由自伤压力和触发归属决定，不假定全部绽放都归芭芭拉。']),
  ]),
  p('razor', '雷泽', '1.0', 4, '雷', '双手剑', '物理 / 激化 / 剧变反应站场', [
    b('physical', '零命双雷 · 物理站场', [['atkPercent'], ['physicalDmgBonus'], ['critRate', 'critDamage']], { ...atk, elementalMastery: 0, energyRecharge: .65 }, [100, 130, '双雷；菲谢尔供能良好可约100%，单雷约140–180%；正确使用雷之印回能。'], [four('pale-flame', '按冷却点按E维持两层，不能长时间断E。'), four('gladiators-finale', '普攻为主且已有好旧装。', '替代'), pair('pale-flame', 'bloodstained-chivalry', '物理二加二过渡。')], ['超导辅助物理伤害，并不让精通变成物理收益；魔导增益需对应任务和队伍条件。']),
    b('aggravate', '零命双雷 · 激化混伤', [['atkPercent', 'elementalMastery'], ['electroDmgBonus', 'atkPercent'], ['critRate', 'critDamage']], { ...atk, elementalMastery: .55, energyRecharge: .6 }, [100, 130, '双雷草激化队，频繁点E积雷之印；按实际吃球调整。'], [four('thundering-fury', '站场触发激化、缩短点E冷却。'), pair('thundering-fury', 'gladiators-finale', '雷伤攻击过渡。')], ['雷与物理混伤杯需结合队友、武器和实际伤害占比，不把精通当无上限直伤替代。']),
    b('transformative', '零命雷泽 · 超绽放/烈绽放混合', [['elementalMastery', 'energyRecharge'], ['elementalMastery'], ['elementalMastery']], { ...pureEm, energyRecharge: 1 }, [140, 180, '单雷、Q驱动反应；若搭班尼特，完整烈绽放混合需班尼特六命，雷泽自身可零命。'], [four('gilded-dreams', '本人实际触发多种剧变反应。'), four('flower-of-paradise-lost', '主要伤害确实来自本人超绽放/烈绽放。', '替代'), emPair], ['此玩法优先90级与精通，不按物理双暴评分；非六命班尼特不能假装有火附魔。']),
  ]),
  p('xiangling', '香菱', '1.0', 4, '火', '长柄武器', '后台蒸发 / 融化供火', [
    b('vaporize', '零命班尼特蒸发 · 20秒循环', [['energyRecharge', 'elementalMastery', 'atkPercent'], ['pyroDmgBonus'], ['critRate', 'critDamage']], { ...atk, elementalMastery: .65, energyRecharge: 1 }, [220, 280, '每轮锅巴一次、班尼特两E尽量喂球，锅巴命中约三次；雷神队约195–205%，不能混用。'], [emblem, four('crimson-witch-of-flames', '较低充能、增幅反应占比高且已有优秀旧装。', '替代'), pair('emblem-of-severed-fate', 'noblesse-oblige', '充能爆发过渡。')], ['默认零命，不假定四命延长；充能武器可用精通/攻击沙但仍须达循环。']),
    b('melt-enabler', '零命甘雨队 · 供火辅助', [['energyRecharge', 'atkPercent'], ['pyroDmgBonus'], ['critRate', 'critDamage']], { ...atk, energyRecharge: 1, elementalMastery: 0 }, [300, 310, '甘雨班尼特队20–21秒，锅巴一次、班尼特两E，普通非回能武器；西风约280–290%，需实测。'], [emblem, no], ['此配置主要让甘雨融化，不能据队伍发生融化就给香菱高精通权重；极高需求可延长轮转改善。']),
  ]),
  p('beidou', '北斗', '1.0', 4, '雷', '双手剑', '后台弹射雷伤', [
    b('offfield', '零命双雷 · 后台爆发', [['atkPercent', 'energyRecharge'], ['electroDmgBonus'], ['critRate', 'critDamage']], { ...atk, energyRecharge: 1, elementalMastery: .15 }, [155, 195, '双雷、两次点E保守起点；参考菲谢尔单奥兹两点E155–185，但该表菲谢尔按六命，零命供能更差应上调。'], [emblem, pair('thundering-fury', 'noblesse-oblige', '雷伤爆发过渡。')], ['成功完美弹反可降需求，不能默认每次都完美；零命没有二命弹射次数，双目标优势需区分命座。', '雷神Q普攻动作不能触发北斗爆发弹射；北斗Q不攻击草原核，非超绽放触发者。']),
  ]),
  p('xingqiu', '行秋', '1.0', 4, '水', '单手剑', '后台水伤 / 挂水减伤', [
    b('favonius', '零命西风 · 后台挂水', [['energyRecharge', 'atkPercent'], ['hydroDmgBonus'], ['critRate', 'critDamage']], { ...atk, energyRecharge: 1, elementalMastery: 0 }, [190, 220, '零至五命西风剑，前台可靠触发被动；非回能武器约220–260%，雷神队另算。'], [emblem, pair('heart-of-depth', 'noblesse-oblige', '水伤爆发过渡。'), no], ['不假定六命回能；常规蒸发由火主C触发，不能因此优先行秋精通。']),
    b('sacrificial', '零命祭礼精三以上 · 双E', [['atkPercent', 'energyRecharge'], ['hydroDmgBonus'], ['critRate', 'critDamage']], { ...atk, energyRecharge: 1, elementalMastery: 0 }, [150, 180, '零至五命、祭礼剑精三以上且两次E成功命中产球；低精冷却不保证每轮双E。'], [emblem, pair('heart-of-depth', 'noblesse-oblige', '水伤爆发过渡。')], ['祭礼未重置时不能套用双E较低目标；六命另可下调，不作为默认。']),
  ]),
  p('ningguang', '凝光', '1.0', 4, '岩', '法器', '攻击倍率岩伤站场 / 速切', [
    b('damage', '零命双岩 · 常规岩伤', [['atkPercent'], ['geoDmgBonus'], ['critRate', 'critDamage']], { ...atk, energyRecharge: .75, elementalMastery: 0, defPercent: 0 }, [120, 140, '双岩每15秒一次E产球、一次Q；20秒两次真正产球E约100–110%。'], [four('nighttime-whispers-in-the-echoing-woods', '维持结晶盾与E后效果；需队友提供可结晶元素。'), pair('archaic-petra', 'gladiators-finale', '岩伤攻击过渡。'), emblem], ['凝光吃攻击而非防御；短于六秒的连放E不会都产球，零命也不假定二命重置。']),
  ]),
  p('fischl', '菲谢尔', '1.0', 4, '雷', '弓', '后台战技雷伤 / 激化', [
    b('offfield', '零命后台 · E/Q交替续奥兹', [['atkPercent'], ['electroDmgBonus'], ['critRate', 'critDamage']], { ...atk, elementalMastery: 0, energyRecharge: .15 }, [100, 100, 'E与Q按轮交替，隔轮Q；若每轮Q约120–140%，零命不能计六命续时与协同攻击。'], [four('golden-troupe', '奥兹和天赋主要作为战技伤害，长期后台。'), pair('thundering-fury', 'gladiators-finale', '雷伤攻击过渡。')], ['非激化直伤队不主堆精通，魔导增益需满足任务和反应条件。']),
    b('aggravate', '零命激化 · 后台奥兹', [['atkPercent', 'elementalMastery'], ['electroDmgBonus'], ['critRate', 'critDamage']], { ...atk, elementalMastery: .6, energyRecharge: .15 }, [100, 100, 'E/Q交替隔轮爆发；每轮Q按120–140%再看队伍吃球。'], [four('golden-troupe', '后台战技与超激化伤害。'), pair('thundering-fury', 'gilded-dreams', '雷伤精通过渡。')], ['攻击沙通常仍很有竞争力，精通并非全面替代攻击与双暴。']),
  ]),
  p('bennett', '班尼特', '1.0', 4, '火', '单手剑', '基础攻击增益 / 治疗', [
    b('healing', '零命双火 · 治疗加攻辅助', [['energyRecharge', 'hpPercent'], ['hpPercent'], ['healingBonus', 'hpPercent']], healerHp, [175, 220, '20秒双火、按队伍合理西风参考；单火195–255%，低产球短轴还可能更高。'], [no, pair('emblem-of-severed-fate', 'tenacity-of-the-millelith', '循环和治疗五星过渡，不包含四星教官/流放。')], ['攻击增益只看角色与武器基础攻击，圣遗物大小攻击均不增加加攻量；零命增益受70%生命门槛限制。']),
    b('damage', '零命双火 · 兼顾个人伤害', [['energyRecharge', 'atkPercent', 'elementalMastery'], ['pyroDmgBonus'], ['critRate', 'critDamage']], { ...atk, elementalMastery: .4, energyRecharge: 1 }, [175, 220, '后台双火辅助保持每轮Q；不是站场四次以上E的100–135%目标。'], [no, four('crimson-witch-of-flames', '仅个人稳定触发蒸发/融化且队友已持宗室。', '替代')], ['精通只在本人反应时有效；攻击词条仅增加个人直伤，不提高爆发的团队加攻。']),
  ]),
  p('noelle', '诺艾尔', '1.0', 4, '岩', '双手剑', '站场岩伤 / 护盾全队治疗', [
    b('c0', '零命 · 攻击沙站场', [['atkPercent', 'energyRecharge'], ['geoDmgBonus'], ['critRate', 'critDamage']], { ...atk, defPercent: .4, defFlat: .1, energyRecharge: 1, elementalMastery: 0 }, [125, 155, '与阿贝多/千织及另一岩角色供能的三岩参考；单岩常200%以上，E本身不产球。'], [four('husk-of-opulent-dreams', '维持华馆层数，兼顾防御转攻击与治疗护盾。'), four('gladiators-finale', '普攻为主的优秀旧装可用。', '替代'), four('zhuying-lieren', '仅芙宁娜等可靠生命变化时。', '替代')], ['默认零命、Q九级及以下优先攻击沙；不能把六命防御转换当零命。零命治疗概率也不是一命必定触发。']),
    b('defense', '条件方案 · 六命或Q十级以上', [['defPercent', 'energyRecharge'], ['geoDmgBonus', 'defPercent'], ['critRate', 'critDamage', 'defPercent']], { ...def, atkPercent: .3, atkFlat: .1, energyRecharge: 1, elementalMastery: 0 }, [125, 155, '同类三岩供能参考；不是默认零命九级Q模型。岩主等强供能约115–135%，单岩显著更高。'], [four('husk-of-opulent-dreams', '满足防御转换等级/命座条件。'), four('zhuying-lieren', '芙宁娜队且可靠维持36%条件暴率。', '替代')], ['此防御方案明确有条件，不宣称六命是角色默认；华馆与逐影选择随武器和队伍而变。']),
    b('driver', '零命芙宁娜驾驶 · 治疗优先', [['defPercent', 'energyRecharge'], ['defPercent'], ['healingBonus', 'defPercent']], { defPercent: 1, defFlat: .25, energyRecharge: 1, critRate: .35, critDamage: 0, atkPercent: 0, elementalMastery: 0 }, [200, 220, '单岩常需西风大剑自供能；200%以上只是起点，按触发及队伍实测，非保证上限。'], [four('archaic-petra', '本人拾取对应水结晶，强化队友水伤。'), four('zhuying-lieren', '改为兼顾本人伤害且可靠生命变化时。', '替代')], ['这是牺牲个人输出换治疗/驾驶的玩法，不按同分推断等于防御主C伤害；西风需暴率。']),
  ]),
  p('chongyun', '重云', '1.0', 4, '冰', '双手剑', '速切爆发 / 冰附魔', [
    b('burst', '零命双冰 · 速切爆发', [['atkPercent', 'elementalMastery', 'energyRecharge'], ['cryoDmgBonus'], ['critRate', 'critDamage']], { ...atk, elementalMastery: .45, energyRecharge: .8 }, [125, 135, '20秒双冰后台；单冰约150–175%，三冰100–125%；祭礼成功双E可降低。'], [no, emblem, pair('blizzard-strayer', 'noblesse-oblige', '冰伤爆发过渡。')], ['精通仅在Q可稳定融化时有用，纯冰/冻结应降至零；零命Q三柄，不假定六命第四柄。']),
  ]),
  p('sucrose', '砂糖', '1.0', 4, '风', '法器', '扩散驾驶 / 精通分享', [
    b('swirl', '零命扩散 · 精通辅助', [['elementalMastery'], ['elementalMastery'], ['elementalMastery']], { ...pureEm, energyRecharge: .15, critRate: .1 }, [100, 100, '常规不强求Q，有能量且不干扰反应才放；若队伍强制每轮Q需单独计算，非固定满能量起手。'], [vv, four('deepwood-memories', '草反应队缺深林且风套收益不重要时。', '替代'), four('scroll-of-the-hero-of-cinder-city', '风C充能辅助，本人触发反应可提供12%相关元素增伤。', '替代')], ['扩散不暴击；少量暴率仅为西风，没有西风时可置零。零命无一命额外E与六命元素增伤。']),
  ]),
  p('keqing', '刻晴', '1.0', 5, '雷', '单手剑', '站场激化 / 月感电', [
    b('aggravate', '零命激化 · 雷伤站场', [['atkPercent', 'elementalMastery'], ['electroDmgBonus'], ['critRate', 'critDamage']], { ...atk, elementalMastery: .55, energyRecharge: 0 }, [100, 100, '常规低耗能Q与频繁E，不主动追充能；需大量充能时优先调整轮转。'], [four('thundering-fury', '本人在前台触发激化缩短E冷却。'), four('gilded-dreams', '草相关反应，不能享受如雷缩短冷却时。', '替代'), pair('thundering-fury', 'gladiators-finale', '雷伤攻击过渡。')], ['Q后天赋有15%条件暴率，需留暴率余量；精通攻击均有价值，不是全精通剧变模板。']),
    b('lunar', '零命刻晴 · 月感电队', [['atkPercent'], ['electroDmgBonus', 'atkPercent'], ['critRate', 'critDamage']], { ...atk, elementalMastery: .25, energyRecharge: 0 }, [100, 100, '队友伊涅芙/哥伦比娅使感电转为月感电，不额外为Q堆充能。'], [four('night-of-the-skys-unveiling', '有月感电转化且满足月兆；完整30%暴率需要辉月。'), four('zhuying-lieren', '芙宁娜队维持生命变化；只有一名挪德卡莱队友时尤其适合。', '替代'), four('thundersoother', '月感电队持续雷附着，作为已有旧装替代。', '替代')], ['此队刻晴自身仍有大量雷直伤，通常雷伤杯优先，精通不能当攻击的等价替代；仅高增伤、高基础攻击时考虑攻击杯。']),
  ]),
  p('qiqi', '七七', '1.0', 5, '冰', '单手剑', '攻击倍率治疗 / 海染', [
    b('healing', '零命治疗 · 按需开大', [['atkPercent'], ['atkPercent'], ['healingBonus', 'atkPercent', 'critRate']], { ...healerAtk, critRate: .2 }, [100, 100, 'E与天赋符咒治疗为主，Q按需或隔轮，不追每轮；E不产球。'], [four('ocean-hued-clam', '持续治疗转泡沫伤害，站场治疗更易蓄满。'), four('tenacity-of-the-millelith', 'E持续命中且队伍吃加攻，考虑覆盖间隙。', '替代'), pair('gladiators-finale', 'ocean-hued-clam', '攻击治疗过渡。')], ['泡沫与治疗不吃双暴；暴率仅西风前台触发，非西风可零。零命无一命回能。']),
  ]),
  p('mona', '莫娜', '1.0', 5, '水', '法器', '星异增伤 / 后台挂水', [
    b('support', '零命单水 · 星异辅助', [['energyRecharge', 'atkPercent'], ['hydroDmgBonus'], ['critRate', 'critDamage']], { ...atk, energyRecharge: 1.2, elementalMastery: 0, critRate: 1 }, [260, 350, '普通法器/讨龙、单水不吃自身E球；若能吃球约230–265%，西风不吃球约210–270%，金珀约150–180%。'], [four('celestial-gift', '完成魔女课业并有另一魔导角色；不与队友重复。'), no, four('tenacity-of-the-millelith', '队友已有美赐/宗室且主C吃攻击；E覆盖短，需对轴快照。', '替代')], ['循环远比个人双暴重要；此非蒸发核爆。冻结延长星异需要敌人能冻结，首领不能默认同样覆盖。']),
  ]),
  p('venti', '温迪', '1.0', 5, '风', '弓', '聚怪 / 扩散 / 风直伤', [
    b('swirl', '零命单风 · 后台聚怪扩散', [['elementalMastery', 'energyRecharge'], ['elementalMastery'], ['elementalMastery']], { ...pureEm, energyRecharge: 1, critRate: .15 }, [175, 210, '单风每轮一次E一Q；短轴两E145–165%，长轴两E115–145%；突破充能包含于总面板。'], [vv, emPair], ['先升等级，扩散不吃双暴；西风仅需适量暴率。聚怪对重型敌人和首领有效性有限。']),
    b('crit', '零命直伤 · 低扩散高增益队', [['atkPercent', 'energyRecharge'], ['anemoDmgBonus'], ['critRate', 'critDamage']], { ...atk, elementalMastery: .15, energyRecharge: 1 }, [145, 165, '单风短轴两E一Q后台；单E175–210%，不可按站场吃球目标配后台。'], [vv, pair('viridescent-venerer', 'gladiators-finale', '队友已持风套或无需减抗时过渡。')], ['这是直伤型双暴方案，非全精通等价替换；须有足够个人增益及较少扩散收益。']),
  ]),
  p('klee', '可莉', '1.0', 5, '火', '法器', '站场火伤 / 反应驾驶', [
    b('damage', '零命双火 · 常规火伤', [['atkPercent'], ['pyroDmgBonus', 'atkPercent'], ['critRate', 'critDamage']], { ...atk, elementalMastery: 0, energyRecharge: .8 }, [125, 140, '双火、无西风；有队友西风约110–130%，三火无西风115–130%。'], [four('a-day-carved-from-rising-winds', '完成魔女课业并满足触发，20%条件暴率需预留空间。'), four('zhuying-lieren', '仅芙宁娜等可靠生命变化时。', '替代'), pair('crimson-witch-of-flames', 'gladiators-finale', '火伤攻击过渡。')], ['纯火不主堆精通；高增伤低加攻队可考虑攻击杯，零命无六命回能。']),
    b('reaction', '零命蒸发/增幅反应', [['atkPercent', 'elementalMastery'], ['pyroDmgBonus'], ['critRate', 'critDamage']], { ...atk, elementalMastery: .5, energyRecharge: .8 }, [125, 140, '双火无西风参考，Q每轮；单火无西风约140–160%。'], [four('a-day-carved-from-rising-winds', '完成魔女课业且触发条件满足。'), four('crimson-witch-of-flames', '本人确实触发蒸发/融化，不假定全部火伤都可反应。', '替代')], ['可莉挂火频率高，谁触发反应需核实，不能自动按全伤害蒸发评分。']),
  ]),
  p('diona', '迪奥娜', '1.1', 4, '冰', '弓', '生命护盾 / 治疗 / 冰系供能', [
    b('support', '零命双冰西风 · 盾奶', [['energyRecharge', 'hpPercent'], ['hpPercent'], ['hpPercent', 'healingBonus', 'critRate']], { ...healerHp, critRate: .4 }, [160, 180, '零命双冰、西风前台触发；祭礼成功双E145–165%，其他弓180–220%；不可套一命回能后的值。'], [no, pair('tenacity-of-the-millelith', 'vourukashas-glow', '纯护盾生命二加二。', '替代'), pair('emblem-of-severed-fate', 'tenacity-of-the-millelith', '循环与生命五星过渡。')], ['盾与奶均按生命；治疗头只增强奶不增强盾。零命不含六命200精通，也不推荐无法持续触发的千岩4。']),
  ]),
  p('tartaglia', '达达利亚', '1.1', 5, '水', '弓', '站场水伤 / 蒸发爆发', [
    b('international', '零命万达 · 远程Q起手', [['atkPercent'], ['hydroDmgBonus'], ['critRate', 'critDamage']], { ...atk, elementalMastery: .4, energyRecharge: .7 }, [100, 130, '常规远程Q有20能量返还；近战Q或过长站场需另算，不把开局满能量当循环。'], [four('nymphs-dream', '通过普攻、E、Q等维持不同层数，注意起手快照与循环。'), four('heart-of-depth', '以近战普重击为主的优秀旧装。', '替代'), pair('heart-of-depth', 'gladiators-finale', '水伤攻击过渡。')], ['近战形态武器仍是弓；精通主要提升可蒸发的爆发，而非全部持续水伤。']),
  ]),
  p('xinyan', '辛焱', '1.1', 4, '火', '双手剑', '物理输出 / 防御护盾', [
    b('physical', '零命物理 · 双火输出', [['atkPercent', 'energyRecharge'], ['physicalDmgBonus'], ['critRate', 'critDamage']], { ...atk, elementalMastery: 0, defPercent: 0, energyRecharge: 1 }, [160, 190, '双火每轮Q参考，通常班尼特供能；单火200–230%以上。'], [pair('pale-flame', 'bloodstained-chivalry', '物理加成二加二，稳定不依赖三级盾脉冲。', '首选'), four('pale-flame', '只有三级盾持续命中并维持两层时。', '替代')], ['零命爆发物理段不自带百暴，不能按二命只堆暴伤；防御只增强盾，零命不加物理攻击伤害。']),
    b('shield', '零命护盾 · 防御辅助', [['defPercent'], ['defPercent'], ['defPercent', 'critRate']], { defPercent: 1, defFlat: .25, critRate: .25, energyRecharge: 0, atkPercent: 0, critDamage: 0, elementalMastery: 0 }, [100, 100, '零命主要用E护盾，Q按需不强求；二命Q生成三级盾不是零命效果。'], [four('tenacity-of-the-millelith', '能命中至少两敌触发三级盾且盾不破、脉冲持续命中；单体零命不能保证。'), pair('husk-of-opulent-dreams', 'emblem-of-severed-fate', '五星防御加充能过渡；不假定二件充能在不开Q时有输出收益。')], ['单体零命通常无法维持三级盾，不能宣称千岩4常驻；西风才需要暴率，护盾不能靠暴伤增强。']),
  ], 0, 0, 'https://keqingmains.com/xinyan/'),
  p('zhongli', '钟离', '1.1', 5, '岩', '长柄武器', '生命护盾 / 全抗削减', [
    b('shield', '零命护盾 · 不强求Q', [['hpPercent'], ['hpPercent'], ['hpPercent', 'critRate']], { ...healerHp, energyRecharge: 0, critRate: .25 }, [100, 100, '护盾玩法通常不放Q；西风用于全队供能而非强制自己每轮Q。'], [four('tenacity-of-the-millelith', '岩脊持续命中才有团队加攻；柱被毁或敌人离开则断档。'), four('archaic-petra', '本人拾取所需元素结晶，队友主要输出能吃对应增伤。', '替代'), pair('tenacity-of-the-millelith', 'vourukashas-glow', '纯盾生命二加二。', '替代')], ['护盾只看生命，不把双暴攻击当纯盾有效词条；暴率仅西风前台触发。四星教官虽有用途但不纳入五星推荐。']),
    b('burst', '零命双岩 · 爆发兼护盾', [['hpPercent', 'atkPercent', 'energyRecharge'], ['geoDmgBonus'], ['critRate', 'critDamage']], { ...atk, hpPercent: .5, hpFlat: .1, energyRecharge: .9, elementalMastery: 0 }, [120, 140, '双岩每轮Q；单岩约175–220%，需权衡Q动画占用主C时间。'], [no, pair('archaic-petra', 'noblesse-oblige', '岩伤爆发二加二。')], ['爆发混合生命与攻击收益，和纯盾评分分开；追个人大招可能降低团队总输出。']),
  ]),
  p('albedo', '阿贝多', '1.2', 5, '岩', '单手剑', '后台防御战技岩伤', [
    b('skill', '零命后台E · 按需Q', [['defPercent'], ['geoDmgBonus', 'defPercent'], ['critRate', 'critDamage']], { ...def, atkPercent: 0, atkFlat: 0, energyRecharge: 0, elementalMastery: 0 }, [100, 100, '以E后台伤害为主，不要求每轮Q；双岩零命每轮Q约120–140%，单岩130–150%。'], [four('husk-of-opulent-dreams', '后台预叠华馆层数后施放E。'), four('golden-troupe', '长期后台战技伤害，防御杯可平衡高增伤。', '替代'), pair('husk-of-opulent-dreams', 'archaic-petra', '防御岩伤过渡。')], ['E按防御，零命Q按攻击；本方案不为低占比Q给攻击加分。魔导被动3000防御是部分增益上限，不是继续防御无收益。']),
  ]),
  p('ganyu', '甘雨', '1.2', 5, '冰', '弓', '融化蓄力 / 冻结冰伤', [
    b('melt', '零命融化 · 不放Q', [['elementalMastery', 'atkPercent'], ['cryoDmgBonus'], ['critRate', 'critDamage']], { ...atk, elementalMastery: .9, energyRecharge: 0 }, [100, 100, '常规融化蓄力不放Q，避免抢火；不主动堆充能。'], [four('wanderers-troupe', '本人蓄力箭持续融化。'), four('unfinished-reverie', '燃烧融化且维持触发条件。', '替代'), four('shimenawas-reminiscence', 'E消耗能量后十秒覆盖，注意破魔与轮转冲突。', '替代')], ['霜华箭天赋有20%条件暴率；融化不使用冰套冻结40%暴率。']),
    b('freeze', '零命双冰冻结 · 每轮Q', [['atkPercent', 'energyRecharge'], ['cryoDmgBonus'], ['critRate', 'critDamage', 'atkPercent']], { ...atk, energyRecharge: .9, elementalMastery: 0 }, [115, 130, '双冰站场、每轮两次队友西风、保守产球；原表四星队友按六命，零命队友需重算，低产球后台可160–170%。'], [four('blizzard-strayer', '敌人实际可冻结；首领只计冰附着部分。'), four('zhuying-lieren', '芙宁娜与生命变化，且本人在前台叠层后Q快照。', '替代'), pair('blizzard-strayer', 'gladiators-finale', '冰伤攻击过渡。')], ['冰套、双冰、天赋条件暴率需分别考虑作用范围，不能全部当面板常驻。']),
  ]),
  p('xiao', '魈', '1.3', 5, '风', '长柄武器', '爆发状态下落风伤', [
    b('plunge', '零命魈 · 风系供能下落', [['atkPercent', 'energyRecharge'], ['anemoDmgBonus', 'atkPercent'], ['critRate', 'critDamage']], { ...atk, energyRecharge: 1, elementalMastery: 0 }, [130, 140, '砂糖供能双风、无珐露珊参考；若有零命珐露珊加砂糖约120–130%，只靠低命珐露珊单喂常175–185%。'], [four('vermillion-hereafter', 'Q后持续损血维持攻击层数。'), four('zhuying-lieren', '自身Q损血可叠层，36%条件暴率易溢出。', '替代'), pair('viridescent-venerer', 'gladiators-finale', '风伤攻击过渡。')], ['Q状态下落伤害不是爆发伤害，不推荐绝缘；伤害依赖Q循环，但精通不提升纯风下落。', '攻击杯与风杯取决于队伍增伤/攻击增益；不假定六命珐露珊是默认队友。']),
  ]),
  p('hu-tao', '胡桃', '1.3', 5, '火', '长柄武器', '生命转攻击蒸发站场', [
    b('vaporize', '零命蒸发 · 常规重击', [['elementalMastery', 'hpPercent'], ['pyroDmgBonus'], ['critRate', 'critDamage']], { critRate: 1, critDamage: 1, elementalMastery: .75, hpPercent: .7, hpFlat: .18, atkPercent: .25, atkFlat: .08, energyRecharge: 0, defPercent: 0 }, [100, 110, '通常隔轮Q用于伤害与生存，不追每轮；追忆可能三至四轮Q，低能量约110%有帮助。'], [four('crimson-witch-of-flames', '本人稳定蒸发。'), four('shimenawas-reminiscence', '重击为主且能支付E后扣能，牺牲Q频率和应急治疗。', '替代'), four('zhuying-lieren', '仅芙宁娜等可靠生命变化维持层数；不能只凭一次E损血当常驻。', '替代')], ['精通沙与生命沙随武器和队友改变；攻击不是完全无效但低于生命转攻与双暴。零命需考虑重击体力，不假定一命免耗。']),
  ], 0, 0, 'https://keqingmains.com/q/hu-tao-quickguide/'),
  p('rosaria', '罗莎莉亚', '1.4', 4, '冰', '长柄武器', '后台融化 / 暴率分享 / 冰系供能', [
    b('melt', '零命双冰 · 反向融化', [['atkPercent', 'elementalMastery', 'energyRecharge'], ['cryoDmgBonus'], ['critRate', 'critDamage']], { ...atk, elementalMastery: .7, energyRecharge: 1 }, [145, 155, '双冰两E、无四命回能；单冰两E约200–210%，三E155–165%。'], [emblem, four('gilded-dreams', '低充能且本人反向融化时。', '替代'), four('unfinished-reverie', '稳定燃烧融化时。', '替代')], ['Q分享暴率吃本人暴率，仍须平衡暴伤，不是只堆暴率；零命不假定四命回能。']),
    b('support', '零命双冰 · 暴率供能辅助', [['energyRecharge', 'atkPercent'], ['cryoDmgBonus'], ['critRate', 'critDamage']], { ...atk, critRate: 1, critDamage: .6, energyRecharge: 1, elementalMastery: 0 }, [145, 155, '双冰两E、非回能武器起点；自己西风或队友西风可下调，喂球后自身吃球减少需重算。'], [no, four('blizzard-strayer', '个人冻结伤害备选；套装条件暴率不增加天赋分享量。', '替代')], ['优先队伍循环和西风触发；冰套暴率不计入面板，不能提高分享。背袭12%有命中条件。']),
  ]),
  p('yanfei', '烟绯', '1.5', 4, '火', '法器', '站场蒸发 / 剧变反应', [
    b('vaporize', '零命蒸发 · 隔轮Q', [['elementalMastery', 'atkPercent'], ['pyroDmgBonus'], ['critRate', 'critDamage']], { ...atk, elementalMastery: .7, energyRecharge: .35 }, [100, 120, '班尼特每轮两E、烟绯每轮两E，隔轮Q；单火约120–130%，不牺牲伤害硬追每轮Q。'], [four('crimson-witch-of-flames', '本人重击稳定蒸发。'), four('wanderers-troupe', '精通与重击增伤，优秀旧装。', '替代'), four('zhuying-lieren', '只在芙宁娜等可靠生命变化时。', '替代')], ['天赋使暴率略有额外价值，但不只堆暴率；零命没有四命护盾，不提供默认盾辅方案。']),
    b('burgeon', '零命烈绽放 · 反应触发', [['elementalMastery'], ['elementalMastery'], ['elementalMastery']], pureEm, [100, 100, '不开Q，使用普攻控制火附着和引爆草原核。'], [four('flower-of-paradise-lost', '本人实际触发烈绽放。'), four('gilded-dreams', '按队伍元素构成提供精通。', '替代'), emPair], ['需要足够水草和治疗，避免过量挂火燃烧；剧变伤害不吃攻击双暴。']),
  ]),
  p('eula', '优菈', '1.5', 5, '冰', '双手剑', '物理普攻 / 光降之剑爆发', [
    b('physical', '零命双冰 · 物理爆发', [['atkPercent', 'energyRecharge'], ['physicalDmgBonus'], ['critRate', 'critDamage']], { ...atk, energyRecharge: 1, elementalMastery: 0 }, [140, 160, '双冰每轮Q；三冰约110–125%，雷神或队友西风可降低，但取决于实际喂球。'], [four('pale-flame', '短E接Q后长E，维持两层覆盖光剑。'), pair('pale-flame', 'bloodstained-chivalry', '稳定物理二加二，不受层数影响。', '替代')], ['冰角色但主要伤害是物理，不用冰杯；超导不使精通成为有效主属性。重视稳定暴率而非只追一次大数字。']),
  ]),
  p('kazuha', '枫原万叶', '1.6', 5, '风', '单手剑', '扩散减抗 / 精通转元素增伤', [
    b('support', '零命单风 · 精通辅助每轮Q', [['elementalMastery', 'energyRecharge'], ['elementalMastery'], ['elementalMastery']], { ...supportEm, critRate: .2, critDamage: 0, atkPercent: 0, atkFlat: 0 }, [160, 200, '普通非回能剑、每轮两E一Q；单长E约220–280%，西风两E各触发一次约125–150%。'], [vv, emPair], ['扩散不暴击，暴率只为西风；精通转增伤没有“1000以后无收益”的硬上限。', '不能让精通挤掉必要充能；队伍不需Q时可切按需方案，零命无一命重置和六命附魔。']),
    b('skill-only', '零命按需Q · 短轴扩散辅助', [['elementalMastery'], ['elementalMastery'], ['elementalMastery']], { ...pureEm, critRate: .15 }, [100, 100, '队伍不需要Q挂元素，或Q会抢蒸发/融化、拖长轮转；仅E扩散触发增伤与风套。'], [vv, emPair], ['仅在该轮转确实可省Q时选，不是所有队伍的低充能通用模板；西风暴率按实际需求。']),
  ]),
].map(profile => ({
  ...profile,
  builds: profile.builds.map(build => ({
    ...build,
    assumedWeapon: assumedWeapons[profile.id]?.[build.id],
    notes: manualCritNotes[profile.id] ? [...build.notes, manualCritNotes[profile.id]] : build.notes,
  })),
}))
