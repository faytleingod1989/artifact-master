import { _electron as electron, expect } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const releaseDir = process.env.ARTIFACT_TEST_RELEASE_DIR || 'release-fullpage-candidate-r3'
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'artifact-offline-test-'))
const appArchive = path.join(webRoot, releaseDir, 'win-unpacked/resources/app.asar')
await fs.access(appArchive)
// Use the actual packaged archive under a tilde-containing extraction directory:
// Chromium and Node spell this entry URL differently, as in Windows 8.3 TEMP.
const portableResources = path.join(profile, 'portable~entry', 'resources')
await fs.mkdir(portableResources, { recursive: true })
const portableArchive = path.join(portableResources, 'app.asar')
await fs.copyFile(appArchive, portableArchive)
// Copy actual extra resources, not a Python installation on this machine.
await fs.cp(path.join(webRoot, releaseDir, 'win-unpacked/resources/ocr-native'), path.join(portableResources, 'ocr-native'), { recursive: true })
await fs.cp(path.join(webRoot, releaseDir, 'win-unpacked/resources/capture-native'),path.join(portableResources,'capture-native'),{recursive:true})
for(const name of ['WindowFrame.ps1','PageScanInput.ps1']){
  const bundled=await fs.readFile(path.join(portableResources,'capture-native',name)),source=await fs.readFile(path.join(webRoot,'native-capture',name))
  expect(crypto.createHash('sha256').update(bundled).digest('hex')).toBe(crypto.createHash('sha256').update(source).digest('hex'))
}
const env = { ...process.env, ARTIFACT_TEST_PROFILE: profile, ARTIFACT_TEST_MAIN: path.join(portableArchive, 'electron/main.cjs') }
delete env.ELECTRON_RUN_AS_NODE
const errors = []
const launch = () => electron.launch({ executablePath: path.join(webRoot, 'node_modules/electron/dist/electron.exe'), args: [path.join(webRoot, 'tests/electron-smoke-entry.cjs')], env, timeout: 30000 })
const goPage = (page, name) => page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name, exact: true }).click()
let app = await launch()
let priorNetwork = []
try {
  let page = await app.firstWindow()
  const packagedHashes=await app.evaluate(()=>global.artifactTestPackageHashes)
  for(const [name,hash] of Object.entries(packagedHashes))expect(hash).toBe(crypto.createHash('sha256').update(await fs.readFile(path.join(webRoot,'electron',name))).digest('hex'))
  const expectedDistHashes={}
  const distRoot=path.join(webRoot,'dist-local')
  async function inspectBuiltScripts(directory){
    for(const entry of await fs.readdir(directory,{withFileTypes:true})){
      const file=path.join(directory,entry.name)
      if(entry.isDirectory())await inspectBuiltScripts(file)
      else if(entry.isFile()&&/\.(?:js|css|html)$/.test(entry.name))expectedDistHashes[path.relative(distRoot,file).replace(/\\/g,'/')]=crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')
    }
  }
  await inspectBuiltScripts(distRoot)
  expect(Object.keys(expectedDistHashes).length).toBeGreaterThan(0)
  expect(await app.evaluate(()=>global.artifactTestDistHashes)).toEqual(expectedDistHashes)
  page.on('pageerror', error => errors.push(error.message))
  await expect(page.getByText('共 0 件 / 库存 0 件', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => typeof window.artifactDesktop.nativeOcr?.open)).toBe('function')
  expect(await page.evaluate(() => typeof window.artifactDesktop.pageScan?.open)).toBe('function')
  expect(await page.evaluate(() => typeof window.artifactDesktop.pageScan?.prepare)).toBe('function')
  expect(await page.evaluate(() => typeof window.artifactDesktop.pageScan?.anchor)).toBe('function')
  expect(await page.evaluate(() => typeof window.artifactDesktop.pageScan?.resetPage)).toBe('function')
  expect(await page.evaluate(async()=>{try{await window.artifactDesktop.pageScan.open('screen:0:0');return false}catch{return true}})).toBe(true)
  const entryUrl = page.url()
  expect(entryUrl).toContain('portable~entry')
  await page.getByRole('button', { name: '实时录入', exact: true }).click()
  await expect(page.getByLabel('成功识别提示音', { exact: true })).toBeChecked()
  await page.getByLabel('成功识别提示音', { exact: true }).uncheck()
  await page.getByRole('button', { name: '刷新窗口', exact: true }).click()
  await expect(page.locator('.capture-source').first()).toBeVisible({ timeout: 30000 })
  const realCaptureSources = await page.locator('.capture-source').count()
  // Test the real preload/IPC/native registration, not a renderer API fixture.
  // No game inputs or screen capture session are started.
  try {
    const registered = await page.evaluate(() => window.artifactDesktop.setRealtimeShortcut(true))
    // Explicit conflict scenario: another running instance owns F8. This does
    // not replace the normal free-key acceptance; report the scenario below.
    expect(registered).toBe(process.env.ARTIFACT_TEST_F8_OCCUPIED !== '1')
    expect(await app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('F8'))).toBe(process.env.ARTIFACT_TEST_F8_OCCUPIED !== '1')
  } finally { await page.evaluate(() => window.artifactDesktop.setRealtimeShortcut(false)) }
  expect(await app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('F8'))).toBe(false)
  await page.getByRole('button', { name: '关闭实时录入', exact: true }).click()
  await page.getByRole('button', { name: '实时录入', exact: true }).click()
  await expect(page.getByLabel('成功识别提示音', { exact: true })).not.toBeChecked()
  await page.getByRole('button', { name: '关闭实时录入', exact: true }).click()
  for (const name of ['角色配装', '推荐方案', '强化队列', '数据图鉴', '本地素材', '回收站', '圣遗物仓库']) {
    await goPage(page, name)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
    await expect(page.locator('[data-page]')).toHaveCount(1)
    expect(page.url()).toBe(entryUrl)
  }
  await goPage(page, '角色配装')
  const registry = JSON.parse(await fs.readFile(path.resolve(webRoot, '../../docs/artifacts/character-portraits.source.json'), 'utf8'))
  const portraits = registry.entries.map(row => [row.displayName ?? row.name, row.iconName])
  const portraitUrls = []
  for (const [name, icon] of portraits) {
    const img = page.getByRole('img', { name: `${name} 的头像`, exact: true })
    await expect(img).toHaveJSProperty('naturalWidth', 256)
    await expect(img).toHaveJSProperty('naturalHeight', 256)
    const source = await img.getAttribute('src'); expect(source).toContain(icon); portraitUrls.push(source)
    expect(await img.evaluate(element => getComputedStyle(element).objectFit)).toBe('contain')
  }
  expect(new Set(portraitUrls).size).toBe(121)
  await expect(page.getByRole('heading', { name: '角色档案 121 位', exact: true })).toBeVisible()
  await page.getByRole('button', { name: /^风元素/ }).click()
  const readNames = () => page.locator('.character-directory [data-character-name]').evaluateAll(nodes => nodes.map(el => el.getAttribute('data-character-name')))
  const stars = await page.locator('.character-directory [data-rarity]').evaluateAll(nodes => nodes.map(el => Number(el.getAttribute('data-rarity'))))
  expect(stars).toEqual([...stars].sort((a,b) => b-a))
  expect((await readNames()).indexOf('布伦妮')).toBeLessThan((await readNames()).indexOf('雅珂达'))
  await page.getByLabel('角色新旧排序').selectOption('oldest')
  expect((await readNames()).indexOf('雅珂达')).toBeLessThan((await readNames()).indexOf('布伦妮'))
  await page.getByRole('button', { name: /^冰元素/ }).click()
  await page.getByLabel('搜索角色').fill('旅行者')
  await page.getByRole('button', { name: /旅行者.*5★/ }).click()
  await expect(page.getByLabel('配装玩法', { exact: true })).toHaveValue('cryo')
  await expect(page.getByText(/5★ · 冰元素 · 单手剑/)).toBeVisible()
  await page.getByLabel('搜索角色').fill('')
  await page.getByRole('button', { name: /^全部角色/ }).click()
  await page.getByLabel('角色新旧排序').selectOption('newest')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ width: 2200, height: 920 }))
  await fs.mkdir(path.join(webRoot, 'output/playwright'), { recursive: true })
  await page.locator('.character-tabs').screenshot({ path: path.join(webRoot, 'output/playwright/character-portraits-packaged.png') })
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ width: 1440, height: 920 }))
  await goPage(page, '圣遗物仓库')
  const privateManifest = JSON.parse(await fs.readFile(path.resolve(webRoot, '../../tests/private/ocr/manifest.json'), 'utf8'))
  const level17 = privateManifest.cases.find(item => item.id === 'flower-shadow-level17')
  await page.getByText('更多录入', { exact: true }).click()
  await page.getByRole('button', { name: '识别截图', exact: true }).click()
  await page.getByLabel('选择圣遗物截图').setInputFiles(path.resolve(webRoot, '../../tests/private/ocr', level17.file))
  const level17Review = page.getByRole('dialog', { name: '确认入库', exact: true })
  await expect(level17Review).toBeVisible({ timeout: 60000 })
  const level17Summary = page.getByLabel('自动识别信息', { exact: true })
  for (const text of ['影中沉凝的幻灭', '+17', '生命值 4171', '暴击伤害 6.2%', '攻击力 27', '暴击率 3.5%', '元素精通 63']) await expect(level17Summary).toContainText(text)
  await expect(page.getByLabel('区域X', { exact: true })).toHaveCount(0)
  const evidence = path.join(os.tmpdir(), 'ys-ocr-20261016'); await fs.mkdir(evidence, { recursive: true })
  await page.screenshot({ path: path.join(evidence, 'level17-packaged.png'), fullPage: false })
  await level17Review.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.getByText('共 0 件 / 库存 0 件', { exact: true })).toBeVisible()
  if (!await page.getByRole('button', { name: '识别截图', exact: true }).isVisible()) await page.getByText('更多录入', { exact: true }).click()
  await page.getByRole('button', { name: '识别截图', exact: true }).click()
  await page.getByLabel('选择圣遗物截图').setInputFiles(path.resolve(webRoot, '../../tests/private/ocr/flower-shadow-level20-compare.png'))
  const v5Review = page.getByRole('dialog', { name: '确认入库', exact: true })
  await expect(v5Review).toBeVisible({ timeout: 60000 })
  for (const text of ['影中沉凝的幻灭', '+20', '生命值 4780', '攻击力 9.9%', '元素充能效率 6.5%', '暴击伤害 28%', '暴击率 6.2%']) await expect(page.getByLabel('自动识别信息', { exact: true })).toContainText(text)
  await v5Review.getByText('查看 OCR 原文', { exact: true }).click()
  await expect(v5Review.locator('.review-preview pre')).toContainText('PP-OCRv5-server')
  await page.screenshot({ path: path.join(evidence, 'v5-new-source-summary.png'), fullPage: false })
  await v5Review.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.getByText('共 0 件 / 库存 0 件', { exact: true })).toBeVisible()
  // Real offline file:// OCR must reject the effect-covered original explicitly,
  // not silently accept plausible hidden values or request a fresh frame.
  if (!await page.getByRole('button', { name: '识别截图', exact: true }).isVisible()) await page.getByText('更多录入', { exact: true }).click()
  await page.getByRole('button', { name: '识别截图', exact: true }).click()
  await page.getByLabel('选择圣遗物截图').setInputFiles(path.resolve(webRoot, '../../tests/private/ocr/flower-shadow-level20-effects.png'))
  const effectDialog = page.getByRole('dialog', { name: '识别圣遗物截图', exact: true })
  await expect(effectDialog.getByRole('alert')).toContainText('文字被亮光或特效遮挡', { timeout: 60000 })
  await expect(effectDialog.getByRole('alert')).not.toContainText('元素充能效率数值精度异常')
  await expect(page.getByRole('dialog', { name: '确认入库', exact: true })).toHaveCount(0)
  await page.screenshot({ path: path.join(evidence, 'effect-packaged-rejected.png'), fullPage: false })
  await effectDialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.getByText('共 0 件 / 库存 0 件', { exact: true })).toBeVisible()
  const sample = privateManifest.cases.find(item => item.id === 'flower-furnace')
  if (!await page.getByRole('button', { name: '识别截图', exact: true }).isVisible()) await page.getByText('更多录入', { exact: true }).click()
  await page.getByRole('button', { name: '识别截图', exact: true }).click()
  await page.getByLabel('选择圣遗物截图').setInputFiles(path.resolve(webRoot, '../../tests/private/ocr', sample.file))
  // This is the packaged real worker under file://, not a stubbed OCR result.
  await expect(page.getByRole('dialog', { name: '确认入库', exact: true })).toBeVisible({ timeout: 60000 })
  await expect(page.getByLabel('处理方式1')).toHaveValue('add')
  await expect(page.getByLabel('自动识别信息', { exact: true })).toContainText('生命值 4780')
  await expect(page.getByLabel('区域X', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '确认并入库', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '确认入库', exact: true }).getByRole('status')).toContainText('新增 1 件')
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await page.getByRole('button', { name: '手动录入', exact: true }).click()
  const manual = page.getByRole('dialog', { name: '手动录入圣遗物', exact: true })
  await manual.getByRole('combobox', { name: '套装', exact: true }).selectOption('zhuying-lieren')
  await manual.getByRole('combobox', { name: '部位', exact: true }).selectOption('生之花')
  await manual.getByLabel('等级', { exact: true }).fill('0')
  await manual.getByRole('button', { name: /使用成长表/ }).click()
  for (const [i, key, value] of [[1, 'atkFlat', '14'], [2, 'defFlat', '16'], [3, 'elementalMastery', '23']]) {
    await manual.getByRole('button', { name: '增加副词条' }).click()
    await manual.getByRole('combobox', { name: `副词条${i}类型`, exact: true }).selectOption(key)
    await manual.getByLabel(`副词条${i}数值`, { exact: true }).fill(value)
  }
  await manual.getByRole('button', { name: '保存圣遗物', exact: true }).click()
  await page.getByRole('button', { name: '确认并入库', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '确认入库', exact: true }).getByRole('status')).toContainText('新增 1 件')
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await page.reload()
  await expect(page.getByText('共 2 件 / 库存 2 件', { exact: true })).toBeVisible()
  priorNetwork = await app.evaluate(() => global.artifactTestNetwork)
  await app.close(); app = await launch(); page = await app.firstWindow()
  page.on('pageerror', error => errors.push(error.message))
  await expect(page.getByText('共 2 件 / 库存 2 件', { exact: true })).toBeVisible()
  const original = page.getByTestId('warehouse-grid').getByRole('img', { name: '逐影猎人·生之花原版图标' })
  await expect(original).toHaveJSProperty('complete', true)
  expect(await original.evaluate(img => ({ fit: getComputedStyle(img).objectFit, width: img.naturalWidth > 0 }))).toEqual({ fit: 'contain', width: true })
  await page.getByTestId('warehouse-grid').getByRole('button', { name: /^查看/ }).filter({ hasText: '逐影猎人' }).click()
  await page.getByRole('button', { name: '加入强化队列', exact: true }).click()
  await goPage(page, '强化队列')
  await expect(page.locator('#upgrade-queue')).toContainText('1/5')
  await page.reload()
  await goPage(page, '强化队列')
  await expect(page.locator('#upgrade-queue')).toContainText('1/5')
  await goPage(page, '圣遗物仓库')
  await page.getByText('仓库备份', { exact: true }).click()
  const backup = path.join(profile, 'backup.json')
  // Electron downloads belong to its Session, not Playwright's browser context.
  await app.evaluate(({ session }, savePath) => {
    global.artifactTestDownload = 'waiting'
    session.defaultSession.once('will-download', (_event, item) => {
      item.setSavePath(savePath)
      item.once('done', (_event, state) => { global.artifactTestDownload = state })
    })
  }, backup)
  await page.getByRole('button', { name: '导出 JSON', exact: true }).click()
  await expect.poll(() => app.evaluate(() => global.artifactTestDownload)).toBe('completed')
  const payload = JSON.parse(await fs.readFile(backup, 'utf8'))
  if (payload.artifacts.length !== 2 || !payload.artifacts.some(record => record.main === '生命值 4780')) throw new Error('Packaged backup lost the saved record')
  const queuedRecord = payload.artifacts.find(record => record.set === '逐影猎人')
  expect(payload.queueIds).toEqual([queuedRecord.id])
  // A malformed backup must leave both the visible and persisted warehouse intact.
  const badPayload = { ...payload, artifacts: [{ ...queuedRecord, subs: [null] }] }
  const badBackupFeedback = page.waitForEvent('dialog')
  await page.getByText('导入 JSON', { exact: true }).locator('input').setInputFiles({ name: 'bad-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(badPayload)) })
  const badBackupDialog = await badBackupFeedback
  expect(badBackupDialog.type()).toBe('alert')
  expect(badBackupDialog.message()).toMatch(/失败|副词条|格式|非法/)
  await badBackupDialog.dismiss()
  await expect(page.getByText('共 2 件 / 库存 2 件', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('共 2 件 / 库存 2 件', { exact: true })).toBeVisible()
  await goPage(page, '强化队列')
  await expect(page.locator('#upgrade-queue')).toContainText('1/5')
  await goPage(page, '圣遗物仓库')
  // Empty only this disposable test profile, then restore via the actual UI.
  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('keyval-store', 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => { const db = request.result; const tx = db.transaction('keyval', 'readwrite'); tx.objectStore('keyval').put([], 'artifact-master:artifacts'); tx.objectStore('keyval').put([], 'artifact-master:queue'); tx.oncomplete = () => { db.close(); resolve() }; tx.onerror = () => reject(tx.error) }
  }))
  await page.reload(); await expect(page.getByText('共 0 件 / 库存 0 件', { exact: true })).toBeVisible()
  await page.getByText('仓库备份', { exact: true }).click()
  await page.getByText('导入 JSON', { exact: true }).locator('input').setInputFiles(backup)
  await expect(page.getByText('共 2 件 / 库存 2 件', { exact: true })).toBeVisible()
  await page.reload(); await expect(page.getByText('共 2 件 / 库存 2 件', { exact: true })).toBeVisible()
  await goPage(page, '强化队列')
  await expect(page.locator('#upgrade-queue')).toContainText('1/5')
  const network = [...priorNetwork, ...await app.evaluate(() => global.artifactTestNetwork)]
  // Test the new optional field via the real packaged backup UI, never the
  // user's profile. OCR text replay is covered independently in the browser.
  await goPage(page, '圣遗物仓库')
  await page.getByText('仓库备份', { exact: true }).click()
  const pendingPayload = { ...payload, artifacts: payload.artifacts.map(record => record.id === queuedRecord.id ? { ...record, pendingSubs: ['生命值 +4.1%'] } : record) }
  page.once('dialog', async dialog => { expect(dialog.type()).toBe('confirm'); await dialog.accept() })
  await page.getByText('导入 JSON', { exact: true }).locator('input').setInputFiles({ name: 'pending-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pendingPayload)) })
  // Both versions have two records, so count alone cannot wait for the async
  // transaction. Observe the new field before reloading the page.
  await page.getByTestId('warehouse-grid').getByRole('button', { name: /^查看/ }).filter({ hasText: '逐影猎人' }).click()
  await expect(page.getByLabel('圣遗物详情', { exact: true })).toContainText('生命值 +4.1%（待激活）')
  await page.reload()
  await page.getByTestId('warehouse-grid').getByRole('button', { name: /^查看/ }).filter({ hasText: '逐影猎人' }).click()
  await expect(page.getByLabel('圣遗物详情', { exact: true })).toContainText('生命值 +4.1%（待激活）')
  await page.getByRole('button', { name: '编辑当前圣遗物', exact: true }).click()
  await expect(page.getByLabel('待激活副词条1数值', { exact: true })).toHaveValue('4.1')
  await page.getByRole('button', { name: '保存圣遗物', exact: true }).click()
  await page.getByRole('button', { name: '确认并入库', exact: true }).click()
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await page.reload()
  await page.getByTestId('warehouse-grid').getByRole('button', { name: /^查看/ }).filter({ hasText: '逐影猎人' }).click()
  await expect(page.getByLabel('圣遗物详情', { exact: true })).toContainText('生命值 +4.1%（待激活）')
  await page.screenshot({ path: path.join(evidence, 'pending-packaged-details.png'), fullPage: false })
  // Exercise the actual bundled module Worker under file:// in the real ASAR.
  const evaluation = page.getByRole('region', { name: '角色适配与潜力', exact: true })
  await evaluation.getByRole('combobox', { name: '评估角色', exact: true }).selectOption('雷电将军')
  await evaluation.getByRole('combobox', { name: '评估玩法', exact: true }).selectOption('hyperbloom')
  await expect(evaluation.getByLabel('+20理论评分范围', { exact: true })).toHaveText('31.9 — 60.1', { timeout: 15000 })
  await expect(evaluation).toContainText('第四词条按可见待激活值计算')
  for (const name of ['芙宁娜', '奈芙尔', '雷电将军']) await evaluation.getByRole('combobox', { name: '评估角色', exact: true }).selectOption(name)
  await evaluation.getByRole('combobox', { name: '评估玩法', exact: true }).selectOption('hyperbloom')
  await expect(evaluation.getByLabel('+20理论评分范围', { exact: true })).toHaveText('31.9 — 60.1')
  const appMemory = await app.evaluate(({ app }) => app.getAppMetrics().map(({ type, memory }) => ({ type, workingSetKiB: memory.workingSetSize, peakWorkingSetKiB: memory.peakWorkingSetSize })))
  await page.screenshot({ path: path.join(evidence, 'potential-packaged.png'), fullPage: false })
  await expect(page.getByText('共 2 件 / 库存 2 件', { exact: true })).toBeVisible()
  const finalNetwork = [...network, ...await app.evaluate(() => global.artifactTestNetwork)]
  expect(finalNetwork).toEqual([])
  expect(network).toEqual([])
  expect(errors).toEqual([])
  console.log(JSON.stringify({ ok: true, shortPathPackagedEntry: true, realCaptureSources, realF8RegisteredAndReleased: process.env.ARTIFACT_TEST_F8_OCCUPIED !== '1', realF8ConflictRefused: process.env.ARTIFACT_TEST_F8_OCCUPIED === '1', gamePortraits: portraits.length, portraitsContain: true, elementDirectoryAndRarityReleaseSort: true, travelerElementSelection: 'cryo', realPackagedOfflineOcr: sample.id, realPackagedLevel17Ocr: level17.id, realFileProtocolPotentialWorker: true, pendingRolePotential: '31.9—60.1', offlineManual: true, savedAndProcessRestarted: 2, originalIcon: true, backupRestored: true, queueBackupRestored: true, corruptBackupRejected: true, emptyLibraryPersists: true, appMemory, externalRequests: finalNetwork.length, isolatedProfile: profile }))
} catch (error) {
  const page = await app.firstWindow()
  console.error((await page.locator('body').innerText()).slice(-6000))
  console.error('Renderer errors:', errors)
  throw error
} finally { await app.close() }
