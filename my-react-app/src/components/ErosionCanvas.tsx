import { useCallback, useEffect, useRef } from 'react'
import { colorForValue, type ColorMode } from '../lib/noise'
import {
  stepErosion,
  type ErosionParams,
  type ErosionState,
} from '../lib/erosion'
import './NoiseCanvas.css'

type ErosionCanvasProps = {
  erosionState: ErosionState | null
  erosionParams: ErosionParams
  running: boolean
  colorMode: ColorMode
  onStateUpdate: (state: ErosionState) => void
}

export default function ErosionCanvas({
  erosionState,
  erosionParams,
  running,
  colorMode,
  onStateUpdate,
}: ErosionCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef(erosionState)
  const paramsRef = useRef(erosionParams)
  const runningRef = useRef(running)
  const colorRef = useRef(colorMode)

  useEffect(() => { stateRef.current = erosionState }, [erosionState])
  useEffect(() => { paramsRef.current = erosionParams }, [erosionParams])
  useEffect(() => { runningRef.current = running }, [running])
  useEffect(() => { colorRef.current = colorMode }, [colorMode])

  const paint = useCallback(() => {
    const canvas = canvasRef.current
    const state = stateRef.current
    if (!canvas || !state) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const size = paramsRef.current.mapSize
    if (canvas.width !== size || canvas.height !== size) {
      canvas.width = size
      canvas.height = size
    }

    const image = ctx.createImageData(size, size)
    const px = image.data
    const mode = colorRef.current

    for (let i = 0; i < state.heightmap.length; i++) {
      const v = Math.min(1, Math.max(0, state.heightmap[i]))
      const [r, g, b] = colorForValue(mode, v)
      const off = i * 4
      px[off] = r
      px[off + 1] = g
      px[off + 2] = b
      px[off + 3] = 255
    }

    ctx.putImageData(image, 0, 0)
  }, [])

  // Paint whenever state changes (including from outside).
  useEffect(() => {
    paint()
  }, [erosionState, colorMode, paint])

  // Simulation loop.
  useEffect(() => {
    if (!running || !erosionState) return

    let frameId = 0

    const tick = () => {
      const state = stateRef.current
      if (!state || !runningRef.current) return

      const updated = stepErosion(state, paramsRef.current)
      onStateUpdate({ ...updated, heightmap: updated.heightmap })
      paint()

      frameId = requestAnimationFrame(tick)
    }

    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [running, erosionState, onStateUpdate, paint])

  return (
    <div ref={containerRef} className="noise-canvas">
      {erosionState ? (
        <canvas
          ref={canvasRef}
          className="noise-canvas__surface"
          aria-label="Erosion simulation"
        />
      ) : (
        <div className="noise-canvas__empty">
          <p>Generate a base heightmap first, then start the simulation.</p>
        </div>
      )}
    </div>
  )
}
