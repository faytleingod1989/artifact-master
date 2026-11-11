const { fileURLToPath } = require('node:url')
const path = require('node:path')

// Chromium leaves '~' literal in file URLs while Node encodes it as '%7E'.
// Compare the decoded file path, not URL spelling. Frame/window identity is
// still enforced by each caller; queries, fragments and remote hosts are denied.
function isEntryUrl(value, entryFile) {
  if (typeof value !== 'string' || value.includes('?') || value.includes('#')) return false
  try {
    const url = new URL(value)
    return url.protocol === 'file:' && !url.hostname && !url.username && !url.password && fileURLToPath(url) === path.resolve(entryFile)
  } catch { return false }
}
module.exports = { isEntryUrl }
