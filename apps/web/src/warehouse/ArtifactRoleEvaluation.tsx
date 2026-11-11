import { useEffect, useMemo, useRef, useState } from 'react'
import type { ArtifactRecord } from '../artifacts/types'
import { parseStat, STAT_DEFINITIONS } from '../artifacts/statModel'
import type { ScoringOptions } from '../scoring'
import { getBuildProfile, getCharacterProfile } from '../characters/profiles'
import { artifactMainMatches, getArtifactFitOptions } from '../characters/artifactFit'
import { createPotentialClient } from '../potential/potentialClient'
import type { PotentialInput, PotentialResult } from '../potential/potentialTypes'
export type EvaluationSelection = { characterName: string; buildId: string }
const emptyOptions: ScoringOptions = {}
export function ArtifactRoleEvaluation({ record, characterName = '', scoringOptions = emptyOptions, comparison, onComparisonChange }: { record: ArtifactRecord; characterName?: string; scoringOptions?: ScoringOptions; comparison?: EvaluationSelection; onComparisonChange: (value?: EvaluationSelection) => void }) {
  const [query, setQuery] = useState(''), [outcome, setOutcome] = useState<{ key: string; result?: PotentialResult; error?: string }>()
  const client = useRef<ReturnType<typeof createPotentialClient> | null>(null)
  const name = comparison?.characterName ?? characterName, profile = getCharacterProfile(name), build = getBuildProfile(name, comparison?.buildId ?? scoringOptions.buildId)
  const groups = useMemo(() => getArtifactFitOptions(record, query), [record, query])
  const options: ScoringOptions = comparison ? { buildId: build?.id, includeSetBonuses: false } : { ...scoringOptions, buildId: build?.id, includeSetBonuses: false }
  const key = JSON.stringify({ record, characterName: name, options })
  useEffect(() => { const current = createPotentialClient(); client.current = current; return () => { current.dispose(); client.current = null } }, [])
  useEffect(() => {
    if (!profile) return
    const abort = new AbortController(), request = JSON.parse(key) as PotentialInput
    void client.current?.evaluate(request, abort.signal).then(result => { if (!abort.signal.aborted) setOutcome({ key, result }) }).catch(error => { if (!abort.signal.aborted) setOutcome({ key, error: error instanceof Error ? error.message : '计算失败，请切换角色重试。' }) })
    return () => abort.abort()
  }, [key, profile])
  const result = outcome?.key === key ? outcome.result : undefined, error = outcome?.key === key ? outcome.error : undefined
  const chosen = [...groups.recommended, ...groups.others].find(row => row.characterName === name)
  const chooseRole = (value: string) => {
    const row = [...groups.recommended, ...groups.others].find(row => row.characterName === value)
    if (row) onComparisonChange({ characterName: value, buildId: row.suggestedBuildId })
  }
  const effective = record.subs.flatMap(text => { const stat = parseStat(text); return stat && (build?.weights[stat.key] ?? 0) > 0 ? [STAT_DEFINITIONS[stat.key].label + (STAT_DEFINITIONS[stat.key].percent ? '%' : '')] : [] })
  return <section className="artifact-role-evaluation" aria-label="角色适配与潜力">
    <h3>角色适配与潜力</h3><p className="warehouse-note">单件规则评分，不是整套伤害或实战提升。</p>
    <label>搜索评估角色<input value={query} onChange={e => setQuery(e.target.value)} placeholder="输入角色名称" /></label>
    <label>评估角色<select value={profile ? name : ''} onChange={e => chooseRole(e.target.value)}><option value="" disabled>请选择评估角色</option>
      {profile && !chosen && <option value={name}>{name}（当前选择）</option>}
      <optgroup label="该套装推荐">{groups.recommended.map(row => <option key={row.characterId} value={row.characterName}>{row.characterName} · {row.label}</option>)}</optgroup>
      <optgroup label="其他角色">{groups.others.map(row => <option key={row.characterId} value={row.characterName}>{row.characterName}</option>)}</optgroup>
    </select></label>
    {!groups.recommended.length && <p className="warehouse-note">暂无该套装推荐（或不符合搜索条件），仍可选择其他角色。</p>}
    {profile && build && <>
      <label>评估玩法<select value={build.id} onChange={e => onComparisonChange({ characterName: name, buildId: e.target.value })}>{profile.builds.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}</select></label>
      <button className="secondary-button" disabled={!comparison} onClick={() => onComparisonChange(undefined)}>跟随配装角色</button>
      <p className="warehouse-note">{comparison ? '独立比较，不改变配装角色或库存。' : '当前跟随配装角色。'} {build.description}</p>
      {!artifactMainMatches(record, build) && <p className="draft-error">主词条不符合此玩法建议，请勿仅凭高副词条分决定强化。</p>}
      {chosen?.condition && <p className="warehouse-note">套装建议：{chosen.label} · {chosen.condition}</p>}
      <details className="evaluation-assumptions"><summary>评分条件与属性权重</summary><p>武器假设：{build.assumedWeapon?.name ?? '未计武器属性'}。外部暴击率 {options.extraCritRate ?? build.assumedWeapon?.critRate ?? 0}%；外部充能效率 {options.extraEnergyRecharge ?? build.assumedWeapon?.energyRecharge ?? 0}%。</p><p>充能参考 {build.recharge.min}—{build.recharge.max}%：{build.recharge.note}</p><p>只算本件，不默认凑齐2/4件，不计条件套装增益。</p><p>{Object.entries(build.weights).map(([stat, weight]) => STAT_DEFINITIONS[stat as keyof typeof STAT_DEFINITIONS].label + (STAT_DEFINITIONS[stat as keyof typeof STAT_DEFINITIONS].percent ? '%' : '') + ' ' + weight).join(' · ')}</p>{build.notes.map((note, i) => <p key={i}>{note}</p>)}</details>
      <div className="warehouse-metrics"><span>当前适配分<strong>{result?.status === 'ready' ? result.current.toFixed(1) : '—'}</strong></span><span>+20理论范围<strong aria-label="+20理论评分范围">{result?.status === 'ready' ? result.min.toFixed(1) + ' — ' + result.max.toFixed(1) : result?.status === 'needs-verification' ? '需核实' : error ? '计算不可用' : '计算中…'}</strong></span></div>
      {result?.status === 'ready' && <p className="warehouse-note">{result.maxed ? '已满级，范围等于当前分。' : '剩余' + result.remainingEvents + '个强化节点。'} {result.fourth === 'unknown' ? '包含未知第四词条，范围较宽。' : result.fourth === 'known' ? '第四词条按可见待激活值计算，当前分不计入。' : ''}</p>}
      {result?.status === 'needs-verification' && <p className="draft-error">{result.reasons.join(' ')} 原记录保持不变。</p>}{error && <p className="draft-error" role="alert">{error}</p>}
      <p className="warehouse-note">有效副词条：{effective.join('、') || '暂无'}。范围是所有合法强化结果的理论极值，不是期望或升级保证。</p>
    </>}
  </section>
}
