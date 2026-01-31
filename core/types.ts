/** Normalized input state — all modules read from this */
export interface InputState {
  /** Mouse position normalized to [-1, 1] */
  mouse: { x: number; y: number }
  /** Mouse position in pixels */
  mousePixel: { x: number; y: number }
  /** Whether mouse/touch is currently pressed */
  pointerDown: boolean
  /** Arrow key / WASD directional vector, each axis [-1, 1] */
  direction: { x: number; y: number }
  /** Currently held keys (lowercase) */
  keys: Set<string>
  /** Modifier state */
  shift: boolean
  ctrl: boolean
  alt: boolean
  /** Pointer click events (consumed each frame) */
  clicks: Array<{ x: number; y: number; time: number }>
}

/** Clock state passed to modules each frame */
export interface ClockState {
  elapsed: number
  delta: number
}

/** Module manifest */
export interface ModuleManifest {
  name: string
  description: string
  version: string
  author?: string
  tags?: string[]
}

/** Props every module receives */
export interface ModuleProps {
  input: InputState
  clock: ClockState
}

/** Module registration entry */
export interface ModuleEntry {
  manifest: ModuleManifest
  component: React.ComponentType<ModuleProps>
  enabled: boolean
}
