/**
 * 6D Simplex Noise — lightweight implementation for chunk seeding,
 * biome selection, density/scale/palette derivation.
 *
 * Based on Stefan Gustavson's simplex noise algorithm, extended to 6D.
 * Uses a hash-based gradient approach for simplicity.
 */

// Permutation table (256 entries, doubled to avoid wrapping)
const perm = new Uint8Array(512)
const grad6 = [
  [1,1,1,0,0,0],[-1,1,1,0,0,0],[1,-1,1,0,0,0],[-1,-1,1,0,0,0],
  [1,1,-1,0,0,0],[-1,1,-1,0,0,0],[1,-1,-1,0,0,0],[-1,-1,-1,0,0,0],
  [1,1,0,1,0,0],[-1,1,0,1,0,0],[1,-1,0,1,0,0],[-1,-1,0,1,0,0],
  [1,1,0,-1,0,0],[-1,1,0,-1,0,0],[1,-1,0,-1,0,0],[-1,-1,0,-1,0,0],
  [1,0,1,1,0,0],[-1,0,1,1,0,0],[1,0,-1,1,0,0],[-1,0,-1,1,0,0],
  [1,0,1,-1,0,0],[-1,0,1,-1,0,0],[1,0,-1,-1,0,0],[-1,0,-1,-1,0,0],
  [0,1,1,1,0,0],[0,-1,1,1,0,0],[0,1,-1,1,0,0],[0,-1,-1,1,0,0],
  [0,1,1,-1,0,0],[0,-1,1,-1,0,0],[0,1,-1,-1,0,0],[0,-1,-1,-1,0,0],
  [1,1,0,0,1,0],[-1,1,0,0,1,0],[1,-1,0,0,1,0],[-1,-1,0,0,1,0],
  [1,0,1,0,1,0],[-1,0,1,0,1,0],[1,0,-1,0,1,0],[-1,0,-1,0,1,0],
  [0,1,1,0,1,0],[0,-1,1,0,1,0],[0,1,-1,0,1,0],[0,-1,-1,0,1,0],
  [1,1,0,0,-1,0],[-1,1,0,0,-1,0],[1,-1,0,0,-1,0],[-1,-1,0,0,-1,0],
  [1,0,1,0,-1,0],[-1,0,1,0,-1,0],[1,0,-1,0,-1,0],[-1,0,-1,0,-1,0],
  [0,1,1,0,-1,0],[0,-1,1,0,-1,0],[0,1,-1,0,-1,0],[0,-1,-1,0,-1,0],
  [1,0,0,1,1,0],[-1,0,0,1,1,0],[1,0,0,-1,1,0],[-1,0,0,-1,1,0],
  [0,1,0,1,1,0],[0,-1,0,1,1,0],[0,1,0,-1,1,0],[0,-1,0,-1,1,0],
  [0,0,1,1,1,0],[0,0,-1,1,1,0],[0,0,1,-1,1,0],[0,0,-1,-1,1,0],
]

// Initialize permutation table
;(function initPerm() {
  const p = Array.from({ length: 256 }, (_, i) => i)
  // Deterministic shuffle with fixed seed
  let seed = 42
  for (let i = 255; i > 0; i--) {
    seed = (seed * 16807 + 0) % 2147483647
    const j = seed % (i + 1)
    ;[p[i], p[j]] = [p[j], p[i]]
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]
})()

function dot6(g: number[], x: number, y: number, z: number, w: number, v: number, u: number): number {
  return g[0]*x + g[1]*y + g[2]*z + g[3]*w + g[4]*v + g[5]*u
}

function hash6(ix: number, iy: number, iz: number, iw: number, iv: number, iu: number): number {
  return perm[(ix + perm[(iy + perm[(iz + perm[(iw + perm[(iv + perm[iu & 255]) & 255]) & 255]) & 255]) & 255]) & 255]
}

