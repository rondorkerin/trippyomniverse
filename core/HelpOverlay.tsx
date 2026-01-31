'use client'

import { useTripiStore } from './store'

const KEYS = [
  ['WASD', 'Move / strafe'],
  ['Mouse', 'Steer direction'],
  ['Hold Click', 'Thrust forward'],
  ['Scroll', 'Warp speed ±'],
  ['[ / ]', 'Speed preset ±'],
  ['G', 'Cycle gravity (normal/zero/anti)'],
  ['1-9, 0', 'Intensity 10%-100%'],
  ['+/-', 'Time scale ±0.1'],
  ['Space', 'Pause / Resume'],
  ['M', 'Toggle microphone (warp boost)'],
  ['C', 'Toggle webcam (dimension drift)'],
  ['T', 'Cycle color mode'],
  ['B', 'Cycle bloom intensity'],
  ['Q / E', 'Hue rotate ±0.05'],
  ['R', 'Randomize parameters'],
  ['F', 'Fullscreen'],
  ['H', 'Show / hide this help'],
]

export default function HelpOverlay() {
  const show = useTripiStore((s) => s.showHelp)
  if (!show) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      <div className="bg-black/80 border border-white/20 rounded-xl p-6 max-w-md pointer-events-auto backdrop-blur-sm">
        <h2 className="text-white text-lg font-bold mb-1 text-center tracking-wider">OMNIVERSE</h2>
        <p className="text-white/40 text-xs text-center mb-4">Infinite Hyperspace</p>
        <table className="w-full">
          <tbody>
            {KEYS.map(([key, desc]) => (
              <tr key={key} className="border-b border-white/5">
                <td className="py-1 pr-4 text-cyan-400 font-mono text-sm whitespace-nowrap">{key}</td>
                <td className="py-1 text-white/70 text-sm">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-white/30 text-xs text-center mt-4">Press H to close</p>
      </div>
    </div>
  )
}
