import * as THREE from 'three'
import { getModulatedHue, type ColorMode } from './store'
import { noise3D } from './noise'
import { tesseractVertices, tesseractEdges, rotateXW, rotateYZ, rotateXY, rotateZW, project4Dto3D } from '@/modules/hypercube/math4d'
import type { Vec4 } from '@/modules/hypercube/math4d'

export type BiomeType = 'void' | 'nebula' | 'fractal' | 'crystal' | 'tesseract' | 'particle-storm' | 'kaleidoscopic' | 'breath'

export interface ChunkData {
  coord: [number, number, number]
  seed: number
  biome: BiomeType
  density: number
  scale: number
  palette: [number, number, number]
  harmonic: number
  lod: 0 | 1 | 2
  worldPos: [number, number, number]
}

export interface BiomeInstance {
  group: THREE.Group
  populate: (t: number, delta: number, intensity: number, hueOffset: number, colorMode: ColorMode, micState: MicState, gravityMode: number) => void
  dispose: () => void
}

interface MicState {
  bass: number
  mid: number
  treble: number
  volume: number
  beat: boolean
  active: boolean
}

export function selectBiome(noiseVal: number): BiomeType {
  if (noiseVal < 0.12) return 'void'
  if (noiseVal < 0.25) return 'nebula'
  if (noiseVal < 0.38) return 'fractal'
  if (noiseVal < 0.50) return 'crystal'
  if (noiseVal < 0.62) return 'tesseract'
  if (noiseVal < 0.78) return 'particle-storm'
  if (noiseVal < 0.90) return 'kaleidoscopic'
  return 'breath'
}

const BIOME_HARMONICS: Record<BiomeType, number> = {
  'void': 55, 'nebula': 82.41, 'fractal': 110, 'crystal': 164.81,
  'tesseract': 220, 'particle-storm': 329.63, 'kaleidoscopic': 440, 'breath': 65.41,
}

export function getBiomeHarmonic(biome: BiomeType): number {
  return BIOME_HARMONICS[biome]
}

// ========== HELPERS ==========

const tempColor = new THREE.Color()
const dummy = new THREE.Object3D()

function prand(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}

function prandN(seed: number, n: number): number {
  return prand(seed * 1.7231 + n * 3.9173 + 0.5)
}

interface Attractor {
  x: number; y: number; z: number
  strength: number
  radius: number
}

function generateAttractors(seed: number, count: number, size: number): Attractor[] {
  const attractors: Attractor[] = []
  for (let i = 0; i < count; i++) {
    const s = seed * 100 + i * 37.7
    attractors.push({
      x: (prand(s) - 0.5) * size * 0.8,
      y: (prand(s + 1) - 0.5) * size * 0.8,
      z: (prand(s + 2) - 0.5) * size * 0.8,
      strength: (prand(s + 3) - 0.4) * 300,
      radius: 5 + prand(s + 4) * 25,
    })
  }
  return attractors
}

// ========== AGENT BEHAVIORS ==========

/** Behavior type — each particle can act differently */
const BEHAVIOR_FLOCK = 0    // boids-like flocking
const BEHAVIOR_WARP = 1     // teleports randomly when fast enough
const BEHAVIOR_ORBIT = 2    // orbits nearest attractor in circles
const BEHAVIOR_SWARM = 3    // swarms toward density peaks
const BEHAVIOR_CHAOS = 4    // random walk, ignores everything

/** Assign per-particle behavior based on seed */
function assignBehaviors(count: number, seed: number): Uint8Array {
  const behaviors = new Uint8Array(count)
  for (let i = 0; i < count; i++) {
    behaviors[i] = Math.floor(prand(seed * 1.3 + i * 2.7) * 5)
  }
  return behaviors
}

/** Agent-based step — particles have behaviors, not just forces */
function agentStep(
  pos: Float32Array,
  vel: Float32Array,
  alive: Uint8Array,  // 0 = dead/combined, 1 = alive
  behaviors: Uint8Array,
  count: number,
  attractors: Attractor[],
  delta: number,
  seed: number,
  t: number,
  damping: number,
  maxSpeed: number,
  flowStrength: number,
  gravityMode: number,
) {
  const dt = Math.min(delta, 0.05)

  for (let i = 0; i < count; i++) {
    if (!alive[i]) continue
    const i3 = i * 3
    let fx = 0, fy = 0, fz = 0
    const px = pos[i3], py = pos[i3 + 1], pz = pos[i3 + 2]
    const behavior = behaviors[i]

    // Attractor forces (gravity mode)
    if (gravityMode !== 0) {
      for (let a = 0; a < attractors.length; a++) {
        const att = attractors[a]
        const dx = att.x - px, dy = att.y - py, dz = att.z - pz
        const distSq = dx * dx + dy * dy + dz * dz + 1
        const dist = Math.sqrt(distSq)
        if (dist < att.radius) {
          const falloff = 1 - dist / att.radius
          const force = att.strength * falloff * falloff / distSq * gravityMode
          fx += dx * force; fy += dy * force; fz += dz * force
        }
      }
    }

    // Behavior-specific forces
    if (behavior === BEHAVIOR_FLOCK) {
      // Boids: align + cohere + separate with nearby particles
      let avgVx = 0, avgVy = 0, avgVz = 0, avgPx = 0, avgPy = 0, avgPz = 0, n = 0
      for (let k = 0; k < 6; k++) {
        const j = ((i * 7 + k * 17 + Math.floor(seed * 1000)) % count)
        if (j === i || !alive[j]) continue
        const j3 = j * 3
        const dx = pos[j3] - px, dy = pos[j3 + 1] - py, dz = pos[j3 + 2] - pz
        const d = dx * dx + dy * dy + dz * dz
        if (d < 64) {
          avgVx += vel[j3]; avgVy += vel[j3 + 1]; avgVz += vel[j3 + 2]
          avgPx += pos[j3]; avgPy += pos[j3 + 1]; avgPz += pos[j3 + 2]
          n++
          if (d < 4) { fx -= dx * 2; fy -= dy * 2; fz -= dz * 2 } // separation
        }
      }
      if (n > 0) {
        fx += (avgVx / n - vel[i3]) * 0.5  // alignment
        fy += (avgVy / n - vel[i3 + 1]) * 0.5
        fz += (avgVz / n - vel[i3 + 2]) * 0.5
        fx += (avgPx / n - px) * 0.3  // cohesion
        fy += (avgPy / n - py) * 0.3
        fz += (avgPz / n - pz) * 0.3
      }
    } else if (behavior === BEHAVIOR_WARP) {
      // Teleport when speed exceeds threshold
      const spd = Math.sqrt(vel[i3] * vel[i3] + vel[i3 + 1] * vel[i3 + 1] + vel[i3 + 2] * vel[i3 + 2])
      if (spd > maxSpeed * 0.8 && prand(t * 100 + i) > 0.97) {
        pos[i3] += (prand(t * 10 + i * 3) - 0.5) * 20
        pos[i3 + 1] += (prand(t * 10 + i * 3 + 1) - 0.5) * 20
        pos[i3 + 2] += (prand(t * 10 + i * 3 + 2) - 0.5) * 20
        vel[i3] *= 0.3; vel[i3 + 1] *= 0.3; vel[i3 + 2] *= 0.3
      }
      // Also attracted to flow field more strongly
      if (flowStrength > 0) {
        const ns = 0.05
        fx += noise3D(px * ns + t * 0.2, py * ns, pz * ns + seed) * flowStrength * 3
        fy += noise3D(px * ns, py * ns + t * 0.2 + 100, pz * ns + seed) * flowStrength * 3
        fz += noise3D(px * ns + 200, py * ns, pz * ns + t * 0.2 + seed) * flowStrength * 3
      }
    } else if (behavior === BEHAVIOR_ORBIT) {
      // Find nearest attractor and orbit it
      let nearDist = 999, nearIdx = 0
      for (let a = 0; a < attractors.length; a++) {
        const dx = attractors[a].x - px, dy = attractors[a].y - py, dz = attractors[a].z - pz
        const d = dx * dx + dy * dy + dz * dz
        if (d < nearDist) { nearDist = d; nearIdx = a }
      }
      if (attractors.length > 0) {
        const att = attractors[nearIdx]
        const dx = att.x - px, dy = att.y - py, dz = att.z - pz
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz + 0.1)
        // Tangential force for orbiting
        const orbitSpeed = 5
        fx += -dz / dist * orbitSpeed + dx / dist * 0.5 * gravityMode
        fy += dy / dist * 0.3 * gravityMode
        fz += dx / dist * orbitSpeed + dz / dist * 0.5 * gravityMode
      }
    } else if (behavior === BEHAVIOR_SWARM) {
      // Move toward regions of high particle density
      let densityX = 0, densityY = 0, densityZ = 0, dCount = 0
      for (let k = 0; k < 10; k++) {
        const j = ((i * 11 + k * 23 + Math.floor(seed * 500)) % count)
        if (j === i || !alive[j]) continue
        const j3 = j * 3
        const dx = pos[j3] - px, dy = pos[j3 + 1] - py, dz = pos[j3 + 2] - pz
        if (dx * dx + dy * dy + dz * dz < 100) {
          densityX += dx; densityY += dy; densityZ += dz; dCount++
        }
      }
      if (dCount > 2) {
        fx += densityX / dCount * 1.5
        fy += densityY / dCount * 1.5
        fz += densityZ / dCount * 1.5
      }
    } else {
      // CHAOS — random walk + occasional bursts
      const chaos = 8
      fx += (noise3D(px * 0.1 + t * 0.5, py * 0.1 + seed, pz * 0.1) - 0.0) * chaos
      fy += (noise3D(px * 0.1 + 50, py * 0.1 + t * 0.5 + seed, pz * 0.1) - 0.0) * chaos
      fz += (noise3D(px * 0.1, py * 0.1 + 50, pz * 0.1 + t * 0.5 + seed) - 0.0) * chaos
      if (prand(t * 50 + i * 7) > 0.995) {
        vel[i3] += (prand(t + i) - 0.5) * 30
        vel[i3 + 1] += (prand(t + i + 1) - 0.5) * 30
        vel[i3 + 2] += (prand(t + i + 2) - 0.5) * 30
      }
    }

    // Flow field for all
    if (flowStrength > 0 && behavior !== BEHAVIOR_WARP) {
      const ns = 0.03
      fx += noise3D(px * ns + t * 0.1, py * ns, pz * ns + seed) * flowStrength
      fy += noise3D(px * ns, py * ns + t * 0.1 + 100, pz * ns + seed) * flowStrength
      fz += noise3D(px * ns + 200, py * ns, pz * ns + t * 0.1 + seed) * flowStrength
    }

    vel[i3] = (vel[i3] + fx * dt) * damping
    vel[i3 + 1] = (vel[i3 + 1] + fy * dt) * damping
    vel[i3 + 2] = (vel[i3 + 2] + fz * dt) * damping

    const spd = Math.sqrt(vel[i3] * vel[i3] + vel[i3 + 1] * vel[i3 + 1] + vel[i3 + 2] * vel[i3 + 2])
    if (spd > maxSpeed) {
      const s = maxSpeed / spd
      vel[i3] *= s; vel[i3 + 1] *= s; vel[i3 + 2] *= s
    }

    pos[i3] += vel[i3] * dt
    pos[i3 + 1] += vel[i3 + 1] * dt
    pos[i3 + 2] += vel[i3 + 2] * dt

    const boundary = 28
    if (Math.abs(pos[i3]) > boundary) vel[i3] -= pos[i3] * 0.02
    if (Math.abs(pos[i3 + 1]) > boundary) vel[i3 + 1] -= pos[i3 + 1] * 0.02
    if (Math.abs(pos[i3 + 2]) > boundary) vel[i3 + 2] -= pos[i3 + 2] * 0.02
  }
}

