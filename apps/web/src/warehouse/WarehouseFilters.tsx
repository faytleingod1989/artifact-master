import { FIVE_STAR_ARTIFACT_SETS } from '../artifacts/catalog'
import { ARTIFACT_SLOTS } from '../artifacts/types'
import { STAT_DEFINITIONS, STAT_KEYS } from '../artifacts/statModel'
import { DEFAULT_FILTERS, type WarehouseFilters as Filters } from './warehouseModel'

export function WarehouseFilters({ value, onChange }: { value: Filters; onChange: (value: Filters) => void }) {
  const update = <K extends keyof Filters>(key: K, next: Filters[K]) => onChange({ ...value, [key]: next })
  return <aside className="warehouse-filters" aria-label="仓库筛选">
    <div className="warehouse-section-title"><strong>筛选条件</strong><button onClick={() => onChange({ ...DEFAULT_FILTERS })}>重置</button></div>
    <label>搜索圣遗物<input type="search" placeholder="名称、套装或词条" value={value.search} onChange={e => update('search', e.target.value)} /></label>
    <label>套装筛选<select value={value.setKey} onChange={e => update('setKey', e.target.value as Filters['setKey'])}><option value="all">全部套装</option>{FIVE_STAR_ARTIFACT_SETS.map(set => <option key={set.key} value={set.key}>{set.name}</option>)}</select></label>
    <label>部位筛选<select value={value.slot} onChange={e => update('slot', e.target.value as Filters['slot'])}><option value="all">全部部位</option>{ARTIFACT_SLOTS.map(slot => <option key={slot}>{slot}</option>)}</select></label>
    <label>主词条筛选<select value={value.main} onChange={e => update('main', e.target.value as Filters['main'])}><option value="all">全部主词条</option>{STAT_KEYS.filter(key => STAT_DEFINITIONS[key].slots.length).map(key => <option key={key} value={key}>{STAT_DEFINITIONS[key].label}{STAT_DEFINITIONS[key].percent ? '%' : ''}</option>)}</select></label>
    <div className="warehouse-level-range"><label>最低等级<input type="number" min="0" max="20" value={value.minLevel} onChange={e => update('minLevel', Number(e.target.value))} /></label><span>—</span><label>最高等级<input type="number" min="0" max="20" value={value.maxLevel} onChange={e => update('maxLevel', Number(e.target.value))} /></label></div>
    <label>锁定状态<select value={value.locked} onChange={e => update('locked', e.target.value as Filters['locked'])}><option value="all">全部状态</option><option value="locked">已锁定</option><option value="unlocked">未锁定</option></select></label>
    <p className="warehouse-note">★★★★★ 仅五星<br />规则初评仅作参考，不代表伤害最优。</p>
  </aside>
}
