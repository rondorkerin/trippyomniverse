'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { ModuleProps } from '@/core/types'
import { useInputStore } from '@/core/input'
import { useTripiStore, getModulatedHue } from '@/core/store'
import { useMicStore } from '@/core/mic'

const MAX_DEPTH = 6
const BRANCH_ANGLE = Math.PI / 5
const BASE_LENGTH = 3

interface Branch {
  start: THREE.Vector3
  angle: number
  angleY: number
  depth: number
  length: number
}

function generateBranches(): Branch[] {
  const branches: Branch[] = []
  const queue: Branch[] = []

  // Start with 5 trunks radiating out
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    queue.push({
      start: new THREE.Vector3(0, 0, 0),
      angle: a,
      angleY: Math.PI / 2 - 0.3 + Math.random() * 0.6,
      depth: 0,
      length: BASE_LENGTH,
    })
  }

  while (queue.length > 0) {
    const b = queue.shift()!
    branches.push(b)
    if (b.depth >= MAX_DEPTH) continue

    const endX = b.start.x + Math.cos(b.angle) * Math.sin(b.angleY) * b.length
    const endY = b.start.y + Math.cos(b.angleY) * b.length
    const endZ = b.start.z + Math.sin(b.angle) * Math.sin(b.angleY) * b.length
    const end = new THREE.Vector3(endX, endY, endZ)
    const childLen = b.length * 0.68

    queue.push(
      { start: end, angle: b.angle + BRANCH_ANGLE, angleY: b.angleY + 0.1, depth: b.depth + 1, length: childLen },
      { start: end, angle: b.angle - BRANCH_ANGLE, angleY: b.angleY - 0.15, depth: b.depth + 1, length: childLen },
    )
  }

  return branches
}

export default function FractalWeb({ }: ModuleProps) {
  const lineRef = useRef<THREE.LineSegments>(null)

  const branches = useMemo(() => generateBranches(), [])

  const [positions, colors] = useMemo(() => {
    const pos = new Float32Array(branches.length * 6) // 2 verts per branch
    const col = new Float32Array(branches.length * 6)
    return [pos, col]
  }, [branches])

  const tempColor = useMemo(() => new THREE.Color(), [])

  useFrame(({ clock }) => {
    if (!lineRef.current) return
    const t = clock.getElapsedTime()
    const geo = lineRef.current.geometry
    const posArr = geo.attributes.position.array as Float32Array
    const colArr = geo.attributes.color.array as Float32Array

    const { mouse } = useInputStore.getState()
    const { hueOffset, intensity, colorMode } = useTripiStore.getState()
    const { bass, treble, volume, beat, active: micActive } = useMicStore.getState()

    for (let i = 0; i < branches.length; i++) {
      const b = branches[i]
      const i6 = i * 6

      // Bass makes branches grow, beat makes them pulse
      const micGrow = micActive ? 1 + bass * 0.4 + (beat ? 0.2 : 0) : 1
      const breathe = (1 + 0.15 * Math.sin(t * 0.3 + b.depth * 0.5)) * micGrow
      // Treble drives twist intensity
      const twistAmt = 0.3 + (micActive ? treble * 0.8 : 0)
      const twist = Math.sin(t * 0.2 + b.depth) * twistAmt * mouse.x
      const len = b.length * breathe

      const sx = b.start.x
      const sy = b.start.y
      const sz = b.start.z
      const ex = sx + Math.cos(b.angle + twist) * Math.sin(b.angleY) * len
      const ey = sy + Math.cos(b.angleY) * len
      const ez = sz + Math.sin(b.angle + twist) * Math.sin(b.angleY) * len

      posArr[i6] = sx; posArr[i6 + 1] = sy; posArr[i6 + 2] = sz
      posArr[i6 + 3] = ex; posArr[i6 + 4] = ey; posArr[i6 + 5] = ez

      const hue = getModulatedHue(hueOffset + b.depth / MAX_DEPTH * 0.4 + t * 0.02 + (micActive ? volume * 0.2 : 0), colorMode)
      const alpha = 1 - b.depth / (MAX_DEPTH + 1) * 0.5
      tempColor.setHSL(hue, 0.7 + (micActive ? treble * 0.3 : 0), (0.4 + alpha * 0.3 + (micActive ? volume * 0.3 : 0)) * intensity)
      colArr[i6] = tempColor.r; colArr[i6 + 1] = tempColor.g; colArr[i6 + 2] = tempColor.b
      colArr[i6 + 3] = tempColor.r; colArr[i6 + 4] = tempColor.g; colArr[i6 + 5] = tempColor.b
    }

    geo.attributes.position.needsUpdate = true
    geo.attributes.color.needsUpdate = true
  })

  return (
    <lineSegments ref={lineRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={0.7}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </lineSegments>
  )
}
