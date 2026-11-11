/// <reference types="node" />
import { expect, test, vi } from 'vitest'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { createNativeOcrSession } from './nativeOcrService'
import { getRecognitionProblems } from '../imports/recognitionCheck'
import type { NativeOcrBridge } from './nativeOcrTypes'

// The image is already a fixed local crop. Keep OCR, grouping, parsing and
// validation real; only the unrelated browser crop operation is replaced.
vi.mock('../capture/captureRegion', () => ({ cropDetailRegion: async (image: Blob) => image }))
const require = createRequire(import.meta.url)
const { createNativeOcrClient } = require('../../electron/nativeOcrClient.cjs')
const runtime = path.resolve(process.env.ARTIFACT_OCR_FIXTURE_RUNTIME || 'native-ocr/runtime/ArtifactOcrWorker')

for (const sample of [
  { name:'first flower', file:'diagnostic-user-first-20261101.png', width:1050, height:1200, main:{key:'hpFlat',value:4780}, subs:[{key:'critRate',value:10.1},{key:'elementalMastery',value:19},{key:'atkFlat',value:31},{key:'critDamage',value:13.2}] },
  { name:'second flower', file:'diagnostic-user-second-20261101.png', width:850, height:810, main:{key:'hpFlat',value:4780}, subs:[{key:'critRate',value:7},{key:'atkFlat',value:19},{key:'energyRecharge',value:5.2},{key:'critDamage',value:23.3}] },
  { name:'third plume', file:'diagnostic-user-third-20261101.png', width:1000, height:1250, main:{key:'atkFlat',value:311}, subs:[{key:'defPercent',value:5.1},{key:'critRate',value:10.1},{key:'critDamage',value:10.9},{key:'atkPercent',value:14.6}] },
]) {
 const fixture=path.resolve('../../tests/private/ocr',sample.file)
 test.skipIf(!existsSync(fixture) || !existsSync(path.join(runtime,'ArtifactOcrWorker.exe')))(`actual offline OCR parses all four stats of the ${sample.name}`, async () => {
  const client = createNativeOcrClient(runtime)
  const bridge: NativeOcrBridge = { open: async () => { await client.start(); return 'test' }, recognize: async (_id, image, request) => client.recognize(image, request), close: async () => client.dispose() }
  const session = await createNativeOcrSession(bridge, { mode: 'general' })
  try {
    const bytes = await readFile(fixture)
    const image = new Blob([new Uint8Array(bytes)], { type:'image/png' })
    const result = await session.recognize(image, { x:0, y:0, width:sample.width, height:sample.height })
    expect(result.draft.level).toBe(20)
    expect(result.draft.main).toEqual(sample.main)
    expect(result.draft.subs).toEqual(sample.subs)
    expect(getRecognitionProblems(result.draft)).toEqual([])
  } finally { await session.dispose() }
 }, 30000)
}
