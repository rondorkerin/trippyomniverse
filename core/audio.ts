import { useTripiStore } from './store'

type ToneModule = typeof import('tone')

let Tone: ToneModule | null = null
let masterReverb: any = null
let masterFilter: any = null
let initialized = false

export async function initAudio() {
  if (initialized) return
  initialized = true

  Tone = await import('tone')
  await Tone.start()

  masterReverb = new Tone.Reverb({ decay: 8, wet: 0.4 }).toDestination()
  await masterReverb.generate()

  masterFilter = new Tone.Filter({
    frequency: 1000,
    type: 'lowpass',
    rolloff: -24,
  }).connect(masterReverb)

  // Ambient drone
  const lfo = new Tone.LFO({ frequency: 0.08, min: 200, max: 1400 }).start()
  const drone = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 3, decay: 1, sustain: 0.7, release: 4 },
  })
  drone.volume.value = -22
  drone.connect(masterFilter)
  lfo.connect(masterFilter.frequency)
  drone.triggerAttack([65.41, 98.0, 130.81]) // C2, G2, C3

  useTripiStore.getState().setAudioReady(true)
}

export function getTone() { return Tone }
export function getMasterReverb() { return masterReverb }
export function getMasterFilter() { return masterFilter }

export function setFilterCutoff(freq: number) {
  if (!masterFilter) return
  try {
    masterFilter.frequency.rampTo(Math.max(20, Math.min(freq, 20000)), 0.1)
  } catch { /* filter not ready yet */ }
}

export function setReverbWet(wet: number) {
  if (!masterReverb) return
  try {
    masterReverb.wet.rampTo(Math.max(0, Math.min(wet, 1)), 0.1)
  } catch { /* reverb not ready yet */ }
}

const PENTATONIC = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25]

export function playBell() {
  if (!Tone) return
  const freq = PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)]
  const synth = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.005, decay: 1.5, sustain: 0, release: 2 },
  })
  synth.volume.value = -10
  synth.connect(masterReverb)
  synth.triggerAttackRelease(freq, '8n')
  setTimeout(() => synth.dispose(), 5000)
}

export function playTone(freq: number, duration = '8n', volume = -10) {
  if (!Tone) return
  const synth = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.01, decay: 1.2, sustain: 0, release: 1.5 },
  })
  synth.volume.value = volume
  synth.connect(masterReverb)
  synth.triggerAttackRelease(freq, duration)
  setTimeout(() => synth.dispose(), 5000)
}
