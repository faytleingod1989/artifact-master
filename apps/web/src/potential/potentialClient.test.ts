import { afterEach, expect, test, vi } from 'vitest'
import { createPotentialClient } from './potentialClient'
import type { PotentialInput } from './potentialTypes'
const input: PotentialInput = { record: { id: 1, name: 'test', set: '', slot: '生之花', level: 0, main: '生命值 717', subs: [], score: 0, locked: false, hue: 'blue' }, characterName: '雷电将军', options: { buildId: 'burst' } }
const answer = { status: 'needs-verification', reasons: ['fixture'] }
function devices() {
  const workers: FakeWorker[] = []
  class FakeWorker {
    onmessage?: (event: { data: unknown }) => void; onerror?: (event: { message: string }) => void
    requests: Array<{ requestId: number; input: PotentialInput }> = []; terminated = false
    constructor() { workers.push(this) }
    postMessage(data: { requestId: number; input: PotentialInput }) { this.requests.push(data) }
    terminate() { this.terminated = true }
    reply(result = answer) { this.onmessage?.({ data: { requestId: this.requests.at(-1)!.requestId, result } }) }
  }
  vi.stubGlobal('Worker', FakeWorker); return workers
}
afterEach(() => vi.unstubAllGlobals())
test('new selection aborts old CPU work and a late reply cannot resolve the current request', async () => {
  const workers = devices(), client = createPotentialClient()
  const a = client.evaluate(input), rejected = expect(a).rejects.toMatchObject({ name: 'AbortError' })
  const b = client.evaluate({ ...input, characterName: '芙宁娜' }); await rejected
  expect(workers[0].terminated).toBe(true); workers[0].reply(); workers[1].reply()
  expect(await b).toEqual(answer); client.dispose()
})
test('cache includes full content and options, not just id; dispose rejects pending work', async () => {
  const workers = devices(), client = createPotentialClient()
  const first = client.evaluate(input); workers[0].reply(); await first
  expect(await client.evaluate(input)).toEqual(answer); expect(workers[0].requests).toHaveLength(1)
  const next = client.evaluate({ ...input, record: { ...input.record, pendingSubs: ['生命值 4.1%'] } })
  expect(workers[0].requests).toHaveLength(2)
  const rejected = expect(next).rejects.toMatchObject({ name: 'AbortError' }); client.dispose(); await rejected
})
test('worker errors reject explicitly and are not cached', async () => {
  const workers = devices(), client = createPotentialClient()
  const result = client.evaluate(input), rejected = expect(result).rejects.toThrow('failed worker')
  workers[0].onerror?.({ message: 'failed worker' }); await rejected
  const retry = client.evaluate(input); workers[1].reply(); await retry; client.dispose()
})
test('a cancelled worker late error cannot kill the next role evaluation', async () => {
  const workers = devices(), client = createPotentialClient()
  const a = client.evaluate(input), rejected = expect(a).rejects.toMatchObject({ name: 'AbortError' })
  const b = client.evaluate({ ...input, characterName: '芙宁娜' }); await rejected
  workers[0].onerror?.({ message: 'stale error' }); workers[1].reply()
  expect(await b).toEqual(answer); expect(workers[1].terminated).toBe(false); client.dispose()
})
test('LRU evicts the oldest of 65 content keys rather than growing without bound', async () => {
  const workers = devices(), client = createPotentialClient()
  for (let i = 0; i < 65; i++) { const task = client.evaluate({ ...input, record: { ...input.record, id: i } }); workers[0].reply(); await task }
  const task = client.evaluate({ ...input, record: { ...input.record, id: 0 } }); expect(workers[0].requests).toHaveLength(66); workers[0].reply(); await task; client.dispose()
})