// ========== CLUSTER / MERGE SYSTEM ==========

interface SpawnedMesh {
  mesh: THREE.Object3D
  x: number; y: number; z: number
  age: number
  lifetime: number
  scale: number
  rotSpeed: [number, number, number]
  warpPhase: number
  warpRate: number
}

/** Detect clusters and spawn meshes, killing merged particles */
function clusterMerge(
  pos: Float32Array,
  vel: Float32Array,
  alive: Uint8Array,
  count: number,
  seed: number,
  t: number,
  group: THREE.Group,
  spawned: SpawnedMesh[],
  maxSpawned: number,
  lod: number,
) {
  if (spawned.length >= maxSpawned) return

  // Grid-based density check (cheap)
  const cellSize = 3
  const densityMap = new Map<string, number[]>()
  for (let i = 0; i < count; i++) {
    if (!alive[i]) continue
    const i3 = i * 3
    const cx = Math.floor(pos[i3] / cellSize)
    const cy = Math.floor(pos[i3 + 1] / cellSize)
    const cz = Math.floor(pos[i3 + 2] / cellSize)
    const key = `${cx},${cy},${cz}`
    let list = densityMap.get(key)
    if (!list) { list = []; densityMap.set(key, list) }
    list.push(i)
  }

  for (const [, indices] of densityMap) {
    if (indices.length < 5 || spawned.length >= maxSpawned) continue
    if (prand(t * 100 + indices[0]) > 0.3) continue // Don't merge every frame

    // Compute centroid
    let cx = 0, cy = 0, cz = 0
    for (const i of indices) {
      const i3 = i * 3
      cx += pos[i3]; cy += pos[i3 + 1]; cz += pos[i3 + 2]
    }
    cx /= indices.length; cy /= indices.length; cz /= indices.length

    // Kill particles (up to 8 per merge)
    const mergeCount = Math.min(indices.length, 8)
    for (let k = 0; k < mergeCount; k++) {
      alive[indices[k]] = 0
      const i3 = indices[k] * 3
      pos[i3] = 0; pos[i3 + 1] = 0; pos[i3 + 2] = 0
    }

    // Spawn a procedural mesh at centroid
    const meshSeed = seed * 100 + t * 10 + indices[0]
    const scale = 0.3 + mergeCount * 0.15
    const geo = pickGeometry(meshSeed, scale, lod)
    const wireframe = prand(meshSeed + 1) > 0.4
    const mat = new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending,
      depthWrite: false, wireframe, side: wireframe ? THREE.FrontSide : THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(cx, cy, cz)
    group.add(mesh)

    spawned.push({
      mesh, x: cx, y: cy, z: cz,
      age: 0,
      lifetime: 4 + prand(meshSeed + 2) * 12,
      scale,
      rotSpeed: [
        (prand(meshSeed + 3) - 0.5) * 2,
        (prand(meshSeed + 4) - 0.5) * 2,
        (prand(meshSeed + 5) - 0.5) * 2,
      ],
      warpPhase: prand(meshSeed + 6) * Math.PI * 2,
      warpRate: 0.5 + prand(meshSeed + 7) * 3,
    })
  }
}

/** Update spawned meshes — warp, pulse, expire and respawn particles */
function updateSpawnedMeshes(
  spawned: SpawnedMesh[],
  pos: Float32Array,
  vel: Float32Array,
  alive: Uint8Array,
  count: number,
  delta: number,
  t: number,
  seed: number,
  intensity: number,
  hueOffset: number,
  colorMode: ColorMode,
  group: THREE.Group,
) {
  for (let s = spawned.length - 1; s >= 0; s--) {
    const sp = spawned[s]
    sp.age += delta

    // Warp effect — distort position over time
    const warp = Math.sin(t * sp.warpRate + sp.warpPhase) * 0.5
    sp.mesh.position.set(
      sp.x + Math.sin(t * 0.3 + sp.warpPhase) * warp * 2,
      sp.y + Math.cos(t * 0.4 + sp.warpPhase * 0.7) * warp * 2,
      sp.z + Math.sin(t * 0.5 + sp.warpPhase * 1.3) * warp,
    )

    // Pulsing scale
    const lifeFrac = sp.age / sp.lifetime
    const fadeIn = Math.min(sp.age * 3, 1)
    const fadeOut = lifeFrac > 0.8 ? (1 - lifeFrac) / 0.2 : 1
    const pulse = 1 + Math.sin(t * 2 + sp.warpPhase) * 0.2
    sp.mesh.scale.setScalar(sp.scale * pulse * fadeIn * fadeOut * intensity)

    sp.mesh.rotation.x += sp.rotSpeed[0] * delta
    sp.mesh.rotation.y += sp.rotSpeed[1] * delta
    sp.mesh.rotation.z += sp.rotSpeed[2] * delta

    // Color
    const hue = getModulatedHue(hueOffset + lifeFrac * 0.3 + sp.warpPhase * 0.1 + t * 0.02, colorMode)
    const mat = sp.mesh as THREE.Mesh
    ;(mat.material as THREE.MeshBasicMaterial).color.setHSL(hue, 0.8, 0.3 * fadeOut * intensity)
    ;(mat.material as THREE.MeshBasicMaterial).opacity = 0.5 * fadeOut

    // Expire — split back into particles
    if (sp.age >= sp.lifetime) {
      group.remove(sp.mesh)
      ;(sp.mesh as THREE.Mesh).geometry.dispose()
      ;((sp.mesh as THREE.Mesh).material as THREE.Material).dispose()

      // Respawn 3-5 particles at mesh location
      const respawnCount = 3 + Math.floor(prand(seed + t + s) * 3)
      for (let r = 0; r < respawnCount; r++) {
        // Find a dead particle to resurrect
        for (let i = 0; i < count; i++) {
          if (!alive[i]) {
            alive[i] = 1
            const i3 = i * 3
            pos[i3] = sp.x + (prand(t * 5 + i + r) - 0.5) * 3
            pos[i3 + 1] = sp.y + (prand(t * 5 + i + r + 1) - 0.5) * 3
            pos[i3 + 2] = sp.z + (prand(t * 5 + i + r + 2) - 0.5) * 3
            // Burst velocity outward
            vel[i3] = (prand(t * 3 + i) - 0.5) * 15
            vel[i3 + 1] = (prand(t * 3 + i + 1) - 0.5) * 15
            vel[i3 + 2] = (prand(t * 3 + i + 2) - 0.5) * 15
            break
          }
        }
      }

      spawned.splice(s, 1)
    }
  }
}

/** Legacy physics step wrapper — uses agentStep internally */
function physicsStep(
  pos: Float32Array,
  vel: Float32Array,
  count: number,
  attractors: Attractor[],
  delta: number,
  seed: number,
  t: number,
  damping: number,
  maxSpeed: number,
  _interactionStrength: number,
  flowStrength: number,
  gravityMode: number,
) {
  // Create temporary alive + behaviors arrays for non-agent biomes
  const alive = new Uint8Array(count).fill(1)
  const behaviors = assignBehaviors(count, seed)
  agentStep(pos, vel, alive, behaviors, count, attractors, delta, seed, t, damping, maxSpeed, flowStrength, gravityMode)
}

// ========== PROCEDURAL GEOMETRY HELPERS ==========

/** Pick a geometry type based on seed — much more variety */
function pickGeometry(seed: number, scale: number, lod: number): THREE.BufferGeometry {
  const segments = lod === 0 ? 16 : lod === 1 ? 10 : 6
  const choice = Math.floor(prand(seed) * 12)
  const s = scale
  switch (choice) {
    case 0: return new THREE.IcosahedronGeometry(s, lod === 0 ? 2 : 1)
    case 1: return new THREE.OctahedronGeometry(s, lod === 0 ? 2 : 1)
    case 2: return new THREE.DodecahedronGeometry(s, lod === 0 ? 1 : 0)
    case 3: return new THREE.TetrahedronGeometry(s, lod === 0 ? 2 : 1)
    case 4: return new THREE.TorusGeometry(s, s * 0.3, segments, segments)
    case 5: return new THREE.TorusKnotGeometry(s * 0.7, s * 0.15, segments * 4, segments)
    case 6: return new THREE.ConeGeometry(s * 0.5, s * 1.5, segments)
    case 7: return new THREE.CylinderGeometry(s * 0.1, s * 0.6, s * 1.2, segments)
    case 8: return new THREE.BoxGeometry(s * 0.8, s * 1.2, s * 0.4)
    case 9: return new THREE.SphereGeometry(s, segments, segments)
    case 10: return new THREE.RingGeometry(s * 0.4, s, segments)
    default: return new THREE.CapsuleGeometry(s * 0.3, s * 0.8, segments, segments)
  }
}

