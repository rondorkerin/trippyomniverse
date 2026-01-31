import * as THREE from 'three'
import { biomeNoise, chunkSeed, noise6D } from './noise'
import { selectBiome, createBiome, getBiomeHarmonic, type ChunkData, type BiomeInstance } from './biomes'
import { useHyperspaceStore } from './hyperspace'

export const CHUNK_SIZE = 60
export const RENDER_DISTANCE = 2 // chunks in each direction (5×5×5 = 125 max)

interface LiveChunk {
  key: string
  data: ChunkData
  instance: BiomeInstance
}

const liveChunks = new Map<string, LiveChunk>()

function chunkKey(cx: number, cy: number, cz: number): string {
  return `${cx},${cy},${cz}`
}

function computeChunkData(cx: number, cy: number, cz: number): ChunkData {
  const pos = useHyperspaceStore.getState().position
  const w = pos[3], v = pos[4], u = pos[5]

  const seed = chunkSeed(cx, cy, cz, w, v, u)
  const bn = biomeNoise(cx, cy, cz, w, v, u)
  const biome = selectBiome(bn)

  // Density and scale from different noise octaves
  const density = 0.3 + (noise6D(cx * 0.15 + 100, cy * 0.15, cz * 0.15, w * 0.1, v * 0.1, u * 0.1) + 1) * 0.35
  const scale = 0.7 + (noise6D(cx * 0.12, cy * 0.12 + 100, cz * 0.12, w * 0.08, v * 0.08, u * 0.08) + 1) * 0.3

  // Palette hue from noise
  const paletteH = (noise6D(cx * 0.08 + 50, cy * 0.08, cz * 0.08 + 50, w * 0.05, v * 0.05, u * 0.05) + 1) * 0.5

  const harmonic = getBiomeHarmonic(biome)

  // LOD based on distance from player chunk
  const playerChunk = useHyperspaceStore.getState().chunkCoord
  const dist = Math.max(
    Math.abs(cx - playerChunk[0]),
    Math.abs(cy - playerChunk[1]),
    Math.abs(cz - playerChunk[2]),
  )
  const lod = (dist <= 1 ? 0 : dist <= 2 ? 1 : 2) as 0 | 1 | 2

  return {
    coord: [cx, cy, cz],
    seed,
    biome,
    density,
    scale,
    palette: [paletteH, 0.7, 0.5],
    harmonic,
    lod,
    worldPos: [cx * CHUNK_SIZE, cy * CHUNK_SIZE, cz * CHUNK_SIZE],
  }
}

/**
 * Update chunks: determine which should exist, create new ones, dispose old ones.
 * Returns the live chunks for rendering/animation.
 */
export function updateChunks(scene: THREE.Scene): Map<string, LiveChunk> {
  const [pcx, pcy, pcz] = useHyperspaceStore.getState().chunkCoord
  const needed = new Set<string>()

  // Determine needed chunks
  for (let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++) {
    for (let dy = -RENDER_DISTANCE; dy <= RENDER_DISTANCE; dy++) {
      for (let dz = -RENDER_DISTANCE; dz <= RENDER_DISTANCE; dz++) {
        needed.add(chunkKey(pcx + dx, pcy + dy, pcz + dz))
      }
    }
  }

  // Dispose chunks no longer needed
  for (const [key, chunk] of liveChunks) {
    if (!needed.has(key)) {
      chunk.instance.dispose()
      scene.remove(chunk.instance.group)
      liveChunks.delete(key)
    }
  }

  // Create new chunks
  for (const key of needed) {
    if (liveChunks.has(key)) continue
    const [cx, cy, cz] = key.split(',').map(Number) as [number, number, number]
    const data = computeChunkData(cx, cy, cz)
    const instance = createBiome(data)
    instance.group.position.set(...data.worldPos)
    scene.add(instance.group)
    liveChunks.set(key, { key, data, instance })
  }

  return liveChunks
}

/**
 * Animate all live chunks.
 */
export function animateChunks(
  t: number,
  delta: number,
  intensity: number,
  hueOffset: number,
  colorMode: import('./store').ColorMode,
  micState: { bass: number; mid: number; treble: number; volume: number; beat: boolean; active: boolean },
  gravityMode: number,
) {
  for (const chunk of liveChunks.values()) {
    chunk.instance.populate(t, delta, intensity, hueOffset, colorMode, micState, gravityMode)
  }
}

/**
 * Get nearby chunks sorted by distance (for audio).
 */
export function getNearestChunks(count: number): ChunkData[] {
  const pos = useHyperspaceStore.getState().position
  const entries = Array.from(liveChunks.values())
  entries.sort((a, b) => {
    const da = (a.data.worldPos[0] - pos[0]) ** 2 + (a.data.worldPos[1] - pos[1]) ** 2 + (a.data.worldPos[2] - pos[2]) ** 2
    const db = (b.data.worldPos[0] - pos[0]) ** 2 + (b.data.worldPos[1] - pos[1]) ** 2 + (b.data.worldPos[2] - pos[2]) ** 2
    return da - db
  })
  return entries.slice(0, count).map((e) => e.data)
}

/** Dispose all chunks (cleanup) */
export function disposeAllChunks(scene: THREE.Scene) {
  for (const chunk of liveChunks.values()) {
    chunk.instance.dispose()
    scene.remove(chunk.instance.group)
  }
  liveChunks.clear()
}
