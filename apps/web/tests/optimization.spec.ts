import { test, expect, type Page } from '@playwright/test'

const records = Array.from({ length: 6 }, (_, index) => ({
  id: index + 1, name: `队列验证${index + 1}`, set: '逐影猎人', setKey: 'zhuying-lieren',
  slot: '生之花', level: 0, score: 0, main: '生命值 717',
  subs: ['攻击力 +14', '防御力 +16', '元素精通 +23'], locked: false, hue: 'blue',
}))

async function restore(page: Page, payload: unknown) {
  const menu = page.locator('.warehouse-backup-menu')
  if (await menu.getAttribute('open') === null) await menu.locator('summary').click()
  await menu.locator('input[type=file]').setInputFiles({
    name: 'optimization-backup.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload)),
  })
}

async function goPage(page: Page, name: string) {
  await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name, exact: true }).click()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '手动录入', exact: true })).toBeEnabled()
})

test('five queued records are visible, removable and persistent without deleting inventory', async ({ page }) => {
  page.on('dialog', dialog => dialog.type() === 'confirm' ? dialog.accept() : dialog.dismiss())
  await restore(page, { version: 2, artifacts: records, trash: [], queueIds: [1, 2, 3, 4, 5], assets: {} })
  const queue = page.locator('#upgrade-queue')
  await expect(page.getByText('共 6 件 / 库存 6 件', { exact: true })).toBeVisible()
  await goPage(page, '强化队列')
  await expect(queue).toContainText('5/5')
  for (const record of records.slice(0, 5)) await expect(queue.getByRole('button', { name: `移出队列：${record.name}`, exact: true })).toBeVisible()
  for (const width of [1440, 980]) {
    await page.setViewportSize({ width, height: 920 })
    await queue.screenshot({ path: `output/playwright/optimized-queue-${width}.png` })
  }
  await goPage(page, '圣遗物仓库')
  await page.getByRole('button', { name: '查看队列验证6', exact: true }).click()
  await page.getByRole('button', { name: '加入强化队列', exact: true }).click()
  await expect(page.getByText(/队列已满/)).toBeVisible()
  await goPage(page, '强化队列')
  await expect(queue).toContainText('5/5')
  await expect(queue.getByRole('button', { name: '移出队列：队列验证6', exact: true })).toHaveCount(0)
  await queue.getByRole('button', { name: '移出队列：队列验证1', exact: true }).click()
  await expect(queue).toContainText('4/5')
  await goPage(page, '圣遗物仓库')
  await page.getByRole('button', { name: '加入强化队列', exact: true }).click()
  await goPage(page, '强化队列')
  await expect(queue.getByRole('button', { name: '移出队列：队列验证6', exact: true })).toBeVisible()
  await expect(page.getByText('已保存', { exact: true })).toBeVisible()
  await page.reload()
  await goPage(page, '强化队列')
  await expect(queue).toContainText('5/5')
  await expect(queue.getByRole('button', { name: '移出队列：队列验证1', exact: true })).toHaveCount(0)
  await queue.getByRole('button', { name: '清空队列', exact: true }).click()
  await expect(queue).toContainText('0/5')
  await expect(page.getByText('已保存', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('共 6 件 / 库存 6 件', { exact: true })).toBeVisible()
  await goPage(page, '强化队列')
  await expect(queue).toContainText('0/5')
})

test('old backup resets inherited queue and a corrupt backup cannot replace it', async ({ page }) => {
  const confirm = (dialog: import('@playwright/test').Dialog) => dialog.type() === 'confirm' ? dialog.accept() : dialog.dismiss()
  page.on('dialog', confirm)
  await restore(page, { version: 2, artifacts: records, trash: [], queueIds: [1, 2], assets: {} })
  await goPage(page, '强化队列')
  await expect(page.locator('#upgrade-queue')).toContainText('2/5')
  await goPage(page, '圣遗物仓库')
  const replacement = { ...records[0], name: '旧版备份恢复藏品' }
  await restore(page, { version: 1, artifacts: [replacement], trash: [], assets: {} })
  await expect(page.getByText('共 1 件 / 库存 1 件', { exact: true })).toBeVisible()
  await goPage(page, '强化队列')
  await expect(page.locator('#upgrade-queue')).toContainText('0/5')
  await expect(page.getByText('已保存', { exact: true })).toBeVisible()
  await goPage(page, '圣遗物仓库')
  page.off('dialog', confirm)
  const error = page.waitForEvent('dialog')
  await restore(page, { version: 1, artifacts: [{ ...replacement, subs: [null] }], trash: [] })
  const dialog = await error
  expect(dialog.type()).toBe('alert')
  expect(dialog.message()).toMatch(/副词条|格式/)
  await dialog.dismiss()
  await page.reload()
  await expect(page.getByText('共 1 件 / 库存 1 件', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '查看旧版备份恢复藏品', exact: true })).toBeVisible()
  await goPage(page, '强化队列')
  await expect(page.locator('#upgrade-queue')).toContainText('0/5')
})
