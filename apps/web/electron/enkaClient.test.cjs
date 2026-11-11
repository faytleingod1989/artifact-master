const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { createEnkaClient, normalizeUid } = require('./enkaClient.cjs')
function network() {
  const calls = []
  const request = (url, options, callback) => {
    const req = new EventEmitter(); req.destroy = () => { req.destroyed = true }; req.end = () => {}; req.setTimeout = ms => { req.timeout = ms }
    calls.push({ url, options, callback, req })
    return req
  }
  const respond = (index, payload, status = 200, headers = {}) => {
    const response = new EventEmitter(); response.statusCode = status; response.headers = headers; response.destroy = () => {}
    calls[index].callback(response)
    if (payload !== undefined) { response.emit('data', Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload))); response.emit('end') }
    return response
  }
  return { request, calls, respond }
}
test('UID normalization refuses URLs/exponents/control characters but allows trimmed 9/10 digits', () => {
  assert.equal(normalizeUid(' 123456789 '), '123456789'); assert.equal(normalizeUid('1234567890'), '1234567890')
  for (const bad of ['012345678', 'https://x/123456789', '1e9', '123456789\n', '1234567', 123456789, '１２３４５６７８９']) assert.equal(normalizeUid(bad), null)
})
test('fixed endpoint, product UA, same UID in-flight sharing, TTL cache and private-data stripping', async () => {
  const net = network(); let now = 1000
  const client = createEnkaClient({ request: net.request, now: () => now })
  const first = client.queryShowcase('123456789'); const second = client.queryShowcase('123456789')
  assert.equal(net.calls.length, 1)
  assert.equal(net.calls[0].url, 'https://enka.network/api/uid/123456789/')
  assert.match(net.calls[0].options.headers['User-Agent'], /ArtifactMaster/)
  assert.equal(net.calls[0].req.timeout, 15000)
  net.respond(0, { ttl: 10, owner: 'private', playerInfo: { signature: 'private' }, avatarInfoList: [{ avatarId: 10000002, private: 'private', equipList: [{ flat: { itemType: 'ITEM_WEAPON', icon: 'https://arbitrary' } }] }] })
  const result = await first; assert.equal(result.ok, true); assert.deepEqual(await second, result); assert.equal(result.refreshAt, 11000)
  assert.doesNotMatch(JSON.stringify(result.payload), /private|signature|arbitrary|owner/)
  assert.equal((await client.queryShowcase('123456789')).cached, true); assert.equal(net.calls.length, 1)
  now = 11001; const refresh = client.queryShowcase('123456789'); assert.equal(net.calls.length, 2); net.respond(1, {}); await refresh
  client.clearShowcaseCache()
})
test('whole request deadline aborts at 15000ms, including no-response connections', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const net = network(); const client = createEnkaClient({ request: net.request, now: () => 1000 })
  const query = client.queryShowcase('123456789')
  t.mock.timers.tick(15000)
  assert.deepEqual(await query, { ok: false, code: 'timeout' }); assert.equal(net.calls[0].req.destroyed, true)
})
test('streamed response limit is enforced before JSON parsing', async () => {
  const net = network(); const client = createEnkaClient({ request: net.request, now: () => 1000 })
  const query = client.queryShowcase('123456789'); const response = net.respond(0)
  response.emit('data', Buffer.alloc(2500000)); response.emit('data', Buffer.alloc(2500001))
  assert.deepEqual(await query, { ok: false, code: 'invalid-response' }); client.clearShowcaseCache()
})
for (const status of [301, 302, 307, 308]) test(`redirect ${status} is never followed`, async () => {
  const net = network(); const client = createEnkaClient({ request: net.request, now: () => 1000 })
  const query = client.queryShowcase('123456789'); net.respond(0, '', status, { location: 'https://other.test' })
  assert.deepEqual(await query, { ok: false, code: 'invalid-response' }); assert.equal(net.calls.length, 1)
})
for (const [header, delay] of [['30', 30000], [new Date(90000).toUTCString(), 89000], [undefined, 60000]]) test(`Retry-After ${header ?? 'fallback'} stops premature requests`, async () => {
  const net = network(); let now = 1000; const client = createEnkaClient({ request: net.request, now: () => now })
  const query = client.queryShowcase('123456789'); net.respond(0, '', 429, { 'retry-after': header })
  assert.deepEqual(await query, { ok: false, code: 'rate-limited', retryAt: now + delay })
  await client.queryShowcase('123456789'); assert.equal(net.calls.length, 1)
  now += delay + 1; const next = client.queryShowcase('123456789'); net.respond(1, {}); assert.equal((await next).ok, true)
})
test('invalid JSON, disconnection and cache clearing resolve errors without leftover work', async () => {
  const net = network(); const client = createEnkaClient({ request: net.request, now: () => 1000 })
  const query = client.queryShowcase('123456789'); net.respond(0, 'not-json'); assert.equal((await query).code, 'invalid-response')
  const disconnected = client.queryShowcase('123456789'); net.calls[1].req.emit('error', new Error('offline')); assert.equal((await disconnected).code, 'offline')
  const pending = client.queryShowcase('123456789'); client.clearShowcaseCache(); assert.equal((await pending).ok, false); assert.equal(net.calls[2].req.destroyed, true)
})
test('malformed nested values cannot leak arbitrary profile objects through the equipment whitelist', async () => {
  const net = network(); const client = createEnkaClient({ request: net.request, now: () => 1000 })
  const query = client.queryShowcase('123456789')
  net.respond(0, { avatarInfoList: [{ avatarId: { signature: 'SECRET' }, equipList: { signature: 'SECRET' } }, { avatarId: 1, equipList: [{ flat: { nameTextMapHash: { signature: 'SECRET' }, reliquaryMainstat: { mainPropId: { signature: 'SECRET' }, propValue: { signature: 'SECRET' } } } }] }] })
  const result = await query
  assert.doesNotMatch(JSON.stringify(result), /SECRET|signature/)
})
