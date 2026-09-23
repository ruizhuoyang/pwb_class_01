import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import './PanZoomViewport.css'

const MIN_ZOOM = 0.5
const MAX_ZOOM = 8
const WHEEL_SENSITIVITY = 0.0015

type View = { zoom: number; x: number; y: number }

const DEFAULT_VIEW: View = { zoom: 1, x: 0, y: 0 }

type PanZoomViewportProps = {
  label: string
  children: ReactNode
}

/**
 * Purely visual pan/zoom: transforms the displayed element only.
 * The wrapped canvas keeps its own pixels and data.
 */
export default function PanZoomViewport({ label, children }: PanZoomViewportProps) {
  const surfaceRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null)
  const [view, setView] = useState<View>(DEFAULT_VIEW)
  const [dragging, setDragging] = useState(false)

  // Native listener: React's onWheel is passive, so it can't stop page scrolling.
  useEffect(() => {
    const surface = surfaceRef.current
    if (!surface) return

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = surface.getBoundingClientRect()
      const cx = event.clientX - rect.left
      const cy = event.clientY - rect.top
      const factor = Math.exp(-event.deltaY * WHEEL_SENSITIVITY)

      setView((prev) => {
        const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev.zoom * factor))
        const ratio = zoom / prev.zoom
        // Keep the point under the cursor fixed while zooming.
        return {
          zoom,
          x: cx - (cx - prev.x) * ratio,
          y: cy - (cy - prev.y) * ratio,
        }
      })
    }

    surface.addEventListener('wheel', handleWheel, { passive: false })
    return () => surface.removeEventListener('wheel', handleWheel)
  }, [])

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY }
    setDragging(true)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.lastX
    const dy = event.clientY - drag.lastY
    drag.lastX = event.clientX
    drag.lastY = event.clientY
    setView((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }))
  }

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragging(false)
  }

  const isDefault = view.zoom === 1 && view.x === 0 && view.y === 0

  return (
    <div className="pan-zoom">
      <div
        ref={surfaceRef}
        className={`pan-zoom__surface ${dragging ? 'pan-zoom__surface--dragging' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div
          className="pan-zoom__content"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
        >
          {children}
        </div>
      </div>

      <div className="pan-zoom__hud">
        <span className="pan-zoom__label">{label}</span>
        <span className="pan-zoom__hint">Drag to pan · Scroll to zoom</span>
        <span className="pan-zoom__zoom">{Math.round(view.zoom * 100)}%</span>
        <button
          type="button"
          className="pan-zoom__reset"
          onClick={() => setView(DEFAULT_VIEW)}
          disabled={isDefault}
        >
          Reset View
        </button>
      </div>
    </div>
  )
}
