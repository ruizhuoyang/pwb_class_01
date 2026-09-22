import { useEffect, useRef, useState } from 'react'
import {
  applyShaping,
  blendValues,
  colorForValue,
  createNoiseSampler,
  type NoiseLayer,
} from '../lib/noise'
import './NoiseCanvas.css'

type NoiseCanvasProps = {
  layers: NoiseLayer[]
}

export default function NoiseCanvas({ layers }: NoiseCanvasProps) {
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

      // Pre-create samplers for all visible layers.
      const activeLayers = layers
        .filter((l) => l.visible)
        .map((l) => ({ layer: l, sampler: createNoiseSampler(l.params) }))

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let result = 0
          let first = true

          for (const { layer, sampler } of activeLayers) {
            const nx = (x / width) * layer.params.scale
            const ny = (y / width) * layer.params.scale
            let v = sampler.sample(nx, ny)
            v = applyShaping(v, layer.shaping)

            if (first) {
              result = v * layer.opacity
              first = false
            } else {
              result = blendValues(result, v, layer.blendMode, layer.opacity)
            }
          }

          result = Math.min(1, Math.max(0, result))
          const [r, g, b] = colorForValue(colorMode, result)
          const offset = (y * width + x) * 4
          pixels[offset] = r
          pixels[offset + 1] = g
          pixels[offset + 2] = b
          pixels[offset + 3] = 255
        }
      }

      context.putImageData(image, 0, 0)
    })

    return () => cancelAnimationFrame(frameId)
  }, [layers, aspect])

  return (
    <div ref={containerRef} className="noise-canvas">
      <canvas
        ref={canvasRef}
        className="noise-canvas__surface"
        aria-label="Noise map"
      />
    </div>
  )
}
