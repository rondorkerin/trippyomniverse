'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { ModuleProps } from '@/core/types'
import { useTripiStore, getModulatedHue } from '@/core/store'
import { useMicStore } from '@/core/mic'
import { useInputStore } from '@/core/input'

const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`

const fragmentShader = `
uniform float uTime;
uniform float uFolds;
uniform float uHueOffset;
uniform float uIntensity;
uniform float uBass;
uniform float uMouse;
uniform int uColorMode;

varying vec2 vUv;

#define PI 3.14159265359

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float modulateHue(float h) {
  if (uColorMode == 1) return fract(0.0 + h * 0.12);
  if (uColorMode == 2) return fract(0.5 + h * 0.15);
  if (uColorMode == 3) return 0.55;
  if (uColorMode == 4) return fract(h * 3.0);
  return fract(h);
}

void main() {
  vec2 uv = vUv - 0.5;
  float r = length(uv);
  float a = atan(uv.y, uv.x);

  // Kaleidoscope fold
  float folds = max(2.0, uFolds);
  float sector = PI / folds;
  a = mod(a, sector * 2.0);
  if (a > sector) a = sector * 2.0 - a;

  // Procedural pattern
  vec2 p = vec2(cos(a), sin(a)) * r;
  float pattern = sin(p.x * 12.0 + uTime * 0.8 + uBass * 4.0)
                * cos(p.y * 12.0 - uTime * 0.6)
                + sin(r * 15.0 - uTime * 1.2 + uMouse * 3.0) * 0.5;

  pattern += sin(r * 8.0 + uTime * 0.3) * cos(a * folds + uTime * 0.5) * 0.4;

  float hue = modulateHue(uHueOffset + pattern * 0.15 + r * 0.3 + uTime * 0.02);
  float sat = 0.7 + pattern * 0.2;
  float val = (0.15 + pattern * 0.25 + uBass * 0.3) * uIntensity;

  // Fade edges
  val *= smoothstep(0.7, 0.3, r);

  vec3 col = hsv2rgb(vec3(hue, sat, max(0.0, val)));
  gl_FragColor = vec4(col, val * 0.6);
}
`

export default function Kaleidoscope({}: ModuleProps) {
  const meshRef = useRef<THREE.Mesh>(null)

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uFolds: { value: 6 },
    uHueOffset: { value: 0 },
    uIntensity: { value: 0.5 },
    uBass: { value: 0 },
    uMouse: { value: 0 },
    uColorMode: { value: 0 },
  }), [])

  const colorModeIndex: Record<string, number> = {
    rainbow: 0, warm: 1, cool: 2, mono: 3, psychedelic: 4,
  }

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    const { hueOffset, intensity, colorMode } = useTripiStore.getState()
    const { bass, beat, active: micActive } = useMicStore.getState()
    const { mouse } = useInputStore.getState()

    uniforms.uTime.value = t
    uniforms.uHueOffset.value = hueOffset
    uniforms.uIntensity.value = intensity
    uniforms.uBass.value = micActive ? bass : 0
    uniforms.uMouse.value = mouse.x
    uniforms.uColorMode.value = colorModeIndex[colorMode] ?? 0

    // Beat pulses fold count
    const baseFolds = 6 + Math.sin(t * 0.1) * 2
    uniforms.uFolds.value = baseFolds + (micActive && beat ? 3 : 0)
  })

  return (
    <mesh ref={meshRef} renderOrder={-1}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  )
}
