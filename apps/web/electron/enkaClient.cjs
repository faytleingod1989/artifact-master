const https = require('node:https')
const version = require('../package.json').version
function normalizeUid(input) {
  if (typeof input !== 'string' || [...input].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return null
  const value = input.trim()
  return /^[1-9]\d{8,9}$/.test(value) ? value : null
}
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) }
function pick(value, keys) { if (!object(value)) return null; return Object.fromEntries(keys.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]])) }
function scalar(value) { return typeof value === 'string' || typeof value === 'number' && Number.isFinite(value) ? value : null }
function statFields(value, typeKey) { return object(value) ? { [typeKey]: scalar(value[typeKey]), propValue: typeof value.propValue === 'number' ? value.propValue : null } : null }
function sanitize(root) {
  if (!object(root)) throw new Error('invalid response')
  if (!Object.hasOwn(root, 'avatarInfoList')) return {}
  if (!Array.isArray(root.avatarInfoList)) throw new Error('invalid response')
  return { avatarInfoList: root.avatarInfoList.map(avatar => {
    const next = pick(avatar, ['avatarId', 'equipList'])
    if (object(next)) { next.avatarId = typeof next.avatarId === 'number' ? next.avatarId : null; if (!Array.isArray(next.equipList)) next.equipList = null }
    if (object(next) && Array.isArray(next.equipList)) next.equipList = next.equipList.map(equip => {
      const row = pick(equip, ['flat', 'reliquary'])
      if (!object(row)) return row
      row.reliquary = pick(row.reliquary, ['level'])
      if (object(row.reliquary)) row.reliquary.level = typeof row.reliquary.level === 'number' ? row.reliquary.level : null
      row.flat = pick(row.flat, ['itemType', 'rankLevel', 'equipType', 'setNameTextMapHash', 'nameTextMapHash', 'reliquaryMainstat', 'reliquarySubstats'])
      if (object(row.flat)) {
        for (const key of ['itemType', 'rankLevel', 'equipType', 'setNameTextMapHash', 'nameTextMapHash']) if (Object.hasOwn(row.flat, key)) row.flat[key] = scalar(row.flat[key])
        row.flat.reliquaryMainstat = statFields(row.flat.reliquaryMainstat, 'mainPropId')
        row.flat.reliquarySubstats = Array.isArray(row.flat.reliquarySubstats) ? row.flat.reliquarySubstats.map(stat => statFields(stat, 'appendPropId')) : null
      }
      return row
    })
    return next
  }) }
}
function createEnkaClient({ request = https.request, now = Date.now } = {}) {
  const cache = new Map(); const inflight = new Map(); let retryAt = 0
  function queryShowcase(input) {
    const uid = normalizeUid(input)
    if (!uid) return Promise.resolve({ ok: false, code: 'invalid-uid' })
    if (inflight.has(uid)) return inflight.get(uid).promise
    const saved = cache.get(uid)
    if (saved && saved.refreshAt > now()) return Promise.resolve({ ...saved, cached: true })
    if (retryAt > now()) return Promise.resolve({ ok: false, code: 'rate-limited', retryAt })
    let cancel = () => {}; let req; let response
    const promise = new Promise(resolve => {
      let finished = false
      const finish = result => { if (finished) return; finished = true; clearTimeout(deadline); resolve(result) }
      const fail = code => { finish({ ok: false, code }); response?.destroy(); req?.destroy() }
      const deadline = setTimeout(() => fail('timeout'), 15000); deadline.unref?.()
      cancel = () => fail('offline')
      try {
        req = request(`https://enka.network/api/uid/${uid}/`, { method: 'GET', headers: { 'User-Agent': `ArtifactMaster/${version} (local-Windows)`, Accept: 'application/json' } }, res => {
          response = res
          if (finished) { res.destroy(); return }
          const status = res.statusCode
          if (status !== 200) {
            if (status === 429) {
              const raw = res.headers['retry-after']; const seconds = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : NaN
              const date = typeof raw === 'string' ? Date.parse(raw) : NaN
              const delay = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : Number.isFinite(date) && date > now() ? date - now() : 60000
              retryAt = Number.isSafeInteger(now() + delay) ? now() + delay : now() + 60000
              finish({ ok: false, code: 'rate-limited', retryAt }); res.destroy(); return
            }
            const code = status === 400 ? 'invalid-uid' : status === 404 ? 'not-found' : status === 424 ? 'maintenance' : status >= 300 && status < 400 ? 'invalid-response' : 'unavailable'
            finish({ ok: false, code }); res.destroy(); return
          }
          let bytes = 0; const chunks = []
          res.on('data', chunk => {
            if (finished) return
            const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
            bytes += data.length
            if (bytes > 5000000) { fail('invalid-response'); return }
            chunks.push(data)
          })
          res.on('end', () => {
            if (finished) return
            try {
              const body = JSON.parse(Buffer.concat(chunks).toString('utf8')); const payload = sanitize(body)
              const ttl = typeof body.ttl === 'number' && body.ttl > 0 && Number.isSafeInteger(now() + body.ttl * 1000) ? body.ttl : 60
              const fetchedAt = now(); const result = { ok: true, payload, fetchedAt, refreshAt: fetchedAt + ttl * 1000, cached: false }
              if (cache.size >= 20) cache.delete(cache.keys().next().value)
              cache.set(uid, result); finish(result)
            } catch { fail('invalid-response') }
          })
          res.on('error', () => fail('offline')); res.on('aborted', () => fail('offline')); res.on('close', () => { if (!finished) fail('offline') })
        })
        req.on('error', () => fail('offline')); req.setTimeout(15000, () => fail('timeout')); req.end()
      } catch { fail('offline') }
    })
    const tracked = promise.finally(() => { if (inflight.get(uid)?.promise === tracked) inflight.delete(uid) })
    inflight.set(uid, { promise: tracked, cancel })
    return tracked
  }
  function clearShowcaseCache() { cache.clear(); for (const entry of [...inflight.values()]) entry.cancel(); inflight.clear() }
  return { normalizeUid, queryShowcase, clearShowcaseCache }
}
const client = createEnkaClient()
module.exports = { createEnkaClient, normalizeUid, queryShowcase: client.queryShowcase, clearShowcaseCache: client.clearShowcaseCache }
