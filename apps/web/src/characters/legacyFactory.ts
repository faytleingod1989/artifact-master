import type { ArtifactSetKey } from '../artifacts/types'
import type { StatKey } from '../artifacts/statModel'
import type { BuildProfile, CharacterProfile, SetPlan, StatWeights } from './profileTypes'

const crit: StatWeights = { critRate: 1, critDamage: 1 }
export const atk: StatWeights = { ...crit, atkPercent: .7, atkFlat: .2 }
export const hp: StatWeights = { ...crit, hpPercent: .8, hpFlat: .2 }
export const def: StatWeights = { ...crit, defPercent: .85, defFlat: .2 }
export const em: StatWeights = { ...crit, elementalMastery: .9 }
export const supportAtk: StatWeights = { energyRecharge: 1.1, atkPercent: .9, atkFlat: .25, critRate: .3 }
export const supportEm: StatWeights = { energyRecharge: 1.1, elementalMastery: 1, critRate: .25 }
export const four = (key: ArtifactSetKey, condition: string, label: SetPlan['label'] = '首选'): SetPlan => ({ label, pieces: [{ key, count: 4 }], condition })
export const pair = (a: ArtifactSetKey, b: ArtifactSetKey, condition: string, label: SetPlan['label'] = '过渡'): SetPlan => ({ label, pieces: [{ key: a, count: 2 }, { key: b, count: 2 }], condition })
export function b(id: string, label: string, mains: [StatKey[], StatKey[], StatKey[]], weights: StatWeights, er: [number, number, string], sets: SetPlan[], notes: string[]): BuildProfile {
  return { id, label, description: '默认零命，另列高命等条件玩法；相对权重为本工具启发式，不是官方标准或实战伤害。', mainStats: { '时之沙': mains[0], '空之杯': mains[1], '理之冠': mains[2] }, weights, recharge: { min: er[0], max: er[1], note: er[2] }, sets, notes }
}
export function p(id: string, name: string, version: string, rarity: 4 | 5, element: string, weapon: string, role: string, builds: BuildProfile[], ascensionCritRate = 0, ascensionEnergyRecharge = 0, sourceUrl?: string): CharacterProfile {
  return { id, name, version, rarity, element, weapon, role, builds, ascensionCritRate, ascensionEnergyRecharge, reviewedAt: '2026-10-18', sources: [{ title: 'KQM 原作者配装与机制指南', url: sourceUrl ?? `https://keqingmains.com/q/${id}-quickguide/` }] }
}
