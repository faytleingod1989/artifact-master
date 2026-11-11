import { test, expect, type Page } from '@playwright/test'

const titles = ['圣遗物仓库', '角色配装', '推荐方案', '强化队列', '数据图鉴', '本地素材', '回收站']
const records = ['生之花', '死之羽', '时之沙', '空之杯', '理之冠'].map((slot, i) => ({
  id: i + 1, name: `分页测试${slot}`, set: '逐影猎人', setKey: 'zhuying-lieren', slot,
  level: 0, score: 0, main: ['生命值 717', '攻击力 47', '攻击力 7%', '攻击力 7%', '暴击伤害 9.3%'][i],
  subs: ['防御力 +16', '元素精通 +23', '元素充能效率 +5.2%'], locked: false, hue: 'blue',
}))
async function navigate(page: Page, title: string, mobile = false) {
  await page.getByRole('navigation', { name: mobile ? '窄屏导航' : '主导航', exact: true }).getByRole('button', { name: title, exact: true }).click()
}
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('已保存', { exact: true })).toBeVisible()
  await page.getByText('仓库备份', { exact: true }).click()
  await page.getByText('导入 JSON', { exact: true }).locator('input').setInputFiles({
    name: 'pages-synthetic.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: 2, artifacts: records, trash: [], queueIds: [1, 2, 3, 4, 5], assets: {} })),
  })
  await expect(page.getByText('共 5 件 / 库存 5 件', { exact: true })).toBeVisible()
})
for (const size of [{ width: 1440, height: 920 }, { width: 980, height: 680 }]) {
  test(`all seven real pages and contained originals ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size)
    const url = page.url()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    for (const [index, title] of titles.entries()) {
      await navigate(page, title)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
      if (title !== '圣遗物仓库') await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
      await expect(page.locator('[data-page]')).toHaveCount(1)
      await expect(page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: title, exact: true })).toHaveAttribute('aria-current', 'page')
      expect(page.url()).toBe(url)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      for (const img of await page.locator('[data-page] .artifact-glyph img, [data-page] .character-portrait-image').all()) {
        await expect(img).toHaveJSProperty('complete', true)
        expect(await img.evaluate(element => getComputedStyle(element).objectFit)).toBe('contain')
        expect(await img.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
      }
      await page.screenshot({ path: `output/playwright/pages-${size.width}-${index}.png`, fullPage: true })
    }
    expect(errors).toEqual([])
  })
}
test('filtered warehouse selection survives pages and hidden queue target requires an explicit reveal', async ({ page }) => {
  await page.getByLabel('搜索圣遗物').fill('生之花')
  await page.getByLabel('排序方式').selectOption('cv')
  await page.getByLabel('选择分页测试生之花', { exact: true }).check()
  await page.getByRole('button', { name: '列表视图', exact: true }).click()
  await navigate(page, '数据图鉴')
  await page.getByLabel('搜索套装').fill('纺月')
  await page.getByRole('button', { name: '纺月的夜歌', exact: true }).click()
  await expect(page.getByText('司信者的圣冕', { exact: true })).toBeVisible()
  await navigate(page, '圣遗物仓库')
  await expect(page.getByLabel('搜索圣遗物')).toHaveValue('生之花')
  await expect(page.getByLabel('排序方式')).toHaveValue('cv')
  await expect(page.getByLabel('选择分页测试生之花', { exact: true })).toBeChecked()
  await expect(page.getByTestId('warehouse-list')).toBeVisible()
  await navigate(page, '强化队列')
  await page.getByLabel('队列藏品：分页测试空之杯', { exact: true }).getByRole('button', { name: '查看库存件', exact: true }).click()
  await expect(page.getByText(/目标藏品被当前筛选/)).toBeVisible()
  await expect(page.getByLabel('搜索圣遗物')).toHaveValue('生之花')
  await page.getByRole('button', { name: '清除筛选并查看', exact: true }).click()
  await expect(page.getByLabel('圣遗物详情', { exact: true })).toContainText('分页测试空之杯')
  await expect(page.getByLabel('选择分页测试生之花', { exact: true })).toBeChecked()
  await navigate(page, '数据图鉴')
  await expect(page.getByLabel('搜索套装')).toHaveValue('纺月')
})
test('narrow screen navigation exposes all seven entries without document overflow', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 900 })
  const navigation = page.getByRole('navigation', { name: '窄屏导航', exact: true })
  await expect(navigation.getByRole('button')).toHaveCount(7)
  for (const title of titles) {
    await navigate(page, title, true)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.screenshot({ path: 'output/playwright/pages-mobile-navigation.png', fullPage: true })
})

test('a nonsquare custom portrait remains contained across assets characters and reopening', async ({ page }) => {
  const source = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 240; canvas.height = 120
    const context = canvas.getContext('2d')!; context.fillStyle = '#d8b269'; context.fillRect(0, 0, 240, 120)
    return canvas.toDataURL('image/png')
  })
  await navigate(page, '本地素材')
  await page.locator('label.asset-row').filter({ has: page.getByRole('img', { name: '芙宁娜', exact: true }) }).locator('input').setInputFiles({ name: 'nonsquare-test.png', mimeType: 'image/png', buffer: Buffer.from(source.split(',')[1], 'base64') })
  const check = async (name: string) => {
    const img = page.getByRole('img', { name, exact: true })
    await expect(img).toHaveJSProperty('naturalWidth', 240)
    await expect(img).toHaveJSProperty('naturalHeight', 120)
    expect(await img.evaluate(element => getComputedStyle(element).objectFit)).toBe('contain')
  }
  await check('芙宁娜')
  await navigate(page, '角色配装')
  await check('芙宁娜 的头像')
  await expect(page.getByText('已保存', { exact: true })).toBeVisible()
  await page.reload()
  await navigate(page, '本地素材')
  await check('芙宁娜')
  await page.screenshot({ path: 'output/playwright/pages-nonsquare-custom-portrait.png', fullPage: true })
})