/** Generate a Lissajous curve as BufferGeometry */
function lissajousGeometry(seed: number, scale: number, points: number): THREE.BufferGeometry {
  const a = 1 + Math.floor(prand(seed) * 5)
  const b = 1 + Math.floor(prand(seed + 1) * 5)
  const c = 1 + Math.floor(prand(seed + 2) * 5)
  const phaseA = prand(seed + 3) * Math.PI * 2
  const phaseB = prand(seed + 4) * Math.PI * 2
  const positions = new Float32Array(points * 3)
  for (let i = 0; i < points; i++) {
    const t = (i / points) * Math.PI * 2
    positions[i * 3] = Math.sin(a * t + phaseA) * scale
    positions[i * 3 + 1] = Math.sin(b * t + phaseB) * scale
    positions[i * 3 + 2] = Math.sin(c * t) * scale
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  return geo
}

/** Generate a helix curve */
function helixGeometry(seed: number, scale: number, points: number): THREE.BufferGeometry {
  const turns = 2 + Math.floor(prand(seed) * 6)
  const radius = scale * (0.3 + prand(seed + 1) * 0.7)
  const height = scale * 2
  const positions = new Float32Array(points * 3)
  for (let i = 0; i < points; i++) {
    const t = (i / points) * Math.PI * 2 * turns
    positions[i * 3] = Math.cos(t) * radius
    positions[i * 3 + 1] = (i / points - 0.5) * height
    positions[i * 3 + 2] = Math.sin(t) * radius
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  return geo
}

/** Spirograph curve */
function spirographGeometry(seed: number, scale: number, points: number): THREE.BufferGeometry {
  const R = scale
  const r = scale * (0.2 + prand(seed) * 0.6)
  const d = scale * (0.1 + prand(seed + 1) * 0.8)
  const positions = new Float32Array(points * 3)
  for (let i = 0; i < points; i++) {
    const t = (i / points) * Math.PI * 2 * (2 + Math.floor(prand(seed + 2) * 8))
    positions[i * 3] = (R - r) * Math.cos(t) + d * Math.cos((R - r) / r * t)
    positions[i * 3 + 1] = (R - r) * Math.sin(t) + d * Math.sin((R - r) / r * t)
    positions[i * 3 + 2] = Math.sin(t * (1 + prand(seed + 3) * 3)) * scale * 0.3
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  return geo
}

// ========== BIOME GENERATORS ==========

function createVoidBiome(chunk: ChunkData): BiomeInstance {
  const group = new THREE.Group()
  const count = Math.floor(100 * chunk.density * (3 - chunk.lod))
  if (count < 2) return { group, populate: () => {}, dispose: () => group.clear() }

  const size = 55
  const pos = new Float32Array(count * 3)
  const vel = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)

  const attractors = generateAttractors(chunk.seed, 3, size)
  attractors.forEach(a => a.strength = -Math.abs(a.strength) * 0.3)

  for (let i = 0; i < count; i++) {
    const i3 = i * 3
    pos[i3] = (prandN(chunk.seed, i * 3) - 0.5) * size
    pos[i3 + 1] = (prandN(chunk.seed, i * 3 + 1) - 0.5) * size
    pos[i3 + 2] = (prandN(chunk.seed, i * 3 + 2) - 0.5) * size
    vel[i3] = (prandN(chunk.seed, i * 3 + 1000) - 0.5) * 5
    vel[i3 + 1] = (prandN(chunk.seed, i * 3 + 2000) - 0.5) * 5
    vel[i3 + 2] = (prandN(chunk.seed, i * 3 + 3000) - 0.5) * 5
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const mat = new THREE.PointsMaterial({
    size: 0.25, vertexColors: true, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  })
  group.add(new THREE.Points(geo, mat))

  // Floating wireframe debris — procedural shapes
  const debrisCount = 2 + Math.floor(prand(chunk.seed + 0.77) * 4)
  const debrisMeshes: THREE.LineSegments[] = []
  for (let d = 0; d < debrisCount; d++) {
    const geoType = Math.floor(prand(chunk.seed + d * 7.3) * 4)
    let dGeo: THREE.BufferGeometry
    const pts = chunk.lod === 0 ? 80 : 40
    if (geoType === 0) dGeo = lissajousGeometry(chunk.seed + d, 3 + prand(chunk.seed + d) * 5, pts)
    else if (geoType === 1) dGeo = helixGeometry(chunk.seed + d * 2.1, 2 + prand(chunk.seed + d + 1) * 4, pts)
    else if (geoType === 2) dGeo = spirographGeometry(chunk.seed + d * 3.7, 2 + prand(chunk.seed + d + 2) * 4, pts)
    else dGeo = new THREE.EdgesGeometry(pickGeometry(chunk.seed + d * 5.1, 1.5 + prand(chunk.seed + d + 3) * 3, chunk.lod))
    const dMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false })
    const line = new THREE.LineSegments(dGeo, dMat)
    line.position.set(
      (prandN(chunk.seed, d * 3 + 5000) - 0.5) * 40,
      (prandN(chunk.seed, d * 3 + 5001) - 0.5) * 40,
      (prandN(chunk.seed, d * 3 + 5002) - 0.5) * 40,
    )
    debrisMeshes.push(line)
    group.add(line)
  }

  const maxLines = count * 3
  const linePos = new Float32Array(maxLines * 6)
  const lineCol = new Float32Array(maxLines * 6)
  const lineGeo = new THREE.BufferGeometry()
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3))
  lineGeo.setAttribute('color', new THREE.BufferAttribute(lineCol, 3))
  const lineMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false })
  group.add(new THREE.LineSegments(lineGeo, lineMat))

  return {
    group,
    populate(t, delta, intensity, hueOffset, colorMode, mic, gravityMode) {
      const micBoost = mic.active ? 1 + mic.volume * 0.5 : 1
      attractors.forEach(a => { a.x += Math.sin(t * 0.1 + a.strength) * 0.1; a.y += Math.cos(t * 0.13) * 0.1 })
      physicsStep(pos, vel, count, attractors, delta, chunk.seed, t, 0.995, 5 * micBoost, 0.3, 1.5, gravityMode)

      const colArr = geo.attributes.color.array as Float32Array
      for (let i = 0; i < count; i++) {
        const i3 = i * 3
        const spd = Math.sqrt(vel[i3] * vel[i3] + vel[i3 + 1] * vel[i3 + 1] + vel[i3 + 2] * vel[i3 + 2])
        const hue = getModulatedHue(hueOffset + chunk.palette[0] + spd * 0.1 + t * 0.005, colorMode)
        tempColor.setHSL(hue, 0.4, (0.1 + spd * 0.05) * intensity)
        colArr[i3] = tempColor.r; colArr[i3 + 1] = tempColor.g; colArr[i3 + 2] = tempColor.b
      }
      geo.attributes.position.needsUpdate = true
      geo.attributes.color.needsUpdate = true

      // Rotate debris
      for (let d = 0; d < debrisMeshes.length; d++) {
        const dm = debrisMeshes[d]
        dm.rotation.x += delta * 0.1 * (d % 2 === 0 ? 1 : -1)
        dm.rotation.y += delta * 0.07 * (d % 3 === 0 ? 1 : -1)
        const h = getModulatedHue(hueOffset + chunk.palette[0] + d * 0.15 + t * 0.01, colorMode)
        ;(dm.material as THREE.LineBasicMaterial).color.setHSL(h, 0.5, 0.15 * intensity)
      }

      const lp = lineGeo.attributes.position.array as Float32Array
      const lc = lineGeo.attributes.color.array as Float32Array
      let lineIdx = 0
      const maxDist = 12
      for (let i = 0; i < count && lineIdx < maxLines; i++) {
        for (let j = i + 1; j < count && lineIdx < maxLines; j++) {
          const dx = pos[i * 3] - pos[j * 3], dy = pos[i * 3 + 1] - pos[j * 3 + 1], dz = pos[i * 3 + 2] - pos[j * 3 + 2]
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
          if (d < maxDist) {
            const l6 = lineIdx * 6
            lp[l6] = pos[i * 3]; lp[l6 + 1] = pos[i * 3 + 1]; lp[l6 + 2] = pos[i * 3 + 2]
            lp[l6 + 3] = pos[j * 3]; lp[l6 + 4] = pos[j * 3 + 1]; lp[l6 + 5] = pos[j * 3 + 2]
            const alpha = (1 - d / maxDist) * intensity * 0.3
            const h = getModulatedHue(hueOffset + chunk.palette[0] + d * 0.02, colorMode)
            tempColor.setHSL(h, 0.3, alpha)
            lc[l6] = tempColor.r; lc[l6 + 1] = tempColor.g; lc[l6 + 2] = tempColor.b
            lc[l6 + 3] = tempColor.r; lc[l6 + 4] = tempColor.g; lc[l6 + 5] = tempColor.b
            lineIdx++
          }
        }
      }
      for (let i = lineIdx; i < maxLines; i++) { const l6 = i * 6; for (let k = 0; k < 6; k++) { lp[l6 + k] = 0; lc[l6 + k] = 0 } }
      lineGeo.attributes.position.needsUpdate = true
      lineGeo.attributes.color.needsUpdate = true
      lineGeo.setDrawRange(0, lineIdx * 2)
    },
    dispose() {
      geo.dispose(); mat.dispose(); lineGeo.dispose(); lineMat.dispose()
      debrisMeshes.forEach(dm => { dm.geometry.dispose(); (dm.material as THREE.Material).dispose() })
      group.clear()
    },
  }
}