/**
 * 6D value noise with smooth interpolation.
 * Returns value in [-1, 1].
 * This is cheaper than true 6D simplex but sufficient for our use case.
 */
export function noise6D(x: number, y: number, z: number, w: number, v: number, u: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z)
  const iw = Math.floor(w), iv = Math.floor(v), iu = Math.floor(u)

  const fx = x - ix, fy = y - iy, fz = z - iz
  const fw = w - iw, fv = v - iv, fu = u - iu

  // Smoothstep
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const sz = fz * fz * (3 - 2 * fz)
  const sw = fw * fw * (3 - 2 * fw)
  const sv = fv * fv * (3 - 2 * fv)
  const su = fu * fu * (3 - 2 * fu)

  // Hash-based pseudo-random at each corner, interpolated
  // For 6D we need 64 corners — use a layered approach for perf
  function val(dx: number, dy: number, dz: number, dw: number, dv: number, du: number): number {
    const h = hash6(ix + dx, iy + dy, iz + dz, iw + dw, iv + dv, iu + du)
    const g = grad6[h % grad6.length]
    return dot6(g, fx - dx, fy - dy, fz - dz, fw - dw, fv - dv, fu - du)
  }

  // Trilinear-ish interpolation across 6 dimensions
  // Layer by layer to avoid 64-term expansion
  function lerp(a: number, b: number, t: number) { return a + t * (b - a) }

  // u dimension
  function interp5(dx: number, dy: number, dz: number, dw: number, dv: number) {
    return lerp(val(dx, dy, dz, dw, dv, 0), val(dx, dy, dz, dw, dv, 1), su)
  }
  function interp4(dx: number, dy: number, dz: number, dw: number) {
    return lerp(interp5(dx, dy, dz, dw, 0), interp5(dx, dy, dz, dw, 1), sv)
  }
  function interp3(dx: number, dy: number, dz: number) {
    return lerp(interp4(dx, dy, dz, 0), interp4(dx, dy, dz, 1), sw)
  }
  function interp2(dx: number, dy: number) {
    return lerp(interp3(dx, dy, 0), interp3(dx, dy, 1), sz)
  }
  function interp1(dx: number) {
    return lerp(interp2(dx, 0), interp2(dx, 1), sy)
  }

  return lerp(interp1(0), interp1(1), sx)
}

/**
 * Multi-octave fractal noise in 6D.
 * Returns value roughly in [-1, 1].
 */
export function fbm6D(
  x: number, y: number, z: number,
  w: number, v: number, u: number,
  octaves = 4,
  lacunarity = 2.0,
  gain = 0.5,
): number {
  let sum = 0
  let amp = 1
  let freq = 1
  let maxAmp = 0

  for (let i = 0; i < octaves; i++) {
    sum += amp * noise6D(x * freq, y * freq, z * freq, w * freq, v * freq, u * freq)
    maxAmp += amp
    amp *= gain
    freq *= lacunarity
  }

  return sum / maxAmp
}

/**
 * Get a deterministic seed from 6D coordinates.
 * Returns value in [0, 1].
 */
export function chunkSeed(cx: number, cy: number, cz: number, w: number, v: number, u: number): number {
  return (noise6D(cx * 0.1, cy * 0.1, cz * 0.1, w * 0.1, v * 0.1, u * 0.1) + 1) * 0.5
}

/**
 * Get biome noise value for chunk coordinate.
 * Uses different frequency than seed for variety.
 */
export function biomeNoise(cx: number, cy: number, cz: number, w: number, v: number, u: number): number {
  return (fbm6D(cx * 0.07, cy * 0.07, cz * 0.07, w * 0.13, v * 0.13, u * 0.13, 3) + 1) * 0.5
}

/**
 * Simple 3D noise (subset of 6D with w=v=u=0) for per-chunk variation.
 */
export function noise3D(x: number, y: number, z: number): number {
  return noise6D(x, y, z, 0, 0, 0)
}
