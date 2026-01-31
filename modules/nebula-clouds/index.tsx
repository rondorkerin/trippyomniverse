'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { ModuleProps } from '@/core/types'
import { useInputStore } from '@/core/input'
import { useTripiStore, getModulatedHue } from '@/core/store'
import { useMicStore } from '@/core/mic'
import { useCameraStore } from '@/core/camera'

const COUNT = 5000
const CLUSTER_COUNT = 8

export default function NebulaClouds({}: ModuleProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const tempColor = useMemo(() => new THREE.Color(), [])

  const [basePositions, clusterIndices] = useMemo(() => {
    const pos = new Float32Array(COUNT * 3)
    const clusters = new Uint8Array(COUNT)

    for (let i = 0; i < COUNT; i++) {
      const ci = Math.floor(Math.random() * CLUSTER_COUNT)
      clusters[i] = ci

      // Each cluster has a center
      const cx = (Math.sin(ci * 2.3) * 8)
      const cy = (Math.cos(ci * 1.7) * 6)
      const cz = (Math.sin(ci * 3.1 + 1) * 7)

      // Gaussian-ish distribution around cluster center
      const spread = 3 + Math.random() * 2
      pos[i * 3] = cx + (Math.random() - 0.5) * spread * 2
      pos[i * 3 + 1] = cy + (Math.random() - 0.5) * spread * 2
      pos[i * 3 + 2] = cz + (Math.random() - 0.5) * spread * 2
    }
    return [pos, clusters]
  }, [])

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const t = clock.getElapsedTime()

    const { mouse } = useInputStore.getState()
    const { hueOffset, intensity, colorMode } = useTripiStore.getState()
    const { bass, volume, beat, active: micActive } = useMicStore.getState()
    const { gridBrightness, motion, motionX, motionY, active: camActive } = useCameraStore.getState()

    const micPulse = micActive ? 1 + bass * 0.6 + (beat ? 0.4 : 0) : 1
    const motionDrift = camActive ? motion * 5 : 0

    for (let i = 0; i < COUNT; i++) {
      const i3 = i * 3
      const ci = clusterIndices[i]

      const breathe = Math.sin(t * 0.2 + ci * 1.5) * 0.3 * intensity
      const shockwave = micActive && beat ? Math.sin(t * 8 + i * 0.01) * 0.5 : 0

      const x = basePositions[i3] * (1 + breathe) + shockwave + motionX * motionDrift
      const y = basePositions[i3 + 1] * (1 + breathe) + motionY * motionDrift
      const z = basePositions[i3 + 2] * (1 + breathe) * micPulse

      dummy.position.set(x, y, z)
      const s = (0.03 + Math.sin(t * 0.5 + i * 0.002) * 0.015) * intensity * micPulse
      dummy.scale.setScalar(s)
      dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, dummy.matrix)

      // Color from webcam grid or hue cycling
      let hue: number
      if (camActive) {
        const gi = ci % 9
        hue = hueOffset + gridBrightness[gi] * 0.5 + ci / CLUSTER_COUNT * 0.3
      } else {
        hue = hueOffset + ci / CLUSTER_COUNT * 0.4 + t * 0.01
      }
      hue = getModulatedHue(hue, colorMode)
      const lum = 0.3 + (micActive ? volume * 0.4 : 0.15) * intensity
      tempColor.setHSL(hue, 0.7, lum)
      meshRef.current.setColorAt(i, tempColor)
    }

    meshRef.current.instanceMatrix.needsUpdate = true
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, COUNT]}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial
        transparent
        opacity={0.6}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </instancedMesh>
  )
}
