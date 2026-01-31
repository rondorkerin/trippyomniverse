'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { ModuleProps } from '@/core/types'
import { useTripiStore, getModulatedHue } from '@/core/store'

// Breathing cycle: inhale 4s, hold 2s, exhale 6s = 12s
const CYCLE = 12

function breatheValue(t: number): number {
  const phase = (t % CYCLE) / CYCLE
  if (phase < 4 / 12) {
    // Inhale: 0 -> 1 over 4s
    return phase / (4 / 12)
  } else if (phase < 6 / 12) {
    // Hold: 1
    return 1
  } else {
    // Exhale: 1 -> 0 over 6s
    return 1 - (phase - 6 / 12) / (6 / 12)
  }
}

export default function BreathSphere({ }: ModuleProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const matRef = useRef<THREE.MeshBasicMaterial>(null)

  useFrame(({ clock }) => {
    if (!meshRef.current || !matRef.current) return
    const t = clock.getElapsedTime()
    const { hueOffset, intensity, colorMode } = useTripiStore.getState()

    const breath = breatheValue(t)
    const scale = 0.5 + breath * 1.5
    meshRef.current.scale.setScalar(scale)

    const hue = getModulatedHue(hueOffset + 0.7 + breath * 0.1, colorMode)
    matRef.current.color.setHSL(hue, 0.6, (0.25 + breath * 0.15) * intensity)
    matRef.current.opacity = (0.08 + breath * 0.15) * intensity
  })

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[2, 3]} />
      <meshBasicMaterial
        ref={matRef}
        transparent
        opacity={0.1}
        wireframe
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  )
}
