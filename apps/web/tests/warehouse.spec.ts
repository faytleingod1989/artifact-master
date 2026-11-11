import { test, expect } from '@playwright/test'
import showcase from '../src/imports/enka/fixtures/showcase.json' with { type: 'json' }
const slots = ['生之花', '死之羽', '时之沙', '空之杯', '理之冠']
const mains = ['生命值 4780', '攻击力 311', '攻击力 46.6%', '火元素伤害加成 46.6%', '暴击伤害 62.2%']
const library = slots.map((slot, index) => ({ id: index + 1, name: `测试${slot}`, set: '逐影猎人', setKey: 'zhuying-lieren', slot, level: 20, score: 0, main: mains[index], subs: ['暴击率 +3.9%', '元素充能效率 +22.7%', '防御力 +16', '元素精通 +40'], locked: index % 2 === 0, hue: 'blue' }))
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('共 0 件 / 库存 0 件')).toBeVisible()
  await page.evaluate(async records => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('keyval-store', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('keyval')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => { const db = request.result; const tx = db.transaction('keyval', 'readwrite'); const store = tx.objectStore('keyval'); store.put(records, 'artifact-master:artifacts'); store.put([], 'artifact-master:queue'); store.put([], 'artifact-master:trash'); tx.oncomplete = () => { db.close(); resolve() }; tx.onerror = () => reject(tx.error) }
    })
  }, library)
  await page.reload()
  await expect(page.getByText('共 5 件 / 库存 5 件')).toBeVisible()
})
for (const size of [{ width: 1440, height: 920 }, { width: 980, height: 680 }]) {
  test(`warehouse layout and originals ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size)
    for (const name of ['实时录入', '手动录入', '列表视图', '图标视图', '编辑当前圣遗物', '批量移入回收站']) {
      const button = page.getByRole('button', { name, exact: true })
      await expect(button).toBeInViewport({ ratio: 1 })
    }
    for (const slot of slots) {
      const img = page.getByTestId('warehouse-grid').getByRole('img', { name: `逐影猎人·${slot}原版图标` })
      await expect(img).toHaveJSProperty('complete', true)
      const dimensions = await img.evaluate(element => ({ fit: getComputedStyle(element).objectFit, position: getComputedStyle(element).objectPosition, width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height, natural: (element as HTMLImageElement).naturalWidth }))
      expect(dimensions.fit).toBe('contain')
      expect(dimensions.position).toBe('50% 50%')
      expect(dimensions.width).toBeGreaterThanOrEqual(64)
      expect(dimensions.height).toBe(dimensions.width)
      expect(dimensions.natural).toBeGreaterThan(0)
    }
    await page.screenshot({ path: `output/playwright/warehouse-grid-${size.width}.png`, fullPage: true })
    await page.getByRole('button', { name: '列表视图' }).click()
    await expect(page.getByTestId('warehouse-list')).toBeVisible()
    await page.screenshot({ path: `output/playwright/warehouse-list-${size.width}.png`, fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByLabel('搜索圣遗物').fill('不存在')
    await expect(page.locator('.warehouse-empty')).toContainText('没有符合条件的圣遗物')
    await expect(page.getByLabel('圣遗物详情', { exact: true })).toHaveCount(0)
    await page.screenshot({ path: `output/playwright/warehouse-empty-${size.width}.png`, fullPage: true })
  })
}
test('a nonsquare source stays contained and selection survives both views', async ({ page }) => {
  await page.route(/\/originals\/.*\.(png|webp)(\?.*)?$/, route => route.request().resourceType() === 'image' ? route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><rect x="1" y="1" width="238" height="118" fill="#eedaa0" stroke="red" stroke-width="2"/></svg>' }) : route.continue())
  await page.reload()
  const image = page.getByTestId('warehouse-grid').getByRole('img').first()
  await expect(image).toHaveJSProperty('naturalWidth', 240)
  await expect(image).toHaveJSProperty('naturalHeight', 120)
  expect(await image.evaluate(element => getComputedStyle(element).objectFit)).toBe('contain')
  await page.getByLabel('选择测试生之花', { exact: true }).check()
  await page.getByRole('button', { name: '列表视图' }).click()
  await expect(page.getByLabel('选择测试生之花', { exact: true })).toBeChecked()
  await page.screenshot({ path: 'output/playwright/warehouse-nonsquare-list.png', fullPage: true })
})
test('structured entry for five slots persists after reload; duplicates require an explicit choice', async ({ page }) => {
  test.setTimeout(60000)
  await page.setViewportSize({ width: 1440, height: 920 })
  for (const [index, slot] of slots.entries()) {
    await page.getByRole('button', { name: '手动录入', exact: true }).click()
    const form = page.getByRole('dialog', { name: '手动录入圣遗物', exact: true })
    await form.getByRole('combobox', { name: '套装', exact: true }).selectOption('zhuying-lieren')
    await form.getByRole('combobox', { name: '部位', exact: true }).selectOption(slot)
    await form.getByLabel('等级', { exact: true }).fill('0')
    if (index > 1) await form.getByRole('combobox', { name: '主词条类型', exact: true }).selectOption(index === 4 ? 'critDamage' : 'atkPercent')
    await form.getByRole('button', { name: /使用成长表/ }).click()
    for (const [i, key, value] of [[1, 'defFlat', '16'], [2, 'elementalMastery', '23'], [3, 'energyRecharge', '5.2']] as const) {
      await form.getByRole('button', { name: '增加副词条' }).click()
      await form.getByRole('combobox', { name: `副词条${i}类型`, exact: true }).selectOption(key)
      await form.getByLabel(`副词条${i}数值`, { exact: true }).fill(value)
    }
    if (index === 4) {
      await form.getByRole('button', { name: '增加副词条' }).click()
      await form.getByRole('combobox', { name: '副词条4类型', exact: true }).selectOption('critRate')
      await form.getByLabel('副词条4数值', { exact: true }).fill('999')
      await expect(form.getByRole('button', { name: '保存圣遗物' })).toBeDisabled()
      await form.getByLabel('副词条4数值', { exact: true }).fill('3.9')
    }
    await form.getByRole('button', { name: '保存圣遗物', exact: true }).click()
    const review = page.getByRole('dialog', { name: '确认入库', exact: true })
    await expect(review.getByLabel('处理方式1')).toHaveValue('add')
    await review.getByRole('button', { name: '确认并入库' }).dblclick()
    await expect(review.getByRole('status')).toContainText('新增 1 件')
    await review.getByRole('button', { name: '完成', exact: true }).click()
    await expect(page.getByText(`共 ${index + 6} 件 / 库存 ${index + 6} 件`, { exact: true })).toBeVisible()
  }
  await page.reload()
  await expect(page.getByText('共 10 件 / 库存 10 件', { exact: true })).toBeVisible()
  await page.getByLabel('搜索圣遗物').fill('理之冠')
  await page.getByLabel('锁定状态').selectOption('unlocked')
  await page.getByRole('button', { name: /查看/ }).filter({ has: page.locator('.warehouse-card-copy') }).first().click()
  await page.getByRole('button', { name: '复制录入', exact: true }).click()
  const form = page.getByRole('dialog', { name: '手动录入圣遗物', exact: true })
  await form.getByRole('button', { name: '保存圣遗物', exact: true }).click()
  const review = page.getByRole('dialog', { name: '确认入库', exact: true })
  await expect(review.getByLabel('处理方式1')).toHaveValue('skip')
  await review.getByLabel('处理方式1').selectOption('add')
  await review.getByRole('button', { name: '确认并入库' }).click()
  await expect(review.getByRole('status')).toContainText('新增 1 件')
  await review.getByRole('button', { name: '完成', exact: true }).click()
  await page.reload()
  await expect(page.getByText('共 11 件 / 库存 11 件', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'output/playwright/manual-entry-persisted.png', fullPage: true })
})
test('UID showcase UI uses one explicit request and confirms selected equipment into the same warehouse', async ({ page }) => {
  await page.addInitScript(payload => {
    const bridgeWindow = window as unknown as { artifactDesktop: unknown; uidTestQueries: number }
    bridgeWindow.uidTestQueries = 0
    bridgeWindow.artifactDesktop = { queryShowcase: async () => { bridgeWindow.uidTestQueries++; return { ok: true, payload, fetchedAt: Date.now(), refreshAt: Date.now() + 60000, cached: false } }, listCaptureSources: async () => [], setRealtimeShortcut: async () => true, onRealtimeCapture: () => () => {} }
  }, showcase)
  await page.reload()
  await page.getByRole('button', { name: 'UID 展柜导入', exact: true }).click()
  const uidDialog = page.getByRole('dialog', { name: 'UID 展柜导入', exact: true })
  await expect(uidDialog.getByText(/第三方 Enka/)).toBeVisible()
  await uidDialog.getByLabel('公开展柜 UID', { exact: true }).fill('123456789')
  expect(await page.evaluate(() => (window as unknown as { uidTestQueries: number }).uidTestQueries)).toBe(0)
  await uidDialog.getByRole('button', { name: '查询公开展柜', exact: true }).click()
  await expect(uidDialog.getByText(/5 件五星/)).toBeVisible()
  await expect(uidDialog.getByRole('button', { name: '查询公开展柜', exact: true })).toBeDisabled()
  expect(await page.evaluate(() => localStorage.getItem('artifact-master:remembered-uid-v1'))).toBeNull()
  await expect(uidDialog.getByLabel('选择展柜老兵的容颜', { exact: true })).not.toBeChecked()
  await uidDialog.getByRole('button', { name: '核对所选圣遗物' }).click()
  const review = page.getByRole('dialog', { name: '确认入库', exact: true })
  await review.getByRole('button', { name: '确认并入库' }).click()
  await expect(review.getByRole('status')).toContainText('新增 4 件')
  await review.getByRole('button', { name: '完成', exact: true }).click()
  await expect(page.getByText('共 9 件 / 库存 9 件', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { uidTestQueries: number }).uidTestQueries)).toBe(1)
  await page.reload()
  await expect(page.getByText('共 9 件 / 库存 9 件', { exact: true })).toBeVisible()
})
