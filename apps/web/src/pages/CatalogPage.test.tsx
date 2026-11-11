import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from '../App'
vi.mock('../storage/libraryRepository', () => ({ loadLibrary: async () => ({ artifacts: [], trash: [], queueIds: [], assets: {} }), saveLibrary: async () => undefined }))
beforeEach(() => { localStorage.clear(); vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined) })
afterEach(() => { cleanup(); vi.restoreAllMocks() })
async function openCatalog() {
  render(<App />); await screen.findByText('已保存', { exact: true })
  const user = userEvent.setup()
  await user.click(within(screen.getByRole('navigation', { name: '主导航' })).getByRole('button', { name: '数据图鉴' }))
  return user
}
test('catalog uses verified piece names and main growth even with an empty warehouse', async () => {
  const user = await openCatalog()
  await user.type(screen.getByLabelText('搜索套装'), '纺月')
  await user.click(screen.getByRole('button', { name: '纺月的夜歌' }))
  expect(screen.getByText('司信者的圣冕')).toBeInTheDocument()
  expect(screen.getByText('效果资料暂未收录')).toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('图鉴部位'), '生之花')
  await user.selectOptions(screen.getByLabelText('图鉴等级'), '20')
  expect(screen.getByLabelText('合法主词条与成长值')).toHaveTextContent('生命值 4780')
  await user.selectOptions(screen.getByLabelText('图鉴部位'), '死之羽')
  expect(screen.getByLabelText('合法主词条与成长值')).toHaveTextContent('攻击力 311')
  await user.selectOptions(screen.getByLabelText('图鉴部位'), '空之杯')
  expect(screen.getByLabelText('合法主词条与成长值')).not.toHaveTextContent('元素充能效率')
  await user.click(within(screen.getByRole('navigation', { name: '主导航' })).getByRole('button', { name: '圣遗物仓库' }))
  expect(screen.getByText('共 0 件 / 库存 0 件')).toBeInTheDocument()
  await user.click(within(screen.getByRole('navigation', { name: '主导航' })).getByRole('button', { name: '数据图鉴' }))
  expect(screen.getByLabelText('搜索套装')).toHaveValue('纺月')
  expect(screen.getByLabelText('图鉴部位')).toHaveValue('空之杯')
})
