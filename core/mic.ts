import { create } from 'zustand'

interface MicStore {
  /** Whether mic is active */
  active: boolean
  /** FFT frequency data (0-255 per bin), updated every frame */
  fft: Uint8Array
  /** Waveform time-domain data */
  waveform: Uint8Array
  /** Overall volume level 0-1 */
  volume: number
  /** Bass energy (low freqs) 0-1 */
  bass: number
  /** Mid energy 0-1 */
  mid: number
  /** Treble energy 0-1 */
  treble: number
  /** Beat detected this frame */
  beat: boolean
}

export const useMicStore = create<MicStore>(() => ({
  active: false,
  fft: new Uint8Array(128),
  waveform: new Uint8Array(128),
  volume: 0,
  bass: 0,
  mid: 0,
  treble: 0,
  beat: false,
}))

let analyser: AnalyserNode | null = null
let audioCtx: AudioContext | null = null
let rafId: number | null = null
let lastBeatTime = 0
let beatThreshold = 0.6

function analyzeBands(fft: Uint8Array, size: number) {
  // Split FFT into bass/mid/treble
  const bassEnd = Math.floor(size * 0.1)    // ~0-400Hz
  const midEnd = Math.floor(size * 0.5)     // ~400-2000Hz

  let bassSum = 0, midSum = 0, trebleSum = 0, total = 0
  for (let i = 0; i < size; i++) {
    const v = fft[i] / 255
    total += v
    if (i < bassEnd) bassSum += v
    else if (i < midEnd) midSum += v
    else trebleSum += v
  }

  const bass = bassSum / Math.max(1, bassEnd)
  const mid = midSum / Math.max(1, midEnd - bassEnd)
  const treble = trebleSum / Math.max(1, size - midEnd)
  const volume = total / size

  // Simple beat detection: bass spike
  const now = performance.now()
  const beat = bass > beatThreshold && (now - lastBeatTime) > 200
  if (beat) lastBeatTime = now

  // Adaptive threshold
  beatThreshold = beatThreshold * 0.95 + bass * 0.05 + 0.05

  return { bass, mid, treble, volume, beat }
}

function loop() {
  if (!analyser) return

  const fft = new Uint8Array(analyser.frequencyBinCount)
  const waveform = new Uint8Array(analyser.frequencyBinCount)
  analyser.getByteFrequencyData(fft)
  analyser.getByteTimeDomainData(waveform)

  const bands = analyzeBands(fft, fft.length)

  useMicStore.setState({
    fft,
    waveform,
    ...bands,
  })

  rafId = requestAnimationFrame(loop)
}

export async function startMic() {
  if (useMicStore.getState().active) return

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    audioCtx = new AudioContext()
    const source = audioCtx.createMediaStreamSource(stream)
    analyser = audioCtx.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.8
    source.connect(analyser)

    useMicStore.setState({ active: true })
    loop()
  } catch (e) {
    console.warn('Mic access denied:', e)
  }
}

export function stopMic() {
  if (rafId !== null) cancelAnimationFrame(rafId)
  rafId = null
  if (audioCtx) audioCtx.close()
  audioCtx = null
  analyser = null
  useMicStore.setState({ active: false, volume: 0, bass: 0, mid: 0, treble: 0, beat: false })
}
