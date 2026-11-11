module.exports = {
  appId: 'com.local.artifactmaster', productName: '圣遗物管理大师', electronDist: 'node_modules/electron/dist', npmRebuild: false,
  directories: { output: 'release-local' },
  files: [{ from: 'dist-local', to: 'dist', filter: ['**/*'] }, 'electron/main.cjs', 'electron/preload.cjs', 'electron/enkaClient.cjs', 'electron/enkaIpc.cjs', 'electron/captureIpc.cjs', 'electron/entryUrl.cjs', 'electron/nativeOcrClient.cjs', 'electron/nativeWindowFrameClient.cjs', 'electron/nativePageScanClient.cjs', 'electron/pageScanIpc.cjs', 'electron/ocrIpc.cjs', 'package.json'],
  extraResources: [{ from: 'native-ocr/runtime/ArtifactOcrWorker', to: 'ocr-native', filter: ['**/*'] }, { from: 'native-capture', to: 'capture-native', filter: ['*.ps1'] }],
  artifactName: 'ArtifactMaster-${version}-yas-rowguard-20261101-local.${ext}',
  win: { target: [{ target: 'portable', arch: ['x64'] }] },
}
