'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { ModuleProps } from '@/core/types'
import { useMicStore } from '@/core/mic'
import { useTripiStore, getModulatedHue } from '@/core/store'

const BAR_COUNT = 64
const RING_RADIUS = 12
const BAR_MAX_HEIGHT = 6

export default function AudioVisualizer({}: ModuleProps) {
  const barsRef = useRef<THREE.InstancedMesh>(null)
  const waveRef = useRef<THREE.Points>(null)

  const barMatrix = useMemo(() => new THREE.Matrix4(), [])
  const tempColor = useMemo(() => new THREE.Color(), [])

  // Waveform ring positions
  const wavePositions = useMemo(() => {
    const pos = new Float32Array(128 * 3)
    for (let i = 0; i < 128; i++) {
      const angle = (i / 128) * Math.PI * 2
      pos[i * 3] = Math.cos(angle) * RING_RADIUS * 0.7
      pos[i * 3 + 1] = Math.sin(angle) * RING_RADIUS * 0.7
      pos[i * 3 + 2] = 0
    }
    return pos
  }, [])

  const waveColors = useMemo(() => new Float32Array(128 * 3).fill(1), [])

  useFrame(({ clock }) => {
    const { fft, waveform, active, bass, beat } = useMicStore.getState()
    if (!active) return
    const t = clock.getElapsedTime()
    const { hueOffset, intensity, colorMode } = useTripiStore.getState()

    // Update FFT bars arranged in a circle
    if (barsRef.current) {
      for (let i = 0; i < BAR_COUNT; i++) {
        const angle = (i / BAR_COUNT) * Math.PI * 2
        const fftIndex = Math.floor((i / BAR_COUNT) * fft.length)
        const value = (fft[fftIndex] || 0) / 255
        const height = 0.1 + value * BAR_MAX_HEIGHT

        const x = Math.cos(angle) * RING_RADIUS
        const z = Math.sin(angle) * RING_RADIUS

        barMatrix.makeTranslation(x, height / 2, z)
        barMatrix.multiply(new THREE.Matrix4().makeScale(0.15, height, 0.15))

        // Rotate bar to face outward
        const rotMatrix = new THREE.Matrix4().makeRotationY(-angle)
        barMatrix.premultiply(rotMatrix)

        barsRef.current.setMatrixAt(i, barMatrix)

        const hue = getModulatedHue(hueOffset + i / BAR_COUNT + value * 0.3, colorMode)
        tempColor.setHSL(hue, 0.9, (0.3 + value * 0.5) * intensity)
        barsRef.current.setColorAt(i, tempColor)
      }
      barsRef.current.instanceMatrix.needsUpdate = true
      if (barsRef.current.instanceColor) barsRef.current.instanceColor.needsUpdate = true
    }

    // Update waveform ring
    if (waveRef.current) {
      const geo = waveRef.current.geometry
      const posArr = geo.attributes.position.array as Float32Array
      const colArr = geo.attributes.color.array as Float32Array

      for (let i = 0; i < 128; i++) {
        const angle = (i / 128) * Math.PI * 2
        const waveVal = ((waveform[i] || 128) - 128) / 128
        const r = RING_RADIUS * 0.7 + waveVal * 2 + bass * 0.5

        posArr[i * 3] = Math.cos(angle) * r
        posArr[i * 3 + 1] = Math.sin(angle) * r
        posArr[i * 3 + 2] = Math.sin(t * 2 + i * 0.1) * bass * 2

        const hue = getModulatedHue(hueOffset + 0.5 + i / 128, colorMode)
        tempColor.setHSL(hue, 0.7, (0.4 + Math.abs(waveVal) * 0.4) * intensity)
        colArr[i * 3] = tempColor.r
        colArr[i * 3 + 1] = tempColor.g
        colArr[i * 3 + 2] = tempColor.b
      }

      geo.attributes.position.needsUpdate = true
      geo.attributes.color.needsUpdate = true

      // Pulse on beat
      const scale = beat ? 1.15 : 1
      waveRef.current.scale.setScalar(scale)
    }
  })

  return (
    <group>
      {/* FFT bars in a circle */}
      <instancedMesh ref={barsRef} args={[undefined, undefined, BAR_COUNT]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial
          transparent
          opacity={0.8}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </instancedMesh>

      {/* Waveform ring */}
      <points ref={waveRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[wavePositions, 3]} />
          <bufferAttribute attach="attributes-color" args={[waveColors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.12}
          vertexColors
          transparent
          opacity={0.9}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
    </group>
  )
}
