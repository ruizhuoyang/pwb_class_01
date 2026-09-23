import { useEffect, useRef, useState } from 'react'
import { colorForValue, type NoiseLayer } from '../lib/noise'
import { compositeLayers, prepareLayers, type MapOffset } from '../lib/generateNoiseTexture'
import PanZoomViewport from './PanZoomViewport'
import './NoiseCanvas.css'

type NoiseCanvasProps = {
  layers: NoiseLayer[]
  offset: MapOffset
}

export default function NoiseCanvas({ layers, offset }: NoiseCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [aspect, setAspect] = useState(1)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const resizeObserver = new ResizeObserver(() => {
      const { clientWidth, clientHeight } = container
      if (clientWidth === 0 || clientHeight === 0) return
      setAspect(clientHeight / clientWidth)
    })

    resizeObserver.observe(container)
    return () => resizeObserver.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || layers.length === 0) return

    const frameId = requestAnimationFrame(() => {
      const context = canvas.getContext('2d')
      if (!context) return

      const resolution = layers[0].params.resolution
      const width = resolution
      const height = Math.max(1, Math.round(resolution * aspect))
      canvas.width = width
      canvas.height = height

      const colorMode = layers[0].params.colorMode
      const image = context.createImageData(width, height)
      const pixels = image.data
      const active = prepareLayers(layers)

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const result = compositeLayers(active, x / width + offset.x, y / width + offset.y)
          const [r, g, b] = colorForValue(colorMode, result)
          const i = (y * width + x) * 4
          pixels[i] = r
          pixels[i + 1] = g
          pixels[i + 2] = b
          pixels[i + 3] = 255
        }
      }

      context.putImageData(image, 0, 0)
    })

    return () => cancelAnimationFrame(frameId)
  }, [layers, aspect, offset])

  return (
    <div ref={containerRef} className="noise-canvas">
      <PanZoomViewport label="Current Height Map">
        <canvas
          ref={canvasRef}
          className="noise-canvas__surface"
          aria-label="Noise map"
        />
      </PanZoomViewport>
    </div>
  )
}
