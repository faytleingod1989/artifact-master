// Generated locally: no media file, request, notification window or focus change.
export function scheduleCaptureSuccessTone(context: BaseAudioContext): void {
  const tone = context.createOscillator(), volume = context.createGain(), now = context.currentTime
  tone.type = 'sine'
  tone.frequency.setValueAtTime(740, now)
  tone.frequency.linearRampToValueAtTime(988, now + .12)
  volume.gain.setValueAtTime(0, now)
  volume.gain.linearRampToValueAtTime(.08, now + .012)
  volume.gain.linearRampToValueAtTime(0, now + .20)
  tone.connect(volume); volume.connect(context.destination)
  tone.onended = () => { tone.disconnect(); volume.disconnect() }
  tone.start(now); tone.stop(now + .21)
}

export function scheduleCapturedTone(context: BaseAudioContext): void {
  const tone = context.createOscillator(), volume = context.createGain(), now = context.currentTime
  tone.type = 'sine'; tone.frequency.setValueAtTime(520, now)
  volume.gain.setValueAtTime(0, now); volume.gain.linearRampToValueAtTime(.06, now + .008); volume.gain.linearRampToValueAtTime(0, now + .07)
  tone.connect(volume); volume.connect(context.destination)
  tone.onended = () => { tone.disconnect(); volume.disconnect() }; tone.start(now); tone.stop(now + .08)
}
export function createCaptureSuccessSound() {
  let context: AudioContext | undefined, disposed = false
  return {
    async prepare(): Promise<void> {
      if (disposed) return
      // Called synchronously from the Start click, before capture/OCR awaits.
      context ??= new AudioContext()
      await context.resume()
    },
    async play(): Promise<void> {
      if (disposed) return
      await this.prepare()
      if (!disposed && context?.state === 'running') scheduleCaptureSuccessTone(context)
    },
    async playCaptured(): Promise<void> {
      if (disposed) return
      await this.prepare()
      if (!disposed && context?.state === 'running') scheduleCapturedTone(context)
    },
    async playPageComplete(): Promise<void> {
      if(disposed)return
      await this.prepare()
      if(disposed||context?.state!=='running')return
      const audio=context
      ;[660,520,440].forEach((frequency,index)=>{
        const tone=audio.createOscillator(),volume=audio.createGain(),at=audio.currentTime+index*.13
        tone.type='sine';tone.frequency.setValueAtTime(frequency,at)
        volume.gain.setValueAtTime(0,at);volume.gain.linearRampToValueAtTime(.06,at+.008);volume.gain.linearRampToValueAtTime(0,at+.10)
        tone.connect(volume);volume.connect(audio.destination)
        tone.onended=()=>{tone.disconnect();volume.disconnect()};tone.start(at);tone.stop(at+.11)
      })
    },
    async dispose(): Promise<void> {
      if (disposed) return
      disposed = true
      if (context && context.state !== 'closed') await context.close()
    },
  }
}