function createNebulaBiome(chunk: ChunkData): BiomeInstance {
  const group = new THREE.Group()
  const count = Math.floor(1200 * chunk.density * (3 - chunk.lod))
  const size = 55
  const attractorCount = 4 + Math.floor(chunk.seed * 6)

  const coreCount = Math.floor(count * 0.08)
  const dustCount = count - coreCount

  const pos = new Float32Array(dustCount * 3)
  const vel = new Float32Array(dustCount * 3)
  const charge = new Float32Array(dustCount)

  const attractors = generateAttractors(chunk.seed, attractorCount, size)
  attractors.forEach((a, i) => {
    a.strength *= (i % 3 === 0 ? -1.5 : 2.0)
    a.radius = 10 + prand(chunk.seed + i * 99) * 20
  })

  for (let i = 0; i < dustCount; i++) {
    const i3 = i * 3
    const nearAtt = attractors[i % attractors.length]
    pos[i3] = nearAtt.x + (prandN(chunk.seed, i) - 0.5) * nearAtt.radius * 1.5
    pos[i3 + 1] = nearAtt.y + (prandN(chunk.seed, i + 10000) - 0.5) * nearAtt.radius * 1.5
    pos[i3 + 2] = nearAtt.z + (prandN(chunk.seed, i + 20000) - 0.5) * nearAtt.radius * 1.5
    const toCenter = Math.sqrt((pos[i3] - nearAtt.x) ** 2 + (pos[i3 + 2] - nearAtt.z) ** 2) + 0.1
    vel[i3] = -(pos[i3 + 2] - nearAtt.z) / toCenter * 6 * (prandN(chunk.seed, i + 30000) * 0.5 + 0.75)
    vel[i3 + 1] = (prandN(chunk.seed, i + 40000) - 0.5) * 4
    vel[i3 + 2] = (pos[i3] - nearAtt.x) / toCenter * 6 * (prandN(chunk.seed, i + 50000) * 0.5 + 0.75)
    charge[i] = prandN(chunk.seed, i + 60000) > 0.5 ? 1 : -1
  }

  // Pick varied geometry for dust
  const dustGeoChoice = Math.floor(prand(chunk.seed + 0.33) * 4)
  const dustGeo = dustGeoChoice === 0 ? new THREE.SphereGeometry(1, 4, 3)
    : dustGeoChoice === 1 ? new THREE.TetrahedronGeometry(1, 0)
    : dustGeoChoice === 2 ? new THREE.OctahedronGeometry(1, 0)
    : new THREE.BoxGeometry(1, 1, 1)
  const dustMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })
  const dustMesh = new THREE.InstancedMesh(dustGeo, dustMat, dustCount)
  group.add(dustMesh)

  // Cores — varied shapes
  const coreGeo = pickGeometry(chunk.seed + 0.88, 1, chunk.lod)
  const coreMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false })
  const coreMesh = new THREE.InstancedMesh(coreGeo, coreMat, coreCount)
  group.add(coreMesh)

  const corePos = new Float32Array(coreCount * 3)
  for (let i = 0; i < coreCount; i++) {
    const att = attractors[i % attractors.length]
    corePos[i * 3] = att.x + (prandN(chunk.seed, i + 80000) - 0.5) * 5
    corePos[i * 3 + 1] = att.y + (prandN(chunk.seed, i + 90000) - 0.5) * 5
    corePos[i * 3 + 2] = att.z + (prandN(chunk.seed, i + 100000) - 0.5) * 5
  }

  // Add Lissajous/spirograph orbital trails
  const trailCount = 1 + Math.floor(prand(chunk.seed + 0.44) * 3)
  const trailMeshes: THREE.Line[] = []
  for (let tr = 0; tr < trailCount; tr++) {
    const pts = chunk.lod === 0 ? 120 : 60
    const trGeo = prand(chunk.seed + tr * 3.3) > 0.5
      ? lissajousGeometry(chunk.seed + tr * 5.5, 8 + prand(chunk.seed + tr) * 12, pts)
      : spirographGeometry(chunk.seed + tr * 7.7, 6 + prand(chunk.seed + tr + 1) * 10, pts)
    const trMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false })
    const trMesh = new THREE.Line(trGeo, trMat)
    trMesh.position.set(
      (prandN(chunk.seed, tr + 110000) - 0.5) * 30,
      (prandN(chunk.seed, tr + 120000) - 0.5) * 30,
      (prandN(chunk.seed, tr + 130000) - 0.5) * 30,
    )
    trailMeshes.push(trMesh)
    group.add(trMesh)
  }

  return {
    group,
    populate(t, delta, intensity, hueOffset, colorMode, mic, gravityMode) {
      const micPulse = mic.active ? 1 + mic.bass * 0.8 + (mic.beat ? 0.5 : 0) : 1

      for (let a = 0; a < attractors.length; a++) {
        const att = attractors[a]
        const phase = t * 0.05 * (a % 2 === 0 ? 1 : -1) + a * 2.1
        att.x += Math.sin(phase) * 0.3 * delta * 60
        att.z += Math.cos(phase) * 0.3 * delta * 60
        if (mic.beat) att.strength *= 1.3
        else att.strength *= 0.997
      }

      // Use simple physics for nebula (agent system used by storm)
      physicsStep(pos, vel, dustCount, attractors, delta, chunk.seed, t, 0.992, 15 * micPulse, 0.8, 3.0, gravityMode)

      for (let i = 0; i < dustCount; i++) {
        const i3 = i * 3
        dummy.position.set(pos[i3], pos[i3 + 1], pos[i3 + 2])
        const spd = Math.sqrt(vel[i3] ** 2 + vel[i3 + 1] ** 2 + vel[i3 + 2] ** 2)
        const s = (0.03 + spd * 0.008 + (mic.active ? mic.treble * 0.02 : 0)) * chunk.scale * intensity * micPulse
        dummy.scale.setScalar(s)
        dummy.rotation.set(t * 0.1 + i, t * 0.07, 0) // rotate non-spheres
        dummy.updateMatrix()
        dustMesh.setMatrixAt(i, dummy.matrix)
        const hue = getModulatedHue(hueOffset + chunk.palette[0] + charge[i] * 0.15 + spd * 0.02 + t * 0.01, colorMode)
        const lum = (0.2 + spd * 0.04 + (mic.active ? mic.volume * 0.3 : 0.05)) * intensity
        tempColor.setHSL(hue, 0.75 + charge[i] * 0.15, Math.min(0.8, lum))
        dustMesh.setColorAt(i, tempColor)
      }
      dustMesh.instanceMatrix.needsUpdate = true
      if (dustMesh.instanceColor) dustMesh.instanceColor.needsUpdate = true

      for (let i = 0; i < coreCount; i++) {
        const i3 = i * 3
        const pulse = 1 + 0.3 * Math.sin(t * 0.5 + i * 2.1) + (mic.active ? mic.bass * 0.5 : 0)
        dummy.position.set(corePos[i3], corePos[i3 + 1], corePos[i3 + 2])
        dummy.scale.setScalar((1.5 + prandN(chunk.seed, i + 110000) * 2) * chunk.scale * pulse * intensity)
        dummy.rotation.set(t * 0.05 + i, t * 0.03 + i * 0.5, 0)
        dummy.updateMatrix()
        coreMesh.setMatrixAt(i, dummy.matrix)
        const hue = getModulatedHue(hueOffset + chunk.palette[0] + 0.1 + Math.sin(t * 0.2 + i) * 0.1, colorMode)
        tempColor.setHSL(hue, 0.5, 0.15 * intensity * pulse)
        coreMesh.setColorAt(i, tempColor)
      }
      coreMesh.instanceMatrix.needsUpdate = true
      if (coreMesh.instanceColor) coreMesh.instanceColor.needsUpdate = true

      // Rotate trail curves
      for (let tr = 0; tr < trailMeshes.length; tr++) {
        trailMeshes[tr].rotation.x += delta * 0.02 * (tr % 2 === 0 ? 1 : -1)
        trailMeshes[tr].rotation.y += delta * 0.015
        const h = getModulatedHue(hueOffset + chunk.palette[0] + tr * 0.2 + t * 0.01, colorMode)
        ;(trailMeshes[tr].material as THREE.LineBasicMaterial).color.setHSL(h, 0.6, 0.12 * intensity)
      }
    },
    dispose() {
      dustGeo.dispose(); dustMat.dispose(); dustMesh.dispose()
      coreGeo.dispose(); coreMat.dispose(); coreMesh.dispose()
      trailMeshes.forEach(m => { m.geometry.dispose(); (m.material as THREE.Material).dispose() })
      group.clear()
    },
  }
}

