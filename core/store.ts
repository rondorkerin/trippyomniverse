import { create } from 'zustand'

export type ColorMode = 'rainbow' | 'warm' | 'cool' | 'mono' | 'psychedelic'

const BLOOM_PRESETS = [0.5, 1.0, 1.8, 3.0, 5.0]

interface TripiStore {
  intensity: number
  setIntensity: (v: number) => void

  hueOffset: number
  setHueOffset: (v: number) => void

  timeScale: number
  setTimeScale: (v: number) => void

  audioReady: boolean
  setAudioReady: (v: boolean) => void

  isPaused: boolean
  togglePause: () => void

  colorMode: ColorMode
  cycleColorMode: () => void

  bloomIntensity: number
  bloomIndex: number
  cycleBloom: () => void

  showHelp: boolean
  toggleHelp: () => void

  renderDistance: number
  setRenderDistance: (v: number) => void

  gravityMode: number // 1 = gravity, 0 = zero-g, -1 = antigravity
  cycleGravity: () => void

  speedPreset: number
  speedPresetIndex: number
  cycleSpeedUp: () => void
  cycleSpeedDown: () => void

  moduleState: Record<string, unknown>
  setModuleState: (id: string, state: unknown) => void
  getModuleState: <T = unknown>(id: string) => T | undefined
}

const COLOR_MODES: ColorMode[] = ['rainbow', 'warm', 'cool', 'mono', 'psychedelic']

export const useTripiStore = create<TripiStore>((set, get) => ({
  intensity: 0.5,
  setIntensity: (v) => set({ intensity: Math.max(0, Math.min(1, v)) }),

  hueOffset: 0,
  setHueOffset: (v) => set({ hueOffset: v % 1 }),

  timeScale: 1,
  setTimeScale: (v) => set({ timeScale: Math.max(0.1, Math.min(3, v)) }),

  audioReady: false,
  setAudioReady: (v) => set({ audioReady: v }),

  isPaused: false,
  togglePause: () => set((s) => ({ isPaused: !s.isPaused })),

  colorMode: 'rainbow',
  cycleColorMode: () => {
    const idx = COLOR_MODES.indexOf(get().colorMode)
    set({ colorMode: COLOR_MODES[(idx + 1) % COLOR_MODES.length] })
  },

  bloomIntensity: 1.8,
  bloomIndex: 2,
  cycleBloom: () => {
    const next = (get().bloomIndex + 1) % BLOOM_PRESETS.length
    set({ bloomIndex: next, bloomIntensity: BLOOM_PRESETS[next] })
  },

  showHelp: false,
  toggleHelp: () => set((s) => ({ showHelp: !s.showHelp })),

  renderDistance: 2,
  setRenderDistance: (v) => set({ renderDistance: Math.max(1, Math.min(4, v)) }),

  gravityMode: 1,
  cycleGravity: () => {
    const modes = [1, 0, -1]
    const idx = modes.indexOf(get().gravityMode)
    const next = modes[(idx + 1) % modes.length]
    set({ gravityMode: next })
  },

  speedPreset: 15,
  speedPresetIndex: 2,
  cycleSpeedUp: () => {
    const presets = [3, 8, 15, 30, 60, 120]
    const next = Math.min(get().speedPresetIndex + 1, presets.length - 1)
    set({ speedPresetIndex: next, speedPreset: presets[next] })
  },
  cycleSpeedDown: () => {
    const presets = [3, 8, 15, 30, 60, 120]
    const next = Math.max(get().speedPresetIndex - 1, 0)
    set({ speedPresetIndex: next, speedPreset: presets[next] })
  },

  moduleState: {},
  setModuleState: (id, state) =>
    set((s) => ({ moduleState: { ...s.moduleState, [id]: state } })),
  getModuleState: <T = unknown>(id: string) => get().moduleState[id] as T | undefined,
}))

/** Get HSL hue based on colorMode and base hue */
export function getModulatedHue(baseHue: number, colorMode: ColorMode): number {
  switch (colorMode) {
    case 'rainbow': return baseHue % 1
    case 'warm': return (0.0 + baseHue * 0.12) % 1  // reds/oranges/yellows
    case 'cool': return (0.5 + baseHue * 0.15) % 1   // blues/cyans/purples
    case 'mono': return 0.55                           // single blue-ish
    case 'psychedelic': return (baseHue * 3.0) % 1     // rapid cycling
  }
}
