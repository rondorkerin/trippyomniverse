import { create } from 'zustand'

interface CameraStore {
  active: boolean
  averageColor: [number, number, number]
  brightness: number
  dominantHue: number
  gridBrightness: number[]
  motion: number
  motionX: number
  motionY: number
}

export const useCameraStore = create<CameraStore>(() => ({
  active: false,
  averageColor: [0, 0, 0],
  brightness: 0,
  dominantHue: 0,
  gridBrightness: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  motion: 0,
  motionX: 0,
  motionY: 0,
}))

let video: HTMLVideoElement | null = null
let canvas: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null
let rafId: number | null = null
let prevFrame: Uint8ClampedArray | null = null
const W = 64
const H = 48

function analyze() {
  if (!video || !ctx || !canvas) return
  ctx.drawImage(video, 0, 0, W, H)
  const data = ctx.getImageData(0, 0, W, H).data

  let rSum = 0, gSum = 0, bSum = 0
  const grid = [0, 0, 0, 0, 0, 0, 0, 0, 0]
  const gridCounts = [0, 0, 0, 0, 0, 0, 0, 0, 0]
  let motionSum = 0
  let motionXSum = 0
  let motionYSum = 0
  const pixels = W * H

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      const r = data[i], g = data[i + 1], b = data[i + 2]
      rSum += r; gSum += g; bSum += b

      const lum = (r + g + b) / 3
      const gx = Math.min(2, Math.floor(x / (W / 3)))
      const gy = Math.min(2, Math.floor(y / (H / 3)))
      const gi = gy * 3 + gx
      grid[gi] += lum / 255
      gridCounts[gi]++

      if (prevFrame) {
        const diff = Math.abs(r - prevFrame[i]) + Math.abs(g - prevFrame[i + 1]) + Math.abs(b - prevFrame[i + 2])
        motionSum += diff
        const nx = (x / W) * 2 - 1
        const ny = (y / H) * 2 - 1
        motionXSum += diff * nx
        motionYSum += diff * ny
      }
    }
  }

  const avgR = rSum / pixels
  const avgG = gSum / pixels
  const avgB = bSum / pixels
  const brightness = (avgR + avgG + avgB) / (3 * 255)

  // Dominant hue via simple max-channel approach
  const maxC = Math.max(avgR, avgG, avgB)
  const minC = Math.min(avgR, avgG, avgB)
  let hue = 0
  if (maxC - minC > 1) {
    if (maxC === avgR) hue = ((avgG - avgB) / (maxC - minC)) / 6
    else if (maxC === avgG) hue = (2 + (avgB - avgR) / (maxC - minC)) / 6
    else hue = (4 + (avgR - avgG) / (maxC - minC)) / 6
    if (hue < 0) hue += 1
  }

  const gridBrightness = grid.map((v, i) => gridCounts[i] > 0 ? v / gridCounts[i] : 0)
  const totalMotion = prevFrame ? motionSum / (pixels * 765) : 0
  const mX = prevFrame ? motionXSum / Math.max(1, motionSum) : 0
  const mY = prevFrame ? motionYSum / Math.max(1, motionSum) : 0

  prevFrame = new Uint8ClampedArray(data)

  useCameraStore.setState({
    averageColor: [avgR / 255, avgG / 255, avgB / 255],
    brightness,
    dominantHue: hue,
    gridBrightness,
    motion: totalMotion,
    motionX: mX,
    motionY: mY,
  })

  rafId = requestAnimationFrame(analyze)
}

export async function startCamera() {
  if (useCameraStore.getState().active) return

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } })
    video = document.createElement('video')
    video.srcObject = stream
    video.playsInline = true
    await video.play()

    canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    ctx = canvas.getContext('2d', { willReadFrequently: true })

    prevFrame = null
    useCameraStore.setState({ active: true })
    analyze()
  } catch (e) {
    console.warn('Camera access denied:', e)
  }
}

export function stopCamera() {
  if (rafId !== null) cancelAnimationFrame(rafId)
  rafId = null
  if (video?.srcObject) {
    (video.srcObject as MediaStream).getTracks().forEach((t) => t.stop())
  }
  video = null
  canvas = null
  ctx = null
  prevFrame = null
  useCameraStore.setState({
    active: false,
    brightness: 0,
    motion: 0,
    motionX: 0,
    motionY: 0,
    gridBrightness: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  })
}
