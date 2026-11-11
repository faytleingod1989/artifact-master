import { calculatePotential } from './scorePotential'
import type { PotentialInput } from './potentialTypes'
const scope = globalThis as unknown as { onmessage: (event: MessageEvent<{ requestId: number; input: PotentialInput }>) => void; postMessage: (reply: unknown) => void }
scope.onmessage = event => {
  const { requestId, input } = event.data
  try { scope.postMessage({ requestId, result: calculatePotential(input) }) }
  catch (error) { scope.postMessage({ requestId, error: error instanceof Error ? error.message : '潜力计算失败。' }) }
}
