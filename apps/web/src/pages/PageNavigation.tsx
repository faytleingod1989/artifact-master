import { PAGE_ITEMS, type PageId } from './navigation'

export function PageNavigation({ active, onNavigate, disabled, mobile = false }: { active: PageId; onNavigate: (page: PageId) => void; disabled: boolean; mobile?: boolean }) {
  return <nav className={mobile ? 'mobile-nav' : undefined} aria-label={mobile ? '窄屏导航' : '主导航'}>{PAGE_ITEMS.map(({ id, title, icon: Icon }) => <button key={id} disabled={disabled} aria-current={active === id ? 'page' : undefined} className={`${mobile ? '' : 'nav-item'} ${active === id ? 'active' : ''}`} onClick={() => onNavigate(id)}><Icon size={18} /><span>{title}</span></button>)}</nav>
}