function createFractalBiome(chunk: ChunkData): BiomeInstance {
  const group = new THREE.Group()
  const maxDepth = chunk.lod === 0 ? 6 : chunk.lod === 1 ? 5 : 4
  const branchAngle = Math.PI / (3 + chunk.seed * 4)
  const baseLength = 2.5 * chunk.scale
  const treeCount = 2 + Math.floor(chunk.seed * 4)
  const branchesPerTrunk = 2 + Math.floor(prand(chunk.seed + 0.5) * 5)

  interface Branch { sx: number; sy: number; sz: number; angle: number; angleY: number; depth: number; length: number; treeIdx: number }
  const branches: Branch[] = []

  const treePositions: [number, number, number][] = []
  for (let t = 0; t < treeCount; t++) {
    treePositions.push([
      (prandN(chunk.seed, t * 3) - 0.5) * 45,
      (prandN(chunk.seed, t * 3 + 1) - 0.5) * 45,
      (prandN(chunk.seed, t * 3 + 2) - 0.5) * 45,
    ])
  }

  for (let t = 0; t < treeCount; t++) {
    const [tx, ty, tz] = treePositions[t]
    const queue: Branch[] = []
    const treeAngleOffset = prandN(chunk.seed, t + 500) * Math.PI * 2
    const treeBranchAngle = branchAngle * (0.5 + prandN(chunk.seed, t + 600) * 1.0)

    for (let i = 0; i < branchesPerTrunk; i++) {
      const a = (i / branchesPerTrunk) * Math.PI * 2 + treeAngleOffset
      queue.push({ sx: tx, sy: ty, sz: tz, angle: a, angleY: Math.PI / 2 - 0.4 + prandN(chunk.seed, t * 10 + i) * 0.8, depth: 0, length: baseLength * (0.6 + prandN(chunk.seed, t * 10 + i + 100) * 0.8), treeIdx: t })
    }

    while (queue.length > 0) {
      const b = queue.shift()!
      branches.push(b)
      if (b.depth >= maxDepth) continue
      const ex = b.sx + Math.cos(b.angle) * Math.sin(b.angleY) * b.length
      const ey = b.sy + Math.cos(b.angleY) * b.length
      const ez = b.sz + Math.sin(b.angle) * Math.sin(b.angleY) * b.length
      const childLen = b.length * (0.5 + prandN(chunk.seed, b.depth * 100 + t) * 0.25)
      // 2-4 branches per node
      const childCount = 2 + Math.floor(prandN(chunk.seed, b.depth * 7 + t * 13) * 3)
      for (let c = 0; c < childCount; c++) {
        const angleOff = (c - (childCount - 1) / 2) * treeBranchAngle
        queue.push({ sx: ex, sy: ey, sz: ez, angle: b.angle + angleOff + (prandN(chunk.seed, b.depth + c + t * 19) - 0.5) * 0.4, angleY: b.angleY + (prandN(chunk.seed, b.depth + c + t * 5) - 0.5) * 0.5, depth: b.depth + 1, length: childLen, treeIdx: t })
      }
    }
  }

  const positions = new Float32Array(branches.length * 6)
  const colors = new Float32Array(branches.length * 6)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false })
  group.add(new THREE.LineSegments(geo, mat))

  // Glowing tip nodes — varied geometry
  const tipBranches = branches.filter(b => b.depth === maxDepth)
  const tipCount = tipBranches.length
  const tipGeo = pickGeometry(chunk.seed + 0.123, 0.2, chunk.lod)
  const tipMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
  const tipMesh = new THREE.InstancedMesh(tipGeo, tipMat, Math.min(tipCount, 500))
  group.add(tipMesh)

  // Add orbiting physics particles along branches
  const orbCount = Math.floor(80 * chunk.density * (3 - chunk.lod))
  const orbPos = new Float32Array(orbCount * 3)
  const orbVel = new Float32Array(orbCount * 3)
  const orbCol = new Float32Array(orbCount * 3)
  const orbAttractors: Attractor[] = treePositions.map((p, i) => ({
    x: p[0], y: p[1], z: p[2],
    strength: 50 + prandN(chunk.seed, i + 700) * 100,
    radius: 15 + prandN(chunk.seed, i + 800) * 10,
  }))
  for (let i = 0; i < orbCount; i++) {
    const i3 = i * 3
    const tree = treePositions[i % treeCount]
    orbPos[i3] = tree[0] + (prandN(chunk.seed, i + 200000) - 0.5) * 20
    orbPos[i3 + 1] = tree[1] + (prandN(chunk.seed, i + 210000) - 0.5) * 20
    orbPos[i3 + 2] = tree[2] + (prandN(chunk.seed, i + 220000) - 0.5) * 20
    orbVel[i3] = (prandN(chunk.seed, i + 230000) - 0.5) * 6
    orbVel[i3 + 1] = (prandN(chunk.seed, i + 240000) - 0.5) * 6
    orbVel[i3 + 2] = (prandN(chunk.seed, i + 250000) - 0.5) * 6
  }
  const orbGeo = new THREE.BufferGeometry()
  orbGeo.setAttribute('position', new THREE.BufferAttribute(orbPos, 3))
  orbGeo.setAttribute('color', new THREE.BufferAttribute(orbCol, 3))
  const orbMat = new THREE.PointsMaterial({ size: 0.1, vertexColors: true, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true })
  group.add(new THREE.Points(orbGeo, orbMat))

  return {
    group,
    populate(t, delta, intensity, hueOffset, colorMode, mic, gravityMode) {
      const posArr = geo.attributes.position.array as Float32Array
      const colArr = geo.attributes.color.array as Float32Array
      const micGrow = mic.active ? 1 + mic.bass * 0.5 + (mic.beat ? 0.3 : 0) : 1
      const twistAmt = 0.4 + (mic.active ? mic.treble * 1.2 : 0)

      let tipIdx = 0
      const maxTips = Math.min(tipCount, 500)
      for (let i = 0; i < branches.length; i++) {
        const b = branches[i]
        const treePhase = b.treeIdx * 1.7
        const breathe = (1 + 0.2 * Math.sin(t * 0.25 + b.depth * 0.4 + treePhase)) * micGrow
        const twist = Math.sin(t * 0.15 + b.depth * 0.7 + chunk.seed * 10 + treePhase) * twistAmt
        const len = b.length * breathe

        const i6 = i * 6
        posArr[i6] = b.sx; posArr[i6 + 1] = b.sy; posArr[i6 + 2] = b.sz
        const ex = b.sx + Math.cos(b.angle + twist) * Math.sin(b.angleY) * len
        const ey = b.sy + Math.cos(b.angleY) * len
        const ez = b.sz + Math.sin(b.angle + twist) * Math.sin(b.angleY) * len
        posArr[i6 + 3] = ex; posArr[i6 + 4] = ey; posArr[i6 + 5] = ez

        const depthFrac = b.depth / maxDepth
        const hue = getModulatedHue(hueOffset + chunk.palette[0] + depthFrac * 0.4 + b.treeIdx * 0.15 + t * 0.015, colorMode)
        const lum = (0.3 + (1 - depthFrac) * 0.35 + (mic.active ? mic.volume * 0.2 : 0)) * intensity
        tempColor.setHSL(hue, 0.7 + depthFrac * 0.2, lum)
        colArr[i6] = tempColor.r; colArr[i6 + 1] = tempColor.g; colArr[i6 + 2] = tempColor.b
        colArr[i6 + 3] = tempColor.r; colArr[i6 + 4] = tempColor.g; colArr[i6 + 5] = tempColor.b

        if (b.depth === maxDepth && tipIdx < maxTips) {
          dummy.position.set(ex, ey, ez)
          const pulse = 0.5 + 0.5 * Math.sin(t * 2 + tipIdx * 0.5)
          dummy.scale.setScalar((0.3 + pulse * 0.3) * intensity * micGrow)
          dummy.rotation.set(t * 0.3 + tipIdx, t * 0.2, 0)
          dummy.updateMatrix()
          tipMesh.setMatrixAt(tipIdx, dummy.matrix)
          const tipHue = getModulatedHue(hueOffset + chunk.palette[0] + 0.5 + Math.sin(t * 0.5 + tipIdx) * 0.1, colorMode)
          tempColor.setHSL(tipHue, 0.9, (0.3 + pulse * 0.3) * intensity)
          tipMesh.setColorAt(tipIdx, tempColor)
          tipIdx++
        }
      }
      geo.attributes.position.needsUpdate = true
      geo.attributes.color.needsUpdate = true
      tipMesh.count = tipIdx
      tipMesh.instanceMatrix.needsUpdate = true
      if (tipMesh.instanceColor) tipMesh.instanceColor.needsUpdate = true

      // Physics on orb particles
      physicsStep(orbPos, orbVel, orbCount, orbAttractors, delta, chunk.seed, t, 0.993, 8, 0.4, 2.0, gravityMode)
      const oc = orbGeo.attributes.color.array as Float32Array
      for (let i = 0; i < orbCount; i++) {
        const i3 = i * 3
        const spd = Math.sqrt(orbVel[i3] ** 2 + orbVel[i3 + 1] ** 2 + orbVel[i3 + 2] ** 2)
        const h = getModulatedHue(hueOffset + chunk.palette[0] + 0.3 + spd * 0.04 + t * 0.01, colorMode)
        tempColor.setHSL(h, 0.8, (0.15 + spd * 0.04) * intensity)
        oc[i3] = tempColor.r; oc[i3 + 1] = tempColor.g; oc[i3 + 2] = tempColor.b
      }
      orbGeo.attributes.position.needsUpdate = true
      orbGeo.attributes.color.needsUpdate = true
    },
    dispose() { geo.dispose(); mat.dispose(); tipGeo.dispose(); tipMat.dispose(); tipMesh.dispose(); orbGeo.dispose(); orbMat.dispose(); group.clear() },
  }
}

function createCrystalBiome(chunk: ChunkData): BiomeInstance {
  const group = new THREE.Group()
  const clusterCount = 3 + Math.floor(chunk.seed * 5)
  const allMeshes: THREE.Mesh[] = []

  interface CrystalCluster { meshes: THREE.Mesh[]; center: [number, number, number]; orbitRadius: number; orbitSpeed: number; orbitPhase: number }
  const clusters: CrystalCluster[] = []

  for (let c = 0; c < clusterCount; c++) {
    const cx = (prandN(chunk.seed, c * 3) - 0.5) * 40
    const cy = (prandN(chunk.seed, c * 3 + 1) - 0.5) * 40
    const cz = (prandN(chunk.seed, c * 3 + 2) - 0.5) * 40
    const ringCount = 2 + Math.floor(prandN(chunk.seed, c + 100) * 6)
    const clusterMeshes: THREE.Mesh[] = []

    for (let i = 0; i < ringCount; i++) {
      const radius = (1 + i * (0.6 + prandN(chunk.seed, c * 10 + i) * 1.0)) * chunk.scale
      // Varied ring/shape types
      const shapeChoice = Math.floor(prandN(chunk.seed, c * 10 + i + 999) * 5)
      const segments = chunk.lod === 0 ? 64 : 32
      let rGeo: THREE.BufferGeometry
      if (shapeChoice === 0) rGeo = new THREE.TorusGeometry(radius, 0.015 + i * 0.005, 8, segments)
      else if (shapeChoice === 1) rGeo = new THREE.TorusKnotGeometry(radius * 0.6, 0.02 + i * 0.003, segments * 2, 8)
      else if (shapeChoice === 2) rGeo = new THREE.RingGeometry(radius * 0.7, radius, segments)
      else if (shapeChoice === 3) rGeo = new THREE.CylinderGeometry(radius, radius, 0.02, segments, 1, true)
      else rGeo = new THREE.TorusGeometry(radius, 0.04, 3, segments)
      const rMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
      const mesh = new THREE.Mesh(rGeo, rMat)
      mesh.position.set(cx, cy, cz)
      clusterMeshes.push(mesh)
      allMeshes.push(mesh)
      group.add(mesh)
    }

    clusters.push({
      meshes: clusterMeshes,
      center: [cx, cy, cz],
      orbitRadius: 3 + prandN(chunk.seed, c + 200) * 8,
      orbitSpeed: 0.1 + prandN(chunk.seed, c + 300) * 0.4,
      orbitPhase: prandN(chunk.seed, c + 400) * Math.PI * 2,
    })
  }

  // Add floating crystal shards — instanced procedural geo
  const shardCount = Math.floor(60 * chunk.density * (3 - chunk.lod))
  const shardGeo = pickGeometry(chunk.seed + 0.567, 0.3, chunk.lod)
  const shardMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: prand(chunk.seed + 0.99) > 0.5 })
  const shardMesh = new THREE.InstancedMesh(shardGeo, shardMat, shardCount)
  group.add(shardMesh)

  const shardPos = new Float32Array(shardCount * 3)
  const shardVel = new Float32Array(shardCount * 3)
  const shardAttractors = clusters.map(cl => ({ x: cl.center[0], y: cl.center[1], z: cl.center[2], strength: 60, radius: 18 }))
  for (let i = 0; i < shardCount; i++) {
    const i3 = i * 3
    const cl = clusters[i % clusters.length]
    shardPos[i3] = cl.center[0] + (prandN(chunk.seed, i + 300000) - 0.5) * 20
    shardPos[i3 + 1] = cl.center[1] + (prandN(chunk.seed, i + 310000) - 0.5) * 20
    shardPos[i3 + 2] = cl.center[2] + (prandN(chunk.seed, i + 320000) - 0.5) * 20
    shardVel[i3] = (prandN(chunk.seed, i + 330000) - 0.5) * 4
    shardVel[i3 + 1] = (prandN(chunk.seed, i + 340000) - 0.5) * 4
    shardVel[i3 + 2] = (prandN(chunk.seed, i + 350000) - 0.5) * 4
  }

  return {
    group,
    populate(t, delta, intensity, hueOffset, colorMode, mic, gravityMode) {
      const micSpeed = mic.active ? 1 + mic.bass * 2 : 1

      for (let c = 0; c < clusters.length; c++) {
        const cluster = clusters[c]
        const orbitX = Math.sin(t * cluster.orbitSpeed + cluster.orbitPhase) * cluster.orbitRadius
        const orbitZ = Math.cos(t * cluster.orbitSpeed + cluster.orbitPhase) * cluster.orbitRadius

        for (let i = 0; i < cluster.meshes.length; i++) {
          const mesh = cluster.meshes[i]
          const speed = (0.08 + i * 0.04 + prandN(chunk.seed, c * 20 + i) * 0.06) * micSpeed

          mesh.position.set(
            cluster.center[0] + orbitX * (i % 2 === 0 ? 1 : -0.5),
            cluster.center[1] + Math.sin(t * speed * 0.3 + c) * cluster.orbitRadius * 0.3,
            cluster.center[2] + orbitZ * (i % 2 === 0 ? 1 : -0.5),
          )
          mesh.rotation.x = t * speed * (i % 2 === 0 ? 1 : -1)
          mesh.rotation.y = t * speed * 0.7
          mesh.rotation.z = Math.sin(t * 0.15 + i + c * 3) * 0.5

          const breathe = 1 + 0.25 * Math.sin(t * 0.25 + i * 0.7 + c * 2) + (mic.active ? mic.mid * 0.4 : 0)
          mesh.scale.setScalar(breathe + (mic.beat ? 0.4 : 0))

          const hue = getModulatedHue(hueOffset + chunk.palette[0] + i / cluster.meshes.length * 0.3 + c * 0.2 + t * 0.008, colorMode)
          const meshMat = mesh.material as THREE.MeshBasicMaterial
          meshMat.color.setHSL(hue, 0.8, (0.3 + (mic.active ? mic.treble * 0.2 : 0)) * intensity)
          meshMat.opacity = 0.25 + 0.2 * Math.sin(t * 0.8 + i * 1.2 + c) + (mic.active ? mic.treble * 0.15 : 0)
        }
      }

      // Physics on crystal shards
      physicsStep(shardPos, shardVel, shardCount, shardAttractors, delta, chunk.seed, t, 0.993, 10, 0.5, 1.5, gravityMode)
      for (let i = 0; i < shardCount; i++) {
        const i3 = i * 3
        dummy.position.set(shardPos[i3], shardPos[i3 + 1], shardPos[i3 + 2])
        const spd = Math.sqrt(shardVel[i3] ** 2 + shardVel[i3 + 1] ** 2 + shardVel[i3 + 2] ** 2)
        dummy.scale.setScalar((0.5 + spd * 0.05) * chunk.scale * intensity)
        dummy.rotation.set(t * 0.2 + i, t * 0.15 + i * 0.3, t * 0.1)
        dummy.updateMatrix()
        shardMesh.setMatrixAt(i, dummy.matrix)
        const h = getModulatedHue(hueOffset + chunk.palette[0] + spd * 0.04 + i * 0.01 + t * 0.01, colorMode)
        tempColor.setHSL(h, 0.85, (0.2 + spd * 0.03) * intensity)
        shardMesh.setColorAt(i, tempColor)
      }
      shardMesh.instanceMatrix.needsUpdate = true
      if (shardMesh.instanceColor) shardMesh.instanceColor.needsUpdate = true
    },
    dispose() {
      allMeshes.forEach(m => { m.geometry.dispose(); (m.material as THREE.Material).dispose() })
      shardGeo.dispose(); shardMat.dispose(); shardMesh.dispose()
      group.clear()
    },
  }
}

