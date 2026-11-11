import { useState } from 'react'
import { CHARACTERS, CHARACTER_PROFILES, getBuildProfile, getCharacterProfile } from './characterProfiles'
import { CharacterPortrait } from '../components/CharacterPortrait'
import { ArtifactGlyph } from '../components/ArtifactGlyph'
import { ARTIFACT_SLOTS, type ArtifactRecord } from '../artifacts/types'
import { getBuildMetrics, getCharacterStatWeights, type ScoringOptions } from '../scoring'
import { STAT_DEFINITIONS } from '../artifacts/statModel'
import { BuildControls } from '../characters/BuildControls'
import { setPlanLabel } from '../characters/setPlanLabel'
import { CHARACTER_ELEMENTS, matchesElement, selectCharacterProfiles, type CharacterDirectoryFilter } from '../characters/directory'

export function CharactersPage({ characterIndex, onCharacterChange, assets, picks, onRecommend, onWarehouse, scoringOptions = {}, onScoringChange }: { characterIndex: number; onCharacterChange: (index: number, buildId?: string) => void; assets: Record<string, string>; picks: ArtifactRecord[]; onRecommend: () => void; onWarehouse: () => void; scoringOptions?: ScoringOptions; onScoringChange?: (options: ScoringOptions) => void }) {
  const [search, setSearch] = useState('')
  const [element, setElement] = useState<CharacterDirectoryFilter['element']>('all')
  const [order, setOrder] = useState<CharacterDirectoryFilter['order']>('newest')
  const entries = selectCharacterProfiles(CHARACTER_PROFILES, { search, element, order })
  const [name] = CHARACTERS[characterIndex] ?? CHARACTERS[0]
  const profile = getCharacterProfile(name)!, build = getBuildProfile(name, scoringOptions.buildId)!
  const metrics = getBuildMetrics(picks, name, scoringOptions)
  const weights = getCharacterStatWeights(name, build.id)
  return <div className="characters-layout">
    <section className="page-panel character-selector"><h2>角色档案 <small>{CHARACTERS.length} 位</small></h2><label className="character-search">搜索角色<input aria-label="搜索角色" placeholder="名称、元素、版本或定位" value={search} onChange={e => setSearch(e.target.value)} /></label>
      <div className="character-elements" role="group" aria-label="角色元素分类"><button aria-label={`全部角色（${CHARACTERS.length}位）`} aria-pressed={element === 'all'} onClick={() => setElement('all')}>全部 <small>{CHARACTERS.length}</small></button>{CHARACTER_ELEMENTS.map(value => <button key={value} aria-label={`${value}元素（${CHARACTER_PROFILES.filter(p => matchesElement(p, value)).length}位）`} aria-pressed={element === value} onClick={() => setElement(value)}>{value} <small>{CHARACTER_PROFILES.filter(p => matchesElement(p, value)).length}</small></button>)}</div>
      <label className="character-sort">角色新旧排序<select aria-label="角色新旧排序" value={order} onChange={e => setOrder(e.target.value as CharacterDirectoryFilter['order'])}><option value="newest">五星优先 · 新角色在前</option><option value="oldest">五星优先 · 老角色在前</option></select></label>
      <p className="page-note">显示{entries.length}位 · 同星级按首次实装先后，非复刻时间。</p>
      <div className="character-tabs character-directory">{entries.map(({ profile: p, index }) => <button key={p.id} data-character-name={p.name} data-rarity={p.rarity} aria-pressed={characterIndex === index} onClick={() => onCharacterChange(index, p.elements && element !== 'all' ? p.builds.find(b => b.element === element)?.id : undefined)} className={characterIndex === index ? 'character-active' : ''}><span className="character-avatar"><CharacterPortrait name={p.name} customSrc={assets[`character:${p.name}`]} /></span><span><strong>{p.name}</strong><small>{p.rarity}★ {(p.elements ?? [p.element]).join('/')} · {p.version} · {p.role}</small></span></button>)}</div>
      {!entries.length && <p className="page-note">未找到角色，请调整搜索。</p>}
    </section>
    <section className="page-panel character-dossier"><p className="page-eyebrow">{profile.rarity}★ · {build.element ?? profile.element}元素 · {profile.weapon} · 首发{profile.version}</p><h2>{name} · 角色工作台</h2><p className="page-note">{profile.role}。{build.description}</p>
      <BuildControls name={name} options={scoringOptions} onChange={onScoringChange} />
      <h3>建议主词条</h3><dl className="main-advice">{Object.entries(build.mainStats).map(([slot, keys]) => <div key={slot}><dt>{slot}</dt><dd>{keys.map(key => STAT_DEFINITIONS[key].label + (STAT_DEFINITIONS[key].percent ? '%' : '')).join(' / ')}</dd></div>)}</dl>
      <h3>建议套装与条件</h3><div className="set-advice">{build.sets.map((plan, i) => <article key={i}><span>{plan.label}</span><strong>{setPlanLabel(plan)}</strong><p>{plan.condition}</p></article>)}</div>
      <h3>充能与机制要点</h3><p className="page-note">参考总充能：{build.recharge.min}–{build.recharge.max}%。{build.recharge.note}</p><ul className="profile-notes">{build.notes.map(note => <li key={note}>{note}</li>)}</ul>
      <h3>有效词条相对权重</h3><p className="page-note">按约一次词条提升归一化，不直接比较生命整数和暴击百分比。0表示本玩法不主追；充能超过参考上限仅保留15%权重，暴击超过100%的部分不加分。被动攻防精通上限仅作说明，不把属性后续收益归零。</p>
      <div className="weight-tags">{weights.filter(w => w.weight > 0).map(({ stat, weight }) => <span key={stat}>{stat}<small>相对权重 {weight}</small></span>)}</div>
      <h3>当前库存的五部位候选</h3><p className="page-note">这是工具候选，不是游戏当前装备。已知估算暴击{metrics.critRate}%、充能{metrics.energyRecharge}%；仅含所列突破、武器、圣遗物与已确认条件，不是完整实战面板。</p>
      <div className="slot-overview">{ARTIFACT_SLOTS.map(slot => { const record = picks.find(item => item.slot === slot); return <article key={slot}><strong>{slot}</strong>{record ? <><ArtifactGlyph artifact={record} /><span>{record.name}</span><small>+{record.level} · {record.main}</small></> : <p className="page-note">暂无候选</p>}</article> })}</div>
      <div className="page-actions"><button className="primary-button" onClick={onRecommend}>查看该角色推荐</button><button className="secondary-button" onClick={onWarehouse}>在仓库查看角色候选</button></div>
      <footer className="profile-sources"><p>资料核对：{profile.reviewedAt} · 配装参考不等于官方认证；充能范围依队伍和武器变化。</p>{profile.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title}</a>)}</footer>
    </section>
  </div>
}
