import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import type { InputState } from './types'

interface InputStore extends InputState {
  setMouse: (x: number, y: number, px: number, py: number) => void
  setPointerDown: (down: boolean) => void
  addClick: (x: number, y: number) => void
  consumeClicks: () => void
  keyDown: (key: string) => void
  keyUp: (key: string) => void
}

const DIRECTION_KEYS: Record<string, { axis: 'x' | 'y'; value: number }> = {
  arrowleft: { axis: 'x', value: -1 },
  arrowright: { axis: 'x', value: 1 },
  arrowup: { axis: 'y', value: 1 },
  arrowdown: { axis: 'y', value: -1 },
  a: { axis: 'x', value: -1 },
  d: { axis: 'x', value: 1 },
  w: { axis: 'y', value: 1 },
  s: { axis: 'y', value: -1 },
}

function recalcDirection(keys: Set<string>): { x: number; y: number } {
  let x = 0, y = 0
  for (const [key, dir] of Object.entries(DIRECTION_KEYS)) {
    if (keys.has(key)) {
      if (dir.axis === 'x') x += dir.value
      else y += dir.value
    }
  }
  return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) }
}

export const useInputStore = create<InputStore>((set, get) => ({
  mouse: { x: 0, y: 0 },
  mousePixel: { x: 0, y: 0 },
  pointerDown: false,
  direction: { x: 0, y: 0 },
  keys: new Set<string>(),
  shift: false,
  ctrl: false,
  alt: false,
  clicks: [],

  setMouse: (x, y, px, py) => set({ mouse: { x, y }, mousePixel: { x: px, y: py } }),
  setPointerDown: (down) => set({ pointerDown: down }),
  addClick: (x, y) =>
    set((s) => ({ clicks: [...s.clicks, { x, y, time: performance.now() }] })),
  consumeClicks: () => set({ clicks: [] }),
  keyDown: (key) => {
    const k = key.toLowerCase()
    const s = get()
    if (s.keys.has(k)) return
    const newKeys = new Set(s.keys)
    newKeys.add(k)
    set({
      keys: newKeys,
      direction: recalcDirection(newKeys),
      shift: k === 'shift' ? true : s.shift,
      ctrl: k === 'control' ? true : s.ctrl,
      alt: k === 'alt' ? true : s.alt,
    })
  },
  keyUp: (key) => {
    const k = key.toLowerCase()
    const s = get()
    const newKeys = new Set(s.keys)
    newKeys.delete(k)
    set({
      keys: newKeys,
      direction: recalcDirection(newKeys),
      shift: k === 'shift' ? false : s.shift,
      ctrl: k === 'control' ? false : s.ctrl,
      alt: k === 'alt' ? false : s.alt,
    })
  },
}))

/** Hook for modules to read input state (shallow) */
export function useInput(): InputState {
  return useInputStore(useShallow((s) => ({
    mouse: s.mouse,
    mousePixel: s.mousePixel,
    pointerDown: s.pointerDown,
    direction: s.direction,
    keys: s.keys,
    shift: s.shift,
    ctrl: s.ctrl,
    alt: s.alt,
    clicks: s.clicks,
  })))
}