function createTesseractBiome(chunk: ChunkData): BiomeInstance {
  const group = new THREE.Group()
  const cubeCount = 2 + Math.floor(chunk.seed * 4)
  const VERTS = tesseractVertices()
  const EDGES = tesseractEdges()

  interface TesseractInstance {
    geo: THREE.BufferGeometry
    offset: [number, number, number]
    scale: number
    speedMul: number
    phaseOffset: number
    trails: [number, number, number][][]
    trailLength: number
  }

  const instances: TesseractInstance[] = []
  const lineMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })

  for (let c = 0; c < cubeCount; c++) {
    const trailLength = chunk.lod === 0 ? 10 : chunk.lod === 1 ? 6 : 3
    const maxLines = EDGES.length + EDGES.length * trailLength
    const positions = new Float32Array(maxLines * 6)
    const colors = new Float32Array(maxLines * 6)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const lineSegs = new THREE.LineSegments(geo, lineMat)
    const ox = (prandN(chunk.seed, c * 3) - 0.5) * 45
    const oy = (prandN(chunk.seed, c * 3 + 1) - 0.5) * 45
    const oz = (prandN(chunk.seed, c * 3 + 2) - 0.5) * 45
    lineSegs.position.set(ox, oy, oz)
    group.add(lineSegs)

    instances.push({
      geo,
      offset: [ox, oy, oz],
      scale: (1.5 + prandN(chunk.seed, c + 100) * 5) * chunk.scale,
      speedMul: 0.3 + prandN(chunk.seed, c + 200) * 1.2,
      phaseOffset: prandN(chunk.seed, c + 300) * Math.PI * 2,
      trails: VERTS.map(() => []),
      trailLength,
    })
  }

  // Add helixes connecting tesseracts
  const helixCount = Math.min(cubeCount - 1, 3)
  const helixMeshes: THREE.Line[] = []
  for (let h = 0; h < helixCount; h++) {
    const pts = chunk.lod === 0 ? 80 : 40
    const hGeo = helixGeometry(chunk.seed + h * 11.3, 4 + prand(chunk.seed + h) * 8, pts)
    const hMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false })
    const hMesh = new THREE.Line(hGeo, hMat)
    const inst = instances[h]
    hMesh.position.set(inst.offset[0], inst.offset[1], inst.offset[2])
    helixMeshes.push(hMesh)
    group.add(hMesh)
  }

  return {
    group,
    populate(t, _delta, intensity, hueOffset, colorMode, mic, _gravityMode) {
      for (const inst of instances) {
        const angleXW = (t * 0.2 + inst.phaseOffset) * inst.speedMul
        const angleYZ = (t * 0.15 + inst.phaseOffset * 0.7) * inst.speedMul
        const angleXY = mic.active ? mic.bass * 0.5 : Math.sin(t * 0.1) * 0.2
        const angleZW = mic.active ? mic.treble * 0.3 : Math.cos(t * 0.13) * 0.15

        const projected: [number, number, number][] = VERTS.map(v => {
          let r: Vec4 = rotateXW(v, angleXW)
          r = rotateYZ(r, angleYZ)
          r = rotateXY(r, angleXY)
          r = rotateZW(r, angleZW)
          const p = project4Dto3D(r, 3)
          return [p[0] * inst.scale, p[1] * inst.scale, p[2] * inst.scale]
        })

        for (let i = 0; i < VERTS.length; i++) {
          inst.trails[i].unshift(projected[i])
          if (inst.trails[i].length > inst.trailLength) inst.trails[i].pop()
        }

        const posArr = inst.geo.attributes.position.array as Float32Array
        const colArr = inst.geo.attributes.color.array as Float32Array
        let idx = 0
        const beatScale = mic.beat ? 1.2 : 1

        for (const [a, b] of EDGES) {
          const pa = projected[a], pb = projected[b]
          const i6 = idx * 6
          posArr[i6] = pa[0] * beatScale; posArr[i6+1] = pa[1] * beatScale; posArr[i6+2] = pa[2] * beatScale
          posArr[i6+3] = pb[0] * beatScale; posArr[i6+4] = pb[1] * beatScale; posArr[i6+5] = pb[2] * beatScale
          const hue = getModulatedHue(hueOffset + chunk.palette[0] + a / 16 + inst.phaseOffset * 0.1 + t * 0.04, colorMode)
          tempColor.setHSL(hue, 0.9, 0.5 * intensity)
          colArr[i6] = tempColor.r; colArr[i6+1] = tempColor.g; colArr[i6+2] = tempColor.b
          colArr[i6+3] = tempColor.r; colArr[i6+4] = tempColor.g; colArr[i6+5] = tempColor.b
          idx++
        }

        for (let frame = 1; frame < inst.trailLength; frame++) {
          const alpha = 1 - frame / inst.trailLength
          for (const [a, b] of EDGES) {
            const i6 = idx * 6
            if (frame >= inst.trails[a].length || frame >= inst.trails[b].length) {
              for (let k = 0; k < 6; k++) { posArr[i6+k] = 0; colArr[i6+k] = 0 }
              idx++; continue
            }
            const pa = inst.trails[a][frame], pb = inst.trails[b][frame]
            posArr[i6] = pa[0]; posArr[i6+1] = pa[1]; posArr[i6+2] = pa[2]
            posArr[i6+3] = pb[0]; posArr[i6+4] = pb[1]; posArr[i6+5] = pb[2]
            const hue = getModulatedHue(hueOffset + chunk.palette[0] + a / 16 + t * 0.04 + frame * 0.02, colorMode)
            tempColor.setHSL(hue, 0.7, 0.3 * alpha * intensity)
            colArr[i6] = tempColor.r; colArr[i6+1] = tempColor.g; colArr[i6+2] = tempColor.b
            colArr[i6+3] = tempColor.r; colArr[i6+4] = tempColor.g; colArr[i6+5] = tempColor.b
            idx++
          }
        }

        inst.geo.attributes.position.needsUpdate = true
        inst.geo.attributes.color.needsUpdate = true
        inst.geo.setDrawRange(0, idx * 2)
      }

      for (let h = 0; h < helixMeshes.length; h++) {
        helixMeshes[h].rotation.x = t * 0.1 * (h % 2 === 0 ? 1 : -1)
        helixMeshes[h].rotation.y = t * 0.07
        const hue = getModulatedHue(hueOffset + chunk.palette[0] + h * 0.2 + t * 0.02, colorMode)
        ;(helixMeshes[h].material as THREE.LineBasicMaterial).color.setHSL(hue, 0.7, 0.15 * intensity)
      }
    },
    dispose() {
      instances.forEach(i => i.geo.dispose())
      lineMat.dispose()
      helixMeshes.forEach(m => { m.geometry.dispose(); (m.material as THREE.Material).dispose() })
      group.clear()
    },
  }
}

