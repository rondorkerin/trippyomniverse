export type Vec4 = [number, number, number, number]

// 16 vertices of a tesseract
export function tesseractVertices(): Vec4[] {
  const verts: Vec4[] = []
  for (let i = 0; i < 16; i++) {
    verts.push([
      (i & 1) ? 1 : -1,
      (i & 2) ? 1 : -1,
      (i & 4) ? 1 : -1,
      (i & 8) ? 1 : -1,
    ])
  }
  return verts
}

// 32 edges: connect vertices differing in exactly one bit
export function tesseractEdges(): [number, number][] {
  const edges: [number, number][] = []
  for (let i = 0; i < 16; i++) {
    for (let bit = 0; bit < 4; bit++) {
      const j = i ^ (1 << bit)
      if (j > i) edges.push([i, j])
    }
  }
  return edges
}

export function rotateXW(v: Vec4, angle: number): Vec4 {
  const c = Math.cos(angle), s = Math.sin(angle)
  return [c * v[0] - s * v[3], v[1], v[2], s * v[0] + c * v[3]]
}

export function rotateYZ(v: Vec4, angle: number): Vec4 {
  const c = Math.cos(angle), s = Math.sin(angle)
  return [v[0], c * v[1] - s * v[2], s * v[1] + c * v[2], v[3]]
}

export function rotateXY(v: Vec4, angle: number): Vec4 {
  const c = Math.cos(angle), s = Math.sin(angle)
  return [c * v[0] - s * v[1], s * v[0] + c * v[1], v[2], v[3]]
}

export function rotateZW(v: Vec4, angle: number): Vec4 {
  const c = Math.cos(angle), s = Math.sin(angle)
  return [v[0], v[1], c * v[2] - s * v[3], s * v[2] + c * v[3]]
}

// Perspective project 4D -> 3D
export function project4Dto3D(v: Vec4, distance: number = 3): [number, number, number] {
  const w = distance / (distance - v[3])
  return [v[0] * w, v[1] * w, v[2] * w]
}
