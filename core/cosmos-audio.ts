/**
 * Spatial soundscape engine — each nearby chunk contributes a voice.
 * Max 8 simultaneous voices, crossfaded by distance.
 */

import { useTripiStore } from './store'
import { useHyperspaceStore } from './hyperspace'
import { getNearestChunks, CHUNK_SIZE } from './chunks'
import type { ChunkData } from './biomes'

type ToneModule = typeof import('tone')

let Tone: ToneModule | null = null
let initialized = false
let masterReverb: any = null
let masterFilter: any = null

const MAX_VOICES = 8

interface Voice {
  synth: any
  chunkKey: string
  targetFreq: number
  targetVol: number // in dB
}

const voices: (Voice | null)[] = Array(MAX_VOICES).fill(null)

export async function initCosmosAudio() {
  if (initialized) return
  initialized = true

  Tone = await import('tone')
  await Tone.start()

  masterReverb = new Tone.Reverb({ decay: 10, wet: 0.5 }).toDestination()
  await masterReverb.generate()

  masterFilter = new Tone.Filter({
    frequency: 2000,
    type: 'lowpass',
    rolloff: -24,
  }).connect(masterReverb)

  // Create voice pool
  for (let i = 0; i < MAX_VOICES; i++) {
    const synth = new Tone.Synth({
      oscillator: { type: i < 4 ? 'sine' : 'triangle' },
      envelope: { attack: 2, decay: 1, sustain: 0.6, release: 3 },
    })
    synth.volume.value = -60 // Start silent
    synth.connect(masterFilter)
    synth.triggerAttack(55) // Will be updated
    voices[i] = { synth, chunkKey: '', targetFreq: 55, targetVol: -60 }
  }

  useTripiStore.getState().setAudioReady(true)
}

export function getCosmosReverb() { return masterReverb }
export function getCosmosFilter() { return masterFilter }

/**
 * Update spatial audio based on current position and nearby chunks.
 * Called each frame.
 */
export function updateCosmosAudio(speed: number, micVolume: number, micActive: boolean) {
  if (!Tone || !initialized) return

  const nearest = getNearestChunks(MAX_VOICES)
  const pos = useHyperspaceStore.getState().position

  for (let i = 0; i < MAX_VOICES; i++) {
    const voice = voices[i]
    if (!voice) continue

    if (i < nearest.length) {
      const chunk = nearest[i]
      const key = chunk.coord.join(',')

      // Distance attenuation
      const dx = chunk.worldPos[0] + CHUNK_SIZE / 2 - pos[0]
      const dy = chunk.worldPos[1] + CHUNK_SIZE / 2 - pos[1]
      const dz = chunk.worldPos[2] + CHUNK_SIZE / 2 - pos[2]
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
      const maxDist = CHUNK_SIZE * 3
      const attenuation = Math.max(0, 1 - dist / maxDist)

      // Base frequency from chunk harmonic + seed variation
      const freq = Math.max(20, Math.min(20000, chunk.harmonic * (0.8 + chunk.seed * 0.4)))

      // Volume: -60dB (silent) to -18dB (loud nearby)
      const baseVol = -18 + (-60 - -18) * (1 - attenuation)
      const micBoost = micActive ? micVolume * 3 : 0

      voice.targetFreq = freq
      voice.targetVol = Math.min(-10, baseVol + micBoost)
      voice.chunkKey = key
    } else {
      voice.targetVol = -60
    }

    // Smooth transitions
    try {
      voice.synth.frequency.rampTo(Math.max(20, Math.min(20000, voice.targetFreq)), 0.5)
      voice.synth.volume.rampTo(Math.max(-60, Math.min(0, voice.targetVol)), 0.3)
    } catch {
      // Tone.js sometimes throws during ramp
    }
  }

  // Speed affects filter — faster = higher cutoff (whoosh effect)
  if (masterFilter) {
    const speedCutoff = 300 + Math.min(speed / 50, 1) * 6000
    try {
      masterFilter.frequency.rampTo(Math.max(20, Math.min(20000, speedCutoff)), 0.2)
    } catch { /* filter not ready */ }
  }

  // Speed affects reverb — faster = wetter
  if (masterReverb) {
    const wet = 0.3 + Math.min(speed / 80, 1) * 0.5
    try {
      masterReverb.wet.rampTo(Math.max(0, Math.min(1, wet)), 0.3)
    } catch { /* reverb not ready */ }
  }
}

/** Play a bell tone (on click) */
export function playCosmosClick() {
  if (!Tone) return
  const nearest = getNearestChunks(1)
  const freq = nearest.length > 0
    ? nearest[0].harmonic * (1 + nearest[0].seed * 0.5)
    : 440

  const synth = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.005, decay: 1.5, sustain: 0, release: 2 },
  })
  synth.volume.value = -10
  if (masterReverb) synth.connect(masterReverb)
  else synth.toDestination()
  synth.triggerAttackRelease(Math.max(20, Math.min(20000, freq)), '8n')
  setTimeout(() => synth.dispose(), 5000)
}

/** Dispose all audio */
export function disposeCosmosAudio() {
  for (const voice of voices) {
    if (voice) {
      try { voice.synth.dispose() } catch { /* already disposed */ }
    }
  }
  if (masterFilter) try { masterFilter.dispose() } catch { /* */ }
  if (masterReverb) try { masterReverb.dispose() } catch { /* */ }
  initialized = false
}
