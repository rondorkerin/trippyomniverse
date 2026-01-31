'use client'

import { useRef, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import * as THREE from 'three'
import InputListener from './InputListener'
import HelpOverlay from './HelpOverlay'
import { useTripiStore } from './store'
import { useHyperspaceStore, updateHyperspace } from './hyperspace'
import { useInputStore } from './input'
import { useMicStore } from './mic'
import { useCameraStore } from './camera'
import { updateChunks, animateChunks } from './chunks'
import { initCosmosAudio, updateCosmosAudio, playCosmosClick } from './cosmos-audio'

function HyperspaceCamera() {
  const { camera } = useThree()

  useFrame(() => {
    const { position, heading, speed } = useHyperspaceStore.getState()

    // Camera follows player position
    ;(camera as THREE.PerspectiveCamera).position.set(position[0], position[1], position[2])

    // Look direction from heading
    const lookX = position[0] + Math.sin(heading.yaw) * Math.cos(heading.pitch)
    const lookY = position[1] + Math.sin(heading.pitch)
    const lookZ = position[2] - Math.cos(heading.yaw) * Math.cos(heading.pitch)
    camera.lookAt(lookX, lookY, lookZ)

    // FOV warps with speed (faster = wider for tunnel effect)
    const baseFov = 60
    const speedFov = Math.min(speed / 50, 1) * 30
    ;(camera as THREE.PerspectiveCamera).fov = baseFov + speedFov
    ;(camera as THREE.PerspectiveCamera).updateProjectionMatrix()
  })

  return null
}

function ChunkRenderer() {
  const { scene } = useThree()
  const elapsedRef = useRef(0)
  const audioInitRef = useRef(false)

  useFrame((_, delta) => {
    const store = useTripiStore.getState()
    if (store.isPaused) return

    const effectiveDelta = delta * store.timeScale
    elapsedRef.current += effectiveDelta

    // Update navigation
    const { mouse, pointerDown, direction } = useInputStore.getState()
    const mic = useMicStore.getState()
    const cam = useCameraStore.getState()

    updateHyperspace(
      effectiveDelta,
      mouse.x, mouse.y,
      pointerDown,
      mic.volume, mic.active,
      cam.motionX, cam.motionY, cam.motion, cam.active,
      direction.x, direction.y,
      store.speedPreset,
    )

    // Update chunks
    updateChunks(scene)

    // Animate chunks
    animateChunks(
      elapsedRef.current,
      effectiveDelta,
      store.intensity,
      store.hueOffset,
      store.colorMode,
      { bass: mic.bass, mid: mic.mid, treble: mic.treble, volume: mic.volume, beat: mic.beat, active: mic.active },
      store.gravityMode,
    )

    // Cycle global hue
    store.setHueOffset((store.hueOffset + effectiveDelta * 0.02) % 1)

    // Update spatial audio
    const { speed } = useHyperspaceStore.getState()
    updateCosmosAudio(speed, mic.volume, mic.active)

    // Init audio on first pointer interaction
    if (pointerDown && !audioInitRef.current) {
      audioInitRef.current = true
      initCosmosAudio()
    }

    // Consume clicks and play bell
    const clicks = useInputStore.getState().clicks
    if (clicks.length > 0) {
      playCosmosClick()
      useInputStore.getState().consumeClicks()
    }
  })

  return null
}

function BloomEffect() {
  const bloomIntensity = useTripiStore((s) => s.bloomIntensity)
  return (
    <EffectComposer>
      <Bloom luminanceThreshold={0.15} luminanceSmoothing={0.9} intensity={bloomIntensity} />
    </EffectComposer>
  )
}

function FogController() {
  const { scene } = useThree()

  useEffect(() => {
    scene.fog = new THREE.FogExp2('#000000', 0.006)
    return () => { scene.fog = null }
  }, [scene])

  return null
}

export default function Universe() {
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000', cursor: 'crosshair' }}>
      <InputListener />
      <HelpOverlay />
      <Canvas
        camera={{ position: [0, 0, 0], fov: 60, near: 0.1, far: 500 }}
        style={{ position: 'fixed', inset: 0 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => gl.setClearColor('#000000')}
      >
        <HyperspaceCamera />
        <ChunkRenderer />
        <FogController />
        <BloomEffect />
      </Canvas>
    </div>
  )
}
