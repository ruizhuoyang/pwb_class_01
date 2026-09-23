import { useEffect, useRef } from 'react'
import './MapReference.css'

type MapReferenceProps = {
  colorMap: HTMLCanvasElement | null
  source: 'noise' | 'erosion' | null
  onClose: () => void
}

const DISPLAY_SIZE = 160

export default function MapReference({ colorMap, source, onClose }: MapReferenceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !colorMap) return
    canvas.width = colorMap.width
    canvas.height = colorMap.height
    canvas.getContext('2d')?.drawImage(colorMap, 0, 0)
  }, [colorMap])

  const title = source === 'erosion' ? 'Simulation' : source === 'noise' ? 'Noise' : 'Map'

  return (
    <div className="map-reference" aria-label="Applied map reference">
      <div className="map-reference__header">
        <span className="map-reference__title">{title}</span>
        {colorMap && <span className="map-reference__size">{colorMap.width}×{colorMap.height}</span>}
        <button type="button" className="map-reference__close" onClick={onClose} aria-label="Close map reference">
          Close
        </button>
      </div>
      {colorMap ? (
        <canvas
          ref={canvasRef}
          className="map-reference__canvas"
          style={{ width: DISPLAY_SIZE, height: DISPLAY_SIZE }}
        />
      ) : (
        <p className="map-reference__empty" style={{ width: DISPLAY_SIZE, height: DISPLAY_SIZE }}>
          No map applied yet. Build terrain data in 2D Terrain, then apply it to 3D.
        </p>
      )}
    </div>
  )
}
