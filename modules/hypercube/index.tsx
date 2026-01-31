'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { ModuleProps } from '@/core/types'
import { useInputStore } from '@/core/input'
import { useTripiStore, getModulatedHue } from '@/core/store'
import { useMicStore } from '@/core/mic'
import { tesseractVertices, tesseractEdges, rotateXW, rotateYZ, rotateXY, rotateZW, project4Dto3D } from './math4d'
import type { Vec4 } from './math4d'

const TRAIL_LENGTH = 12
const VERTS = tesseractVertices()
const EDGES = tesseractEdges()
const SCALE = 3

export default function Hypercube({}: ModuleProps) {
  const lineRef = useRef<THREE.LineSegments>(null)
  const trailRef = useRef<[number, number, number][][]>(
    VERTS.map(() => [])
  )

  const [positions, colors] = useMemo(() => {
    // Current edges + trail edges
    const maxLines = EDGES.length + EDGES.length * TRAIL_LENGTH
    const pos = new Float32Array(maxLines * 6)
    const col = new Float32Array(maxLines * 6)
    return [pos, col]
  }, [])

  const tempColor = useMemo(() => new THREE.Color(), [])

  useFrame(({ clock }) => {
    if (!lineRef.current) return
    const t = clock.getElapsedTime()

    const { mouse } = useInputStore.getState()
    const { hueOffset, intensity, colorMode } = useTripiStore.getState()
    const { bass, treble, beat, active: micActive } = useMicStore.getState()

    // Rotate in 4D
    const angleXW = t * 0.3 + mouse.x * 0.5
    const angleYZ = t * 0.2 + mouse.y * 0.5
    const angleXY = (micActive ? bass * 0.5 : 0)
    const angleZW = (micActive ? treble * 0.3 : 0)

    const projected: [number, number, number][] = VERTS.map((v) => {
      let r: Vec4 = rotateXW(v, angleXW)
      r = rotateYZ(r, angleYZ)
      r = rotateXY(r, angleXY)
      r = rotateZW(r, angleZW)
      const p = project4Dto3D(r, 3)
      return [p[0] * SCALE, p[1] * SCALE, p[2] * SCALE]
    })

    // Update trails
    const trails = trailRef.current
    for (let i = 0; i < VERTS.length; i++) {
      trails[i].unshift(projected[i])
      if (trails[i].length > TRAIL_LENGTH) trails[i].pop()
    }

    const geo = lineRef.current.geometry
    const posArr = geo.attributes.position.array as Float32Array
    const colArr = geo.attributes.color.array as Float32Array

    let idx = 0

    // Current edges
    const beatScale = beat ? 1.2 : 1
    for (const [a, b] of EDGES) {
      const pa = projected[a]
      const pb = projected[b]
      const i6 = idx * 6
      posArr[i6] = pa[0] * beatScale
      posArr[i6 + 1] = pa[1] * beatScale
      posArr[i6 + 2] = pa[2] * beatScale
      posArr[i6 + 3] = pb[0] * beatScale
      posArr[i6 + 4] = pb[1] * beatScale
      posArr[i6 + 5] = pb[2] * beatScale

      const hue = getModulatedHue(hueOffset + a / 16 + t * 0.05, colorMode)
      tempColor.setHSL(hue, 0.9, 0.5 * intensity)
      colArr[i6] = tempColor.r; colArr[i6 + 1] = tempColor.g; colArr[i6 + 2] = tempColor.b
      colArr[i6 + 3] = tempColor.r; colArr[i6 + 4] = tempColor.g; colArr[i6 + 5] = tempColor.b
      idx++
    }

    // Trail edges (ghosted)
    for (let frame = 1; frame < TRAIL_LENGTH; frame++) {
      const alpha = 1 - frame / TRAIL_LENGTH
      for (const [a, b] of EDGES) {
        if (frame >= trails[a].length || frame >= trails[b].length) {
          // Zero out
          const i6 = idx * 6
          for (let k = 0; k < 6; k++) { posArr[i6 + k] = 0; colArr[i6 + k] = 0 }
          idx++
          continue
        }
        const pa = trails[a][frame]
        const pb = trails[b][frame]
        const i6 = idx * 6
        posArr[i6] = pa[0]; posArr[i6 + 1] = pa[1]; posArr[i6 + 2] = pa[2]
        posArr[i6 + 3] = pb[0]; posArr[i6 + 4] = pb[1]; posArr[i6 + 5] = pb[2]

        const hue = getModulatedHue(hueOffset + a / 16 + t * 0.05 + frame * 0.02, colorMode)
        tempColor.setHSL(hue, 0.7, 0.3 * alpha * intensity)
        colArr[i6] = tempColor.r; colArr[i6 + 1] = tempColor.g; colArr[i6 + 2] = tempColor.b
        colArr[i6 + 3] = tempColor.r; colArr[i6 + 4] = tempColor.g; colArr[i6 + 5] = tempColor.b
        idx++
      }
    }

    geo.attributes.position.needsUpdate = true
    geo.attributes.color.needsUpdate = true
    geo.setDrawRange(0, idx * 2)
  })

  const maxLines = EDGES.length + EDGES.length * TRAIL_LENGTH

  return (
    <lineSegments ref={lineRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={0.8}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </lineSegments>
  )
}
