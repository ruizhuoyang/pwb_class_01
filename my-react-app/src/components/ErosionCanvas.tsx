import { useEffect, useRef } from 'react'
import { colorForValue, type ColorMode } from '../lib/noise'
import type { ErosionState } from '../lib/erosion'
import PanZoomViewport from './PanZoomViewport'
import './NoiseCanvas.css'

type ErosionCanvasProps = {
  erosionState: ErosionState | null
  colorMode: ColorMode
}

/** Displays the erosion heightmap; the simulation loop itself runs in App. */
export default function ErosionCanvas({ erosionState, colorMode }: ErosionCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !erosionState) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const size = Math.round(Math.sqrt(erosionState.heightmap.length))
    if (canvas.width !== size || canvas.height !== size) {
      canvas.width = size
      canvas.height = size
    }

    const image = ctx.createImageData(size, size)
    const px = image.data

    for (let i = 0; i < erosionState.heightmap.length; i++) {
      const v = Math.min(1, Math.max(0, erosionState.heightmap[i]))
      const [r, g, b] = colorForValue(colorMode, v)
      const off = i * 4
      px[off] = r
      px[off + 1] = g
      px[off + 2] = b
      px[off + 3] = 255
    }

    ctx.putImageData(image, 0, 0)
  }, [erosionState, colorMode])

  return (
    <div className="noise-canvas">
      {erosionState ? (
        <PanZoomViewport label="Current Height Map">
          <canvas
            ref={canvasRef}
            className="noise-canvas__surface"
            aria-label="Erosion simulation"
          />
        </PanZoomViewport>
      ) : (
        <div className="noise-canvas__empty">
          <p>Generate a base heightmap first, then start the simulation.</p>
        </div>
      )}
    </div>
  )
}
