// Keep the previously delivered unpacked runtime and executables untouched.
const base = require('./electron-builder.local.cjs')
module.exports = {
  ...base,
  directories: { ...base.directories, output: 'release-fullpage-candidate-r3' },
  artifactName: 'ArtifactMaster-${version}-fullpage-candidate-20261110-r3.${ext}',
}
