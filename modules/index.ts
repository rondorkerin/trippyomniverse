import type { ModuleEntry } from '@/core/types'

import ParticleField from './particle-field'
import particleFieldManifest from './particle-field/manifest'

import FractalWeb from './fractal-web'
import fractalWebManifest from './fractal-web/manifest'

import SacredRings from './sacred-rings'
import sacredRingsManifest from './sacred-rings/manifest'

import BreathSphere from './breath-sphere'
import breathSphereManifest from './breath-sphere/manifest'

import AudioVisualizer from './audio-visualizer'
import audioVisualizerManifest from './audio-visualizer/manifest'

import NebulaClouds from './nebula-clouds'
import nebulaManifest from './nebula-clouds/manifest'

import Hypercube from './hypercube'
import hypercubeManifest from './hypercube/manifest'

import Kaleidoscope from './kaleidoscope'
import kaleidoscopeManifest from './kaleidoscope/manifest'

export const enabledModules: ModuleEntry[] = [
  { manifest: kaleidoscopeManifest, component: Kaleidoscope, enabled: true },
  { manifest: particleFieldManifest, component: ParticleField, enabled: true },
  { manifest: fractalWebManifest, component: FractalWeb, enabled: true },
  { manifest: sacredRingsManifest, component: SacredRings, enabled: true },
  { manifest: breathSphereManifest, component: BreathSphere, enabled: true },
  { manifest: audioVisualizerManifest, component: AudioVisualizer, enabled: true },
  { manifest: nebulaManifest, component: NebulaClouds, enabled: true },
  { manifest: hypercubeManifest, component: Hypercube, enabled: true },
]