function createParticleStormBiome(chunk: ChunkData): BiomeInstance {
  const group = new THREE.Group()
  // Budget-conscious — fewer raw particles, they merge into shapes
  const count = Math.floor(800 * chunk.density * (3 - chunk.lod))
  const size = 55
  const attractorCount = 5 + Math.floor(chunk.seed * 5)

  const pos = new Float32Array(count * 3)
  const vel = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const alive = new Uint8Array(count).fill(1)
  const behaviors = assignBehaviors(count, chunk.seed)
  const spawned: SpawnedMesh[] = []

  const attractors = generateAttractors(chunk.seed, attractorCount, size)
  attractors.forEach((a, i) => {
    a.strength *= 1.5 + prand(chunk.seed + i) * 2
    if (i % 2 === 0) a.strength *= -1
    a.radius = 8 + prand(chunk.seed + i + 50) * 18
  })

  for (let i = 0; i < count; i++) {
    const i3 = i * 3
    pos[i3] = (prandN(chunk.seed, i * 3) - 0.5) * size
    pos[i3 + 1] = (prandN(chunk.seed, i * 3 + 1) - 0.5) * size
    pos[i3 + 2] = (prandN(chunk.seed, i * 3 + 2) - 0.5) * size
    vel[i3] = (prandN(chunk.seed, i * 3 + 1000) - 0.5) * 14
    vel[i3 + 1] = (prandN(chunk.seed, i * 3 + 2000) - 0.5) * 14
    vel[i3 + 2] = (prandN(chunk.seed, i * 3 + 3000) - 0.5) * 14
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const mat = new THREE.PointsMaterial({
    size: 0.15, vertexColors: true, transparent: true, opacity: 0.9,
    sizeAttenuation: true, blending: THREE.AdditiveBlending, depthWrite: false,
  })
  group.add(new THREE.Points(geo, mat))

  // Filaments
  const maxFilaments = Math.min(count, 400)
  const filPos = new Float32Array(maxFilaments * 6)
  const filCol = new Float32Array(maxFilaments * 6)
  const filGeo = new THREE.BufferGeometry()
  filGeo.setAttribute('position', new THREE.BufferAttribute(filPos, 3))
  filGeo.setAttribute('color', new THREE.BufferAttribute(filCol, 3))
  const filMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false })
  group.add(new THREE.LineSegments(filGeo, filMat))

  return {
    group,
    populate(t, delta, intensity, hueOffset, colorMode, mic, gravityMode) {
      const micPulse = mic.active ? 1 + mic.bass * 0.6 + (mic.beat ? 0.5 : 0) : 1

      // Animate attractors
      for (let a = 0; a < attractors.length; a++) {
        const att = attractors[a]
        att.x += Math.sin(t * 0.2 + a * 1.3) * 0.5 * delta * 60
        att.y += Math.cos(t * 0.17 + a * 2.1) * 0.4 * delta * 60
        att.z += Math.sin(t * 0.23 + a * 0.7) * 0.3 * delta * 60
        if (mic.beat && a % 3 === 0) att.strength *= -1
      }

      // Agent step
      agentStep(pos, vel, alive, behaviors, count, attractors, delta, chunk.seed, t, 0.988, 25 * micPulse, 5.0, gravityMode)

      // Cluster merge — particles that converge become shapes
      clusterMerge(pos, vel, alive, count, chunk.seed, t, group, spawned, 12, chunk.lod)

      // Update spawned meshes (warp, pulse, expire)
      updateSpawnedMeshes(spawned, pos, vel, alive, count, delta, t, chunk.seed, intensity, hueOffset, colorMode, group)

      // Render alive particles
      const colArr = geo.attributes.color.array as Float32Array
      for (let i = 0; i < count; i++) {
        const i3 = i * 3
        if (!alive[i]) {
          colArr[i3] = 0; colArr[i3 + 1] = 0; colArr[i3 + 2] = 0
          continue
        }
        const spd = Math.sqrt(vel[i3] ** 2 + vel[i3 + 1] ** 2 + vel[i3 + 2] ** 2)
        const behaviorHue = behaviors[i] * 0.07 // different colors per behavior
        const hue = getModulatedHue(hueOffset + chunk.palette[0] + spd * 0.03 + behaviorHue + t * 0.02, colorMode)
        const lum = (0.2 + spd * 0.03 + (mic.active ? mic.volume * 0.3 : 0.1)) * intensity
        tempColor.setHSL(hue, 0.85, Math.min(0.9, lum))
        colArr[i3] = tempColor.r; colArr[i3 + 1] = tempColor.g; colArr[i3 + 2] = tempColor.b
      }
      geo.attributes.position.needsUpdate = true
      geo.attributes.color.needsUpdate = true

      // Filaments between alive particles
      const fp = filGeo.attributes.position.array as Float32Array
      const fc = filGeo.attributes.color.array as Float32Array
      let fIdx = 0
      const filDist = 6
      const step = Math.max(1, Math.floor(count / 150))
      for (let i = 0; i < count && fIdx < maxFilaments; i += step) {
        if (!alive[i]) continue
        const spd1 = Math.sqrt(vel[i * 3] ** 2 + vel[i * 3 + 1] ** 2 + vel[i * 3 + 2] ** 2)
        if (spd1 < 2) continue
        for (let j = i + step; j < count && fIdx < maxFilaments; j += step) {
          if (!alive[j]) continue
          const dx = pos[i * 3] - pos[j * 3], dy = pos[i * 3 + 1] - pos[j * 3 + 1], dz = pos[i * 3 + 2] - pos[j * 3 + 2]
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
          if (d < filDist) {
            const f6 = fIdx * 6
            fp[f6] = pos[i * 3]; fp[f6+1] = pos[i * 3 + 1]; fp[f6+2] = pos[i * 3 + 2]
            fp[f6+3] = pos[j * 3]; fp[f6+4] = pos[j * 3 + 1]; fp[f6+5] = pos[j * 3 + 2]
            const a2 = (1 - d / filDist) * intensity * 0.4
            const h = getModulatedHue(hueOffset + chunk.palette[0] + spd1 * 0.05, colorMode)
            tempColor.setHSL(h, 0.8, a2)
            fc[f6] = tempColor.r; fc[f6+1] = tempColor.g; fc[f6+2] = tempColor.b
            fc[f6+3] = tempColor.r; fc[f6+4] = tempColor.g; fc[f6+5] = tempColor.b
            fIdx++
          }
        }
      }
      for (let i = fIdx; i < maxFilaments; i++) { const f6 = i * 6; for (let k = 0; k < 6; k++) { fp[f6+k] = 0; fc[f6+k] = 0 } }
      filGeo.attributes.position.needsUpdate = true
      filGeo.attributes.color.needsUpdate = true
      filGeo.setDrawRange(0, fIdx * 2)
    },
    dispose() {
      geo.dispose(); mat.dispose(); filGeo.dispose(); filMat.dispose()
      spawned.forEach(sp => {
        (sp.mesh as THREE.Mesh).geometry.dispose()
        ;((sp.mesh as THREE.Mesh).material as THREE.Material).dispose()
      })
      group.clear()
    },
  }
}

function createKaleidoscopicBiome(chunk: ChunkData): BiomeInstance {
  const group = new THREE.Group()

  const planeCount = 1 + Math.floor(chunk.seed * 3)
  const planes: { mesh: THREE.Mesh; uniforms: Record<string, { value: number }> }[] = []

  for (let p = 0; p < planeCount; p++) {
    const uniforms: Record<string, { value: number }> = {
      uTime: { value: 0 }, uFolds: { value: 3 + (chunk.seed + p * 0.3) * 10 },
      uHueOffset: { value: chunk.palette[0] + p * 0.2 }, uIntensity: { value: 0.5 },
      uBass: { value: 0 }, uSeed: { value: chunk.seed + p * 0.7 },
    }

    const vertexShader = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
    const fragmentShader = `
      uniform float uTime, uFolds, uHueOffset, uIntensity, uBass, uSeed;
      varying vec2 vUv;
      #define PI 3.14159265359
      vec3 hsv2rgb(vec3 c) {
        vec4 K = vec4(1.0,2.0/3.0,1.0/3.0,3.0);
        vec3 p = abs(fract(c.xxx+K.xyz)*6.0-K.www);
        return c.z*mix(K.xxx,clamp(p-K.xxx,0.0,1.0),c.y);
      }
      void main() {
        vec2 uv = vUv - 0.5;
        float r = length(uv);
        float a = atan(uv.y, uv.x);
        float sector = PI / max(2.0, uFolds);
        a = mod(a, sector * 2.0);
        if (a > sector) a = sector * 2.0 - a;
        vec2 p = vec2(cos(a), sin(a)) * r;
        float n1 = sin(p.x*14.0+uTime*0.7+uBass*5.0+uSeed*12.0)*cos(p.y*14.0-uTime*0.5+uSeed*8.0);
        float n2 = sin(r*18.0-uTime*1.0+uSeed*6.0)*0.6;
        float n3 = sin(r*10.0+uTime*0.25)*cos(a*uFolds+uTime*0.4)*0.5;
        float n4 = sin(p.x*8.0-uTime*0.3+uSeed*4.0)*sin(p.y*12.0+uTime*0.6)*0.3;
        float pattern = n1 + n2 + n3 + n4;
        float hue = fract(uHueOffset + pattern*0.12 + r*0.25 + uTime*0.015);
        float val = (0.08 + pattern*0.18 + uBass*0.25) * uIntensity;
        val *= smoothstep(0.7,0.15,r);
        vec3 col = hsv2rgb(vec3(hue, 0.75, max(0.0, val)));
        gl_FragColor = vec4(col, val*0.5);
      }
    `

    const mat = new THREE.ShaderMaterial({
      vertexShader, fragmentShader, uniforms,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    })
    const planeSize = (20 + prandN(chunk.seed, p + 200) * 25) * chunk.scale
    const planeGeo = new THREE.PlaneGeometry(planeSize, planeSize)
    const mesh = new THREE.Mesh(planeGeo, mat)
    mesh.position.set(
      (prandN(chunk.seed, p * 3) - 0.5) * 30,
      (prandN(chunk.seed, p * 3 + 1) - 0.5) * 30,
      (prandN(chunk.seed, p * 3 + 2) - 0.5) * 30,
    )
    mesh.rotation.set(prandN(chunk.seed, p + 10) * Math.PI, prandN(chunk.seed, p + 20) * Math.PI * 2, 0)
    group.add(mesh)
    planes.push({ mesh, uniforms })
  }

  // Orbiting sparks with physics
  const sparkCount = Math.floor(250 * chunk.density * (3 - chunk.lod))
  const sparkPos = new Float32Array(sparkCount * 3)
  const sparkVel = new Float32Array(sparkCount * 3)
  const sparkCol = new Float32Array(sparkCount * 3)

  const sparkAttractors = generateAttractors(chunk.seed + 0.5, 4, 35)
  sparkAttractors.forEach(a => { a.strength = 80 + prand(a.strength) * 250; a.radius = 22 })

  for (let i = 0; i < sparkCount; i++) {
    const i3 = i * 3
    sparkPos[i3] = (prandN(chunk.seed, i + 50000) - 0.5) * 50
    sparkPos[i3 + 1] = (prandN(chunk.seed, i + 60000) - 0.5) * 50
    sparkPos[i3 + 2] = (prandN(chunk.seed, i + 70000) - 0.5) * 50
    sparkVel[i3] = (prandN(chunk.seed, i + 80000) - 0.5) * 10
    sparkVel[i3 + 1] = (prandN(chunk.seed, i + 90000) - 0.5) * 10
    sparkVel[i3 + 2] = (prandN(chunk.seed, i + 100000) - 0.5) * 10
  }

  const sparkGeo = new THREE.BufferGeometry()
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3))
  sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3))
  const sparkMat = new THREE.PointsMaterial({ size: 0.15, vertexColors: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true })
  group.add(new THREE.Points(sparkGeo, sparkMat))

  // Add spirograph curves
  const curveCount = 1 + Math.floor(prand(chunk.seed + 0.22) * 3)
  const curveMeshes: THREE.Line[] = []
  for (let c = 0; c < curveCount; c++) {
    const pts = chunk.lod === 0 ? 200 : 100
    const cGeo = spirographGeometry(chunk.seed + c * 9.9, 8 + prand(chunk.seed + c + 0.5) * 12, pts)
    const cMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false })
    const cMesh = new THREE.Line(cGeo, cMat)
    cMesh.position.set(
      (prandN(chunk.seed, c + 500000) - 0.5) * 20,
      (prandN(chunk.seed, c + 510000) - 0.5) * 20,
      (prandN(chunk.seed, c + 520000) - 0.5) * 20,
    )
    curveMeshes.push(cMesh)
    group.add(cMesh)
  }

  return {
    group,
    populate(t, delta, intensity, hueOffset, colorMode, mic, gravityMode) {
      for (const plane of planes) {
        plane.uniforms.uTime.value = t
        plane.uniforms.uHueOffset.value = hueOffset + chunk.palette[0]
        plane.uniforms.uIntensity.value = intensity
        plane.uniforms.uBass.value = mic.active ? mic.bass : 0
        plane.uniforms.uFolds.value = plane.uniforms.uFolds.value + (mic.active && mic.beat ? 2 : 0)
        plane.mesh.rotation.z += delta * 0.05
      }

      physicsStep(sparkPos, sparkVel, sparkCount, sparkAttractors, delta, chunk.seed, t, 0.99, 14, 0.5, 2.0, gravityMode)

      const sc = sparkGeo.attributes.color.array as Float32Array
      for (let i = 0; i < sparkCount; i++) {
        const i3 = i * 3
        const spd = Math.sqrt(sparkVel[i3] ** 2 + sparkVel[i3 + 1] ** 2 + sparkVel[i3 + 2] ** 2)
        const h = getModulatedHue(hueOffset + chunk.palette[0] + spd * 0.05 + t * 0.02, colorMode)
        tempColor.setHSL(h, 0.9, (0.3 + spd * 0.04) * intensity)
        sc[i3] = tempColor.r; sc[i3 + 1] = tempColor.g; sc[i3 + 2] = tempColor.b
      }
      sparkGeo.attributes.position.needsUpdate = true
      sparkGeo.attributes.color.needsUpdate = true

      for (let c = 0; c < curveMeshes.length; c++) {
        curveMeshes[c].rotation.x += delta * 0.03 * (c % 2 === 0 ? 1 : -1)
        curveMeshes[c].rotation.z += delta * 0.02
        const h = getModulatedHue(hueOffset + chunk.palette[0] + c * 0.15 + t * 0.01, colorMode)
        ;(curveMeshes[c].material as THREE.LineBasicMaterial).color.setHSL(h, 0.8, 0.12 * intensity)
      }
    },
    dispose() {
      planes.forEach(p => { p.mesh.geometry.dispose(); (p.mesh.material as THREE.Material).dispose() })
      sparkGeo.dispose(); sparkMat.dispose()
      curveMeshes.forEach(m => { m.geometry.dispose(); (m.material as THREE.Material).dispose() })
      group.clear()
    },
  }
}

