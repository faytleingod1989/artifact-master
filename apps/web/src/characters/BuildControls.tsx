import type { ScoringOptions } from '../scoring'
import { getBuildProfile, getCharacterProfile } from './profiles'
export function BuildControls({ name, options = {}, onChange }: { name: string; options?: ScoringOptions; onChange?: (next: ScoringOptions) => void }) {
  const profile = getCharacterProfile(name), build = getBuildProfile(name, options.buildId)
  if (!profile || !build) return null
  const patch = (next: Partial<ScoringOptions>) => onChange?.({ ...options, ...next })
  const number = (value: string, max: number) => value.trim() === '' ? undefined : Math.min(max, Math.max(0, Number(value) || 0))
  return <section className="build-controls" aria-label="配装规则设置">
    <label>配装玩法<select aria-label="配装玩法" value={build.id} onChange={e => patch({ buildId: e.target.value, extraCritRate: undefined, extraEnergyRecharge: undefined })}>{profile.builds.map(b => <option value={b.id} key={b.id}>{b.label}</option>)}</select></label>
    <label>套装筛选<select aria-label="套装筛选" value={options.setMode ?? 'recommended'} onChange={e => patch({ setMode: e.target.value as ScoringOptions['setMode'] })}><option value="recommended">优先凑齐建议套装</option><option value="any">不限套装，比较散件</option></select></label>
    <details className="build-extra"><summary>武器、队友与条件设置</summary><p className="page-note">武器假设：{build.assumedWeapon?.name ?? '未指定，以下额外词条默认按0计'}。可按实际装备改写；不会读取游戏面板。角色90级突破已单独计入。</p>
      <label>武器等额外暴击率%<input aria-label="额外暴击率" type="number" min="0" max="200" step="0.1" value={options.extraCritRate ?? build.assumedWeapon?.critRate ?? 0} onChange={e => patch({ extraCritRate: number(e.target.value, 200) })} /></label>
      <label>武器等额外充能%<input aria-label="额外充能效率" type="number" min="0" max="500" step="0.1" value={options.extraEnergyRecharge ?? build.assumedWeapon?.energyRecharge ?? 0} onChange={e => patch({ extraEnergyRecharge: number(e.target.value, 500) })} /></label>
      <label className="build-check"><input type="checkbox" checked={options.includeSetBonuses ?? false} onChange={e => patch({ includeSetBonuses: e.target.checked })} />确认套装条件满足，估算其额外暴击</label><p className="page-note">只在实际凑齐对应4件时计入穹境30%、风起20%、逐影36%、黑曜40%、幻灭/血红16%。其他天赋、武器或队友的条件暴击请填入额外暴击；未模拟队伍伤害。</p>
    </details>
  </section>
}
