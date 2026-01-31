'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { ModuleProps } from '@/core/types'
import { useInputStore } from '@/core/input'
import { useTripiStore, getModulatedHue } from '@/core/store'
import { useMicStore } from '@/core/mic'

const COUNT = 2500
const RADIUS = 10

export default function ParticleField({ }: ModuleProps) {
  const pointsRef = useRef<THREE.Points>(null)

  const [positions, colors, basePositions] = useMemo(() => {
    const pos = new Float32Array(COUNT * 3)
    const col = new Float32Array(COUNT * 3)
    const base = new Float32Array(COUNT * 3)

    for (let i = 0; i < COUNT; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = RADIUS * Math.cbrt(Math.random())

      const x = r * Math.sin(phi) * Math.cos(theta)
      const y = r * Math.sin(phi) * Math.sin(theta)
      const z = r * Math.cos(phi)

      const i3 = i * 3
      pos[i3] = x; pos[i3 + 1] = y; pos[i3 + 2] = z
      base[i3] = x; base[i3 + 1] = y; base[i3 + 2] = z
      col[i3] = 1; col[i3 + 1] = 1; col[i3 + 2] = 1
    }
    return [pos, col, base]
  }, [])

  const tempColor = useMemo(() => new THREE.Color(), [])

  useFrame(({ clock }) => {
    if (!pointsRef.current) return
    const geo = pointsRef.current.geometry
    const posArr = geo.attributes.position.array as Float32Array
    const colArr = geo.attributes.color.array as Float32Array
    const t = clock.getElapsedTime()

    const { mouse, direction } = useInputStore.getState()
    const { hueOffset, intensity, colorMode } = useTripiStore.getState()
    const { bass, volume, beat, active: micActive } = useMicStore.getState()

    // Mic-reactive expansion
    const micPulse = micActive ? 1 + bass * 0.5 + (beat ? 0.3 : 0) : 1

    // Direction keys shift the whole field
    const dirOffsetX = direction.x * 3
    const dirOffsetY = direction.y * 3

    for (let i = 0; i < COUNT; i++) {
      const i3 = i * 3
      const bx = basePositions[i3]
      const by = basePositions[i3 + 1]
      const bz = basePositions[i3 + 2]

      // Breathing + mic reactivity
      const breathe = (1 + 0.1 * Math.sin(t * 0.4 + i * 0.003)) * micPulse

      // Mouse repulsion
      const mx = mouse.x * RADIUS
      const my = mouse.y * RADIUS
      const dx = bx * breathe - mx
      const dy = by * breathe - my
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.001
      const repel = Math.max(0, 4 - dist) * 0.6

      posArr[i3] = bx * breathe + (dx / dist) * repel + dirOffsetX
      posArr[i3 + 1] = by * breathe + (dy / dist) * repel + dirOffsetY
      posArr[i3 + 2] = bz * breathe

      // HSL color cycling
      const hue = getModulatedHue(hueOffset + t * 0.03 + i / COUNT + (micActive ? volume * 0.2 : 0), colorMode)
      tempColor.setHSL(hue, 0.85, (0.4 + (micActive ? volume * 0.4 : 0.2)) * intensity)
      colArr[i3] = tempColor.r
      colArr[i3 + 1] = tempColor.g
      colArr[i3 + 2] = tempColor.b
    }

    geo.attributes.position.needsUpdate = true
    geo.attributes.color.needsUpdate = true
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.07}
        vertexColors
        transparent
        opacity={0.9}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  )
}