function createBreathBiome(chunk: ChunkData): BiomeInstance {
  const group = new THREE.Group()
  const CYCLE = 12
  const sphereCount = 3 + Math.floor(chunk.seed * 6)
  const materials: THREE.MeshBasicMaterial[] = []
  const meshes: THREE.Mesh[] = []
  const sphereCenters: [number, number, number][] = []

  for (let i = 0; i < sphereCount; i++) {
    const radius = (1 + prandN(chunk.seed, i * 3) * 3) * chunk.scale
    const detail = chunk.lod === 0 ? 3 : 2
    // Varied polyhedra
    const geoChoice = Math.floor(prandN(chunk.seed, i + 999) * 4)
    const shapeGeo = geoChoice === 0 ? new THREE.IcosahedronGeometry(radius, detail)
      : geoChoice === 1 ? new THREE.DodecahedronGeometry(radius, detail)
      : geoChoice === 2 ? new THREE.OctahedronGeometry(radius, detail)
      : new THREE.TetrahedronGeometry(radius, detail)
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.1, wireframe: true, blending: THREE.AdditiveBlending, depthWrite: false })
    materials.push(mat)
    const mesh = new THREE.Mesh(shapeGeo, mat)
    const cx = (prandN(chunk.seed, i * 3) - 0.5) * 40
    const cy = (prandN(chunk.seed, i * 3 + 1) - 0.5) * 40
    const cz = (prandN(chunk.seed, i * 3 + 2) - 0.5) * 40
    mesh.position.set(cx, cy, cz)
    sphereCenters.push([cx, cy, cz])
    meshes.push(mesh)
    group.add(mesh)
  }

  // Halo particles orbiting spheres
  const haloCount = Math.floor(400 * chunk.density * (3 - chunk.lod))
  const haloPos = new Float32Array(haloCount * 3)
  const haloVel = new Float32Array(haloCount * 3)
  const haloCol = new Float32Array(haloCount * 3)

  const haloAttractors: Attractor[] = sphereCenters.map((c, i) => ({
    x: c[0], y: c[1], z: c[2],
    strength: 80 + prandN(chunk.seed, i + 500) * 120,
    radius: 15 + prandN(chunk.seed, i + 600) * 10,
  }))

  for (let i = 0; i < haloCount; i++) {
    const i3 = i * 3
    const nearSphere = sphereCenters[i % sphereCount]
    const orbR = 3 + prandN(chunk.seed, i + 10000) * 8
    const theta = prandN(chunk.seed, i + 20000) * Math.PI * 2
    const phi = prandN(chunk.seed, i + 30000) * Math.PI
    haloPos[i3] = nearSphere[0] + orbR * Math.sin(phi) * Math.cos(theta)
    haloPos[i3 + 1] = nearSphere[1] + orbR * Math.sin(phi) * Math.sin(theta)
    haloPos[i3 + 2] = nearSphere[2] + orbR * Math.cos(phi)
    // Stronger tangential velocity
    haloVel[i3] = -(haloPos[i3 + 2] - nearSphere[2]) * 0.8 + (prandN(chunk.seed, i + 41000) - 0.5) * 3
    haloVel[i3 + 1] = (prandN(chunk.seed, i + 40000) - 0.5) * 4
    haloVel[i3 + 2] = (haloPos[i3] - nearSphere[0]) * 0.8 + (prandN(chunk.seed, i + 42000) - 0.5) * 3
  }

  const haloGeo = new THREE.BufferGeometry()
  haloGeo.setAttribute('position', new THREE.BufferAttribute(haloPos, 3))
  haloGeo.setAttribute('color', new THREE.BufferAttribute(haloCol, 3))
  const haloMat = new THREE.PointsMaterial({ size: 0.1, vertexColors: true, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true })
  group.add(new THREE.Points(haloGeo, haloMat))

  // Add Lissajous orbital traces around spheres
  const traceCount = Math.min(sphereCount, 3)
  const traceMeshes: THREE.Line[] = []
  for (let tr = 0; tr < traceCount; tr++) {
    const pts = chunk.lod === 0 ? 100 : 50
    const trGeo = lissajousGeometry(chunk.seed + tr * 4.4, 5 + prand(chunk.seed + tr + 0.2) * 6, pts)
    const trMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false })
    const trMesh = new THREE.Line(trGeo, trMat)
    trMesh.position.set(sphereCenters[tr][0], sphereCenters[tr][1], sphereCenters[tr][2])
    traceMeshes.push(trMesh)
    group.add(trMesh)
  }

  return {
    group,
    populate(t, delta, intensity, hueOffset, colorMode, mic, gravityMode) {
      for (let i = 0; i < sphereCount; i++) {
        const phaseOffset = i * (CYCLE / sphereCount) + chunk.seed * CYCLE
        const phase = ((t + phaseOffset) % CYCLE) / CYCLE
        let breath: number
        if (phase < 4 / 12) breath = phase / (4 / 12)
        else if (phase < 6 / 12) breath = 1
        else breath = 1 - (phase - 6 / 12) / (6 / 12)

        const scale = 0.4 + breath * 2 + (mic.active ? mic.bass * 0.5 : 0)
        meshes[i].scale.setScalar(scale)
        meshes[i].rotation.x += delta * 0.02 * (i % 2 === 0 ? 1 : -1)
        meshes[i].rotation.y += delta * 0.015

        const hue = getModulatedHue(hueOffset + chunk.palette[0] + 0.7 + breath * 0.15 + i * 0.1, colorMode)
        materials[i].color.setHSL(hue, 0.6 + breath * 0.2, (0.2 + breath * 0.2) * intensity)
        materials[i].opacity = (0.06 + breath * 0.18) * intensity

        haloAttractors[i].strength = (60 + breath * 100) * (mic.active ? 1 + mic.bass * 0.5 : 1)
      }

      physicsStep(haloPos, haloVel, haloCount, haloAttractors, delta, chunk.seed, t, 0.995, 10, 0.4, 1.5, gravityMode)

      const hc = haloGeo.attributes.color.array as Float32Array
      for (let i = 0; i < haloCount; i++) {
        const i3 = i * 3
        const spd = Math.sqrt(haloVel[i3] ** 2 + haloVel[i3 + 1] ** 2 + haloVel[i3 + 2] ** 2)
        const h = getModulatedHue(hueOffset + chunk.palette[0] + 0.6 + spd * 0.03 + t * 0.01, colorMode)
        tempColor.setHSL(h, 0.65, (0.15 + spd * 0.05) * intensity)
        hc[i3] = tempColor.r; hc[i3 + 1] = tempColor.g; hc[i3 + 2] = tempColor.b
      }
      haloGeo.attributes.position.needsUpdate = true
      haloGeo.attributes.color.needsUpdate = true

      for (let tr = 0; tr < traceMeshes.length; tr++) {
        traceMeshes[tr].rotation.x += delta * 0.04 * (tr % 2 === 0 ? 1 : -1)
        traceMeshes[tr].rotation.y += delta * 0.03
        const h = getModulatedHue(hueOffset + chunk.palette[0] + 0.6 + tr * 0.15 + t * 0.01, colorMode)
        ;(traceMeshes[tr].material as THREE.LineBasicMaterial).color.setHSL(h, 0.5, 0.1 * intensity)
      }
    },
    dispose() {
      meshes.forEach(m => { m.geometry.dispose(); (m.material as THREE.Material).dispose() })
      haloGeo.dispose(); haloMat.dispose()
      traceMeshes.forEach(m => { m.geometry.dispose(); (m.material as THREE.Material).dispose() })
      group.clear()
    },
  }
}

export function createBiome(chunk: ChunkData): BiomeInstance {
  switch (chunk.biome) {
    case 'void': return createVoidBiome(chunk)
    case 'nebula': return createNebulaBiome(chunk)
    case 'fractal': return createFractalBiome(chunk)
    case 'crystal': return createCrystalBiome(chunk)
    case 'tesseract': return createTesseractBiome(chunk)
    case 'particle-storm': return createParticleStormBiome(chunk)
    case 'kaleidoscopic': return createKaleidoscopicBiome(chunk)
    case 'breath': return createBreathBiome(chunk)
  }
}
