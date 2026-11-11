// Visible, isolated acceptance harness. No automated input or privilege changes.
// Launched through Computer Use; all subsequent interaction is manual/Sky UI.
const { app } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const resources = path.resolve(__dirname, '../release-local/win-unpacked/resources')
if (!fs.existsSync(path.join(resources, 'app.asar'))) throw Error('Build the candidate first')
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-live-anchor-')))
Object.defineProperty(process, 'resourcesPath', { value: resources })
app.on('browser-window-created', (_event, window) => {
  window.webContents.on('did-finish-load', () => window.setTitle('圣遗物管理大师 — 独立验收（不影响原库存）'))
})
require(path.join(resources, 'app.asar/electron/main.cjs'))
