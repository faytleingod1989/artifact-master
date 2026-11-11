import type { PotentialInput, PotentialResult } from './potentialTypes'
import { RULE_VERSION } from './enhancementRules'
const abortError = () => new DOMException('评估已取消。', 'AbortError')
export function createPotentialClient() {
  let worker: Worker | undefined, sequence = 0, disposed = false
  let pending: { id: number; key: string; resolve: (value: PotentialResult) => void; reject: (error: unknown) => void; cleanup: () => void } | undefined
  const cache = new Map<string, PotentialResult>()
  const cancel = () => { if (pending) { const old = pending; pending = undefined; old.cleanup(); old.reject(abortError()); worker?.terminate(); worker = undefined } }
  const prepare = () => {
    if (worker) return worker
    const current = new Worker(new URL('./potential.worker.ts', import.meta.url), { type: 'module' }); worker = current
    current.onmessage = event => {
      if (worker !== current) return
      const job = pending
      if (!job || event.data?.requestId !== job.id) return
      pending = undefined; job.cleanup()
      if (event.data.error) { job.reject(new Error(event.data.error)); return }
      const result = event.data.result as PotentialResult
      if (!result || !['ready', 'needs-verification'].includes(result.status)) { job.reject(new Error('潜力计算返回异常。')); return }
      cache.set(job.key, result); while (cache.size > 64) cache.delete(cache.keys().next().value!)
      job.resolve(result)
    }
    current.onerror = event => {
      if (worker !== current) return
      const job = pending; pending = undefined; worker?.terminate(); worker = undefined
      if (job) { job.cleanup(); job.reject(new Error(event.message || '本地潜力计算器不可用，请重试。')) }
    }
    return worker
  }
  return {
    evaluate(input: PotentialInput, signal?: AbortSignal): Promise<PotentialResult> {
      if (disposed || signal?.aborted) return Promise.reject(abortError())
      cancel()
      const key = JSON.stringify([RULE_VERSION, input.record, input.characterName, input.options])
      const hit = cache.get(key)
      if (hit) { cache.delete(key); cache.set(key, hit); return Promise.resolve(hit) }
      return new Promise((resolve, reject) => {
        const id = ++sequence, onAbort = () => { if (pending?.id === id) cancel() }
        pending = { id, key, resolve, reject, cleanup: () => signal?.removeEventListener('abort', onAbort) }
        signal?.addEventListener('abort', onAbort, { once: true })
        try { prepare().postMessage({ requestId: id, input }) }
        catch (error) { pending?.cleanup(); pending = undefined; worker?.terminate(); worker = undefined; reject(error) }
      })
    },
    dispose() { disposed = true; cancel(); worker?.terminate(); worker = undefined; cache.clear() },
  }
}
