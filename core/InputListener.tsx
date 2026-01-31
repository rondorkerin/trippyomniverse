'use client'

import { useEffect } from 'react'
import { useInputStore } from './input'
import { useHyperspaceStore } from './hyperspace'
import { startMic, stopMic, useMicStore } from './mic'
import { startCamera, stopCamera, useCameraStore } from './camera'
import { useTripiStore } from './store'

export default function InputListener() {
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1
      const ny = -(e.clientY / window.innerHeight) * 2 + 1
      useInputStore.getState().setMouse(nx, ny, e.clientX, e.clientY)
    }

    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0]
      const nx = (t.clientX / window.innerWidth) * 2 - 1
      const ny = -(t.clientY / window.innerHeight) * 2 + 1
      useInputStore.getState().setMouse(nx, ny, t.clientX, t.clientY)
    }

    const onPointerDown = () => {
      useInputStore.getState().setPointerDown(true)
    }

    const onPointerUp = () => {
      useInputStore.getState().setPointerDown(false)
    }

    const onClick = (e: MouseEvent) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1
      const ny = -(e.clientY / window.innerHeight) * 2 + 1
      useInputStore.getState().addClick(nx, ny)
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const { warpFactor, setWarpFactor } = useHyperspaceStore.getState()
      const delta = e.deltaY > 0 ? -0.3 : 0.3
      setWarpFactor(warpFactor + delta)
    }

    const onKeyDown = (e: KeyboardEvent) => {
      useInputStore.getState().keyDown(e.key)
      if (e.repeat) return

      const key = e.key.toLowerCase()
      const store = useTripiStore.getState()

      // M — toggle mic
      if (key === 'm') {
        if (useMicStore.getState().active) stopMic()
        else startMic()
        return
      }

      // C — toggle webcam
      if (key === 'c') {
        if (useCameraStore.getState().active) stopCamera()
        else startCamera()
        return
      }

      // 1-9 — intensity
      if (key >= '1' && key <= '9') {
        store.setIntensity(parseInt(key) * 0.1)
        return
      }
      if (key === '0') {
        store.setIntensity(1.0)
        return
      }

      // +/- — time scale
      if (key === '=' || key === '+') {
        store.setTimeScale(store.timeScale + 0.1)
        return
      }
      if (key === '-') {
        store.setTimeScale(store.timeScale - 0.1)
        return
      }

      // Space — pause
      if (key === ' ') {
        e.preventDefault()
        store.togglePause()
        return
      }

      // T — cycle color mode
      if (key === 't') {
        store.cycleColorMode()
        return
      }

      // B — cycle bloom
      if (key === 'b') {
        store.cycleBloom()
        return
      }

      // Q/E — hue rotate
      if (key === 'q') {
        store.setHueOffset(store.hueOffset - 0.05)
        return
      }
      if (key === 'e') {
        store.setHueOffset(store.hueOffset + 0.05)
        return
      }

      // R — randomize
      if (key === 'r') {
        store.setIntensity(0.2 + Math.random() * 0.8)
        store.setHueOffset(Math.random())
        store.setTimeScale(0.3 + Math.random() * 2.0)
        store.cycleColorMode()
        store.cycleBloom()
        return
      }

      // F — fullscreen
      if (key === 'f') {
        if (document.fullscreenElement) document.exitFullscreen()
        else document.documentElement.requestFullscreen()
        return
      }

      // H — help
      if (key === 'h') {
        store.toggleHelp()
        return
      }

      // [ — speed down
      if (key === '[') {
        store.cycleSpeedDown()
        return
      }

      // ] — speed up
      if (key === ']') {
        store.cycleSpeedUp()
        return
      }

      // G — cycle gravity mode
      if (key === 'g') {
        store.cycleGravity()
        return
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      useInputStore.getState().keyUp(e.key)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('click', onClick)
    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('click', onClick)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  return null
}
