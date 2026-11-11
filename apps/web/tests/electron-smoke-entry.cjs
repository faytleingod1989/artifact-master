const { app, session } = require('electron')
const path = require('node:path')
if (!process.env.ARTIFACT_TEST_PROFILE || !process.env.ARTIFACT_TEST_MAIN) throw new Error('Missing isolated test paths')
app.setPath('userData', process.env.ARTIFACT_TEST_PROFILE)
app.disableHardwareAcceleration()
// Test launcher uses the real archive plus sibling resource directory. Production
// still always uses Electron's fixed resourcesPath, with no environment override.
Object.defineProperty(process, 'resourcesPath', { value: path.dirname(path.dirname(path.dirname(process.env.ARTIFACT_TEST_MAIN))) })
global.artifactTestNetwork = []
// Inspect the real archive, not an unpackaged development copy. This is test
// instrumentation only; no hash/diagnostic bridge is exposed by production.
global.artifactTestPackageHashes=Object.fromEntries(['main.cjs','preload.cjs','pageScanIpc.cjs','nativePageScanClient.cjs'].map(name=>[name,require('node:crypto').createHash('sha256').update(require('node:fs').readFileSync(path.join(path.dirname(process.env.ARTIFACT_TEST_MAIN),name))).digest('hex')]))
const archiveDist=path.resolve(path.dirname(process.env.ARTIFACT_TEST_MAIN),'../dist')
const distHashes={}
function inspectBuiltScripts(directory){
  const fs=require('node:fs')
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
    const file=path.join(directory,entry.name)
    if(entry.isDirectory())inspectBuiltScripts(file)
    else if(entry.isFile()&&/\.(?:js|css|html)$/.test(entry.name))distHashes[path.relative(archiveDist,file).replace(/\\/g,'/')]=require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  }
}
inspectBuiltScripts(archiveDist)
global.artifactTestDistHashes=distHashes
app.on('browser-window-created', (_event, window) => window.hide())
app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    global.artifactTestNetwork.push(details.url)
    callback({ cancel: true })
  })
})
require(process.env.ARTIFACT_TEST_MAIN)
