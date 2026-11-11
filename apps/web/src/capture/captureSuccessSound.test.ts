import { afterEach, expect, test, vi } from 'vitest'
import { createCaptureSuccessSound } from './captureSuccessSound'

afterEach(() => vi.unstubAllGlobals())
test('page completion has three distinct notes and is suppressed after disposal',async()=>{
  const device=audioDevice(),sound=createCaptureSuccessSound()
  await sound.playPageComplete();expect(device.starts).toEqual([2,2.13,2.26])
  await sound.dispose();await sound.playPageComplete();expect(device.starts).toHaveLength(3)
})
function audioDevice(blocked = false) {
  let state = 'suspended', finish!: () => void
  const starts: number[] = [], closes: number[] = []
  const device = { get state() { return state }, currentTime: 2, destination: {},
    resume: () => blocked ? new Promise<void>(resolve => { finish = () => { state = 'running'; resolve() } }) : Promise.resolve().then(() => { state = 'running' }),
    close: async () => { state = 'closed'; closes.push(1) },
    createGain: () => ({ gain: { setValueAtTime: () => {}, linearRampToValueAtTime: () => {} }, connect: () => {}, disconnect: () => {} }),
    createOscillator: () => ({ type: '', frequency: { setValueAtTime: () => {}, linearRampToValueAtTime: () => {} }, connect: () => {}, disconnect: () => {}, start: (at: number) => starts.push(at), stop: () => {}, onended: null }),
  }
  vi.stubGlobal('AudioContext', class { constructor() { return device } })
  return { starts, closes, finish: () => finish() }
}
test('prepare unlocks audio without a success tone; play makes one short tone; disposal closes it', async () => {
  const device = audioDevice(), sound = createCaptureSuccessSound()
  await sound.prepare(); expect(device.starts).toEqual([])
  await sound.play(); expect(device.starts).toEqual([2])
  await sound.dispose(); await sound.play(); expect(device.starts).toEqual([2]); expect(device.closes).toHaveLength(1)
})
test('disposing while audio unlock is pending suppresses delayed sound', async () => {
  const device = audioDevice(true), sound = createCaptureSuccessSound()
  const playing = sound.play(); await sound.dispose(); device.finish(); await playing
  expect(device.starts).toEqual([])
})
test('capture tone is independently playable and disposal suppresses both tone types', async () => {
  const device = audioDevice(), sound = createCaptureSuccessSound()
  await sound.playCaptured(); await sound.play(); expect(device.starts).toHaveLength(2)
  await sound.dispose(); await sound.playCaptured(); expect(device.starts).toHaveLength(2)
})
