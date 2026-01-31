'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { ModuleProps } from '@/core/types'
import { useInputStore } from '@/core/input'
import { useTripiStore, getModulatedHue } from '@/core/store'
import { useMicStore } from '@/core/mic'

const RING_COUNT = 7

export default function SacredRings({ }: ModuleProps) {
  const groupRef = useRef<THREE.Group>(null)
  const materialRefs = useRef<THREE.MeshBasicMaterial[]>([])

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const t = clock.getElapsedTime()
    const { mouse, direction } = useInputStore.getState()
    const { hueOffset, intensity, colorMode } = useTripiStore.getState()
    const { bass, mid, treble, beat, active: micActive, fft } = useMicStore.getState()

    groupRef.current.children.forEach((child, i) => {
      const mesh = child as THREE.Mesh
      const speed = 0.1 + i * 0.05

      // Each ring reacts to a different frequency band
      const fftIndex = Math.floor((i / RING_COUNT) * (fft.length / 2))
      const fftVal = micActive ? (fft[fftIndex] || 0) / 255 : 0
      const breathe = 1 + 0.2 * Math.sin(t * 0.3 + i * 0.8) + fftVal * 0.5

      // Mic bass drives rotation speed
      const micSpeed = micActive ? 1 + bass * 2 : 1
      mesh.rotation.x = t * speed * micSpeed * (i % 2 === 0 ? 1 : -1) + direction.y * 0.5
      mesh.rotation.y = t * speed * 0.7 * micSpeed + direction.x * 0.5
      mesh.rotation.z = Math.sin(t * 0.2 + i) * 0.3 + (micActive ? mid * 0.5 : 0)

      mesh.scale.setScalar(breathe + (beat ? 0.3 : 0))

      // Color — treble shifts hue faster
      const mat = mesh.material as THREE.MeshBasicMaterial
      const hue = getModulatedHue(hueOffset + i / RING_COUNT * 0.5 + t * 0.01 + (micActive ? treble * 0.3 : 0), colorMode)
      mat.color.setHSL(hue, 0.8, (0.35 + mouse.y * 0.15 + fftVal * 0.3) * intensity)
      mat.opacity = 0.3 + 0.2 * Math.sin(t + i * 1.2) + fftVal * 0.3
    })
  })

  return (
    <group ref={groupRef}>
      {Array.from({ length: RING_COUNT }, (_, i) => {
        const radius = 4 + i * 2.2
        const tube = 0.02 + i * 0.008
        return (
          <mesh key={i}>
            <torusGeometry args={[radius, tube, 16, 100]} />
            <meshBasicMaterial
              transparent
              opacity={0.4}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              side={THREE.DoubleSide}
              ref={(el: THREE.MeshBasicMaterial | null) => { if (el) materialRefs.current[i] = el }}
            />
          </mesh>
        )
      })}
    </group>
  )
}
