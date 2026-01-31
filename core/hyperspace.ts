import { create } from 'zustand'

const CHUNK_SIZE = 60

export interface HyperspaceStore {
  /** 6D position [x,y,z,w,v,u] */
  position: Float64Array
  /** 6D velocity */
  velocity: Float64Array
  /** Look direction */
  heading: { yaw: number; pitch: number }
  /** Speed multiplier from scroll wheel */
  warpFactor: number
  /** 0-1, from pointer-down duration */
  thrust: number
  /** Current chunk coordinate [cx, cy, cz] */
  chunkCoord: [number, number, number]
  /** Speed magnitude */
  speed: number
  /** Base movement speed */
  baseSpeed: number

  setHeading: (yaw: number, pitch: number) => void
  setWarpFactor: (v: number) => void
  setThrust: (v: number) => void
}

export const useHyperspaceStore = create<HyperspaceStore>((set) => ({
  position: new Float64Array(6),
  velocity: new Float64Array(6),
  heading: { yaw: 0, pitch: 0 },
  warpFactor: 1,
  thrust: 0,
  chunkCoord: [0, 0, 0],
  speed: 0,
  baseSpeed: 15,

  setHeading: (yaw, pitch) => set({ heading: { yaw, pitch } }),
  setWarpFactor: (v) => set({ warpFactor: Math.max(0.1, Math.min(10, v)) }),
  setThrust: (v) => set({ thrust: Math.max(0, Math.min(1, v)) }),
}))

/**
 * Called every frame to update position based on heading, thrust, and inputs.
 */
export function updateHyperspace(
  delta: number,
  mouseX: number,
  mouseY: number,
  pointerDown: boolean,
  micVolume: number,
  micActive: boolean,
  camMotionX: number,
  camMotionY: number,
  camMotion: number,
  camActive: boolean,
  directionX: number,
  directionY: number,
  speedPreset: number,
) {
  const store = useHyperspaceStore.getState()
  const pos = store.position
  const vel = store.velocity
  const { warpFactor } = store
  const baseSpeed = speedPreset

  // Mouse → heading (smoothed)
  const targetYaw = mouseX * Math.PI * 0.8
  const targetPitch = mouseY * Math.PI * 0.4
  const currentHeading = store.heading
  const smoothing = 1 - Math.exp(-4 * delta)
  const yaw = currentHeading.yaw + (targetYaw - currentHeading.yaw) * smoothing
  const pitch = currentHeading.pitch + (targetPitch - currentHeading.pitch) * smoothing

  // Thrust — ramp up while pointer down, decay when released
  let thrust = store.thrust
  if (pointerDown) {
    thrust = thrust + (1 - thrust) * (1 - Math.exp(-3 * delta))
  } else {
    thrust = thrust * Math.exp(-2 * delta)
  }

  // WASD also provides thrust (W = forward, S = back)
  const wasdThrust = Math.max(thrust, Math.abs(directionY) > 0 ? 0.8 : 0)

  // Mic volume boosts warp
  const micBoost = micActive ? 1 + micVolume * 2 : 1

  // Heading direction → 3D unit vector
  const dirX = Math.sin(yaw) * Math.cos(pitch)
  const dirY = Math.sin(pitch)
  const dirZ = -Math.cos(yaw) * Math.cos(pitch)

  // Right vector for strafing (A/D)
  const rightX = Math.cos(yaw)
  const rightZ = Math.sin(yaw)

  const totalSpeed = baseSpeed * wasdThrust * warpFactor * micBoost

  // Forward/back from pointer thrust + W/S
  const forwardMul = directionY < 0 ? -0.7 : 1 // S goes backward at 70% speed

  // Update velocity with inertia
  const inertia = Math.exp(-3 * delta)
  vel[0] = vel[0] * inertia + (dirX * totalSpeed * forwardMul + rightX * directionX * baseSpeed * warpFactor * 0.6) * (1 - inertia)
  vel[1] = vel[1] * inertia + dirY * totalSpeed * forwardMul * (1 - inertia)
  vel[2] = vel[2] * inertia + (dirZ * totalSpeed * forwardMul + rightZ * directionX * baseSpeed * warpFactor * 0.6) * (1 - inertia)

  // Higher dimensions drift from webcam motion + gentle noise
  if (camActive) {
    vel[3] = vel[3] * 0.95 + camMotionX * 8 * delta
    vel[4] = vel[4] * 0.95 + camMotionY * 8 * delta
    vel[5] = vel[5] * 0.95 + camMotion * 5 * delta
  } else {
    // Gentle autonomous drift in higher dims
    const t = performance.now() * 0.001
    vel[3] = vel[3] * 0.98 + Math.sin(t * 0.1) * 0.3 * delta
    vel[4] = vel[4] * 0.98 + Math.cos(t * 0.13) * 0.3 * delta
    vel[5] = vel[5] * 0.98 + Math.sin(t * 0.07 + 2) * 0.3 * delta
  }

  // Integrate position
  for (let i = 0; i < 6; i++) {
    pos[i] += vel[i] * delta
  }

  // Compute speed and chunk coord
  const speed = Math.sqrt(vel[0] * vel[0] + vel[1] * vel[1] + vel[2] * vel[2])
  const cx = Math.floor(pos[0] / CHUNK_SIZE)
  const cy = Math.floor(pos[1] / CHUNK_SIZE)
  const cz = Math.floor(pos[2] / CHUNK_SIZE)

  useHyperspaceStore.setState({
    heading: { yaw, pitch },
    thrust,
    speed,
    chunkCoord: [cx, cy, cz],
  })
}
