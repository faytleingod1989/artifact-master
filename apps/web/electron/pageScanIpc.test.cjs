const { test } = require('node:test'), assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url'), path = require('node:path')
const { registerPageScanIpc } = require('./pageScanIpc.cjs')
test('page input stays session-bound, denies screen/unlisted sources and rejects arbitrary coordinate commands', async () => {
  const handlers = {}, calls = [], frame = { url: pathToFileURL(path.join(__dirname, '../dist/index.html')).href }, sender = { mainFrame: null }; sender.mainFrame = frame
  const client = { start: async () => {}, command: async value => { calls.push(value); return { ok: true } }, dispose() {} }
  const service = registerPageScanIpc({ handle: (key, fn) => { handlers[key] = fn }, removeHandler() {} }, () => ({ isDestroyed: () => false, webContents: sender }), source => source === 'window:123:0', () => client)
  const event = { sender, senderFrame: frame }
  try {
    const open = handlers['artifact-master:page-scan-open'], command = handlers['artifact-master:page-scan-command']
    for (const source of ['screen:0:0','window:456:0','../script']) await assert.rejects(open(event, source))
    await assert.rejects(open({ sender: {}, senderFrame: frame }, 'window:123:0'))
    const session = await open(event, 'window:123:0')
    await command(event,session,{action:'reset-page'})
    await assert.rejects(command(event,session,{action:'anchor'}),/暂停/)
    await assert.rejects(command(event, session, {action:'prepare'}),/暂停/)
    await assert.rejects(command(event, session, { action: 'select', cellId: 'r0c0' }))
    await command(event, session, { action: 'resume' })
    await assert.rejects(command(event,session,{action:'reset-page'}))
    await assert.rejects(command(event,session,{action:'restore-anchor',anchor:'anything'}))
    await assert.rejects(command(event,session,{action:'anchor',anchor:'anything'}))
    await command(event,session,{action:'anchor'})
    await assert.rejects(command(event,session,{action:'prepare',x:1920,y:2095}))
    await command(event,session,{action:'prepare'})
    await assert.rejects(command(event, session, { action: 'select', cellId: 'r0c0', x: 500, y: 600 }))
    await assert.rejects(command(event, session, { action: 'exec', path: 'anything' }))
    await assert.rejects(command(event, 'old-session', { action: 'select', cellId: 'r0c0' }))
    await command(event, session, { action: 'select', cellId: 'r0c0' })
    assert.deepEqual(calls, [{action:'reset-page'}, { action: 'resume' }, {action:'anchor'}, {action:'prepare'}, { action: 'select', cellId: 'r0c0' }])
    await command(event, session, { action: 'pause' })
    await assert.rejects(command(event, session, { action: 'select', cellId: 'r0c1' }))
  } finally { service.dispose() }
})
test('pause revokes a resume still awaiting the native helper and cannot be undone by its late acknowledgement', async () => {
  const handlers = {}, frame = { url: pathToFileURL(path.join(__dirname, '../dist/index.html')).href }, sender = { mainFrame: null }; sender.mainFrame = frame
  let finishResume
  const service = registerPageScanIpc({ handle: (key, fn) => { handlers[key] = fn }, removeHandler() {} }, () => ({ isDestroyed: () => false, webContents: sender }), () => true, () => ({ start: async () => {}, command: value => value.action === 'resume' ? new Promise(resolve => { finishResume = resolve }) : Promise.resolve({ ok: true }), dispose() {} }))
  try {
    const event = { sender, senderFrame: frame }, session = await handlers['artifact-master:page-scan-open'](event, 'window:123:0')
    const resuming = handlers['artifact-master:page-scan-command'](event, session, { action: 'resume' })
    const result = resuming.catch(() => null)
    await handlers['artifact-master:page-scan-command'](event, session, { action: 'pause' })
    finishResume({ ok: true }); await result
    await assert.rejects(handlers['artifact-master:page-scan-command'](event, session, { action: 'select', cellId: 'r0c0' }), /暂停/)
  } finally { service.dispose() }
})
