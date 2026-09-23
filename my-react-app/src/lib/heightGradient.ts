// ─────────────────────────────────────────────────────────
// Height gradient — colours a heightfield by normalized elevation
// ─────────────────────────────────────────────────────────

export type TerrainColorMode = 'default' | 'height'

export type GradientStop = {
  /** 0..1 along the normalized height range. */
  position: number
  /** CSS hex colour, e.g. `#1e5bd6`. */
  color: string
}

export const DEFAULT_GRADIENT: GradientStop[] = [
  { position: 0, color: '#1e4fd6' },
  { position: 0.35, color: '#1fc7a0' },
  { position: 0.6, color: '#f2d43d' },
  { position: 0.8, color: '#f28a2e' },
  { position: 1, color: '#d9332b' },
]

type Rgb = [number, number, number]

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.replace('#', ''), 16)
  if (Number.isNaN(n)) return [0, 0, 0]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Lerps between the two stops neighbouring `t`; expects stops sorted by position. */
function sampleSorted(sorted: { position: number; rgb: Rgb }[], t: number): Rgb {
  if (t <= sorted[0].position) return sorted[0].rgb
  const last = sorted[sorted.length - 1]
  if (t >= last.position) return last.rgb

  for (let i = 1; i < sorted.length; i++) {
    const hi = sorted[i]
    if (t > hi.position) continue
    const lo = sorted[i - 1]
    const span = hi.position - lo.position
    if (span <= 0) return hi.rgb
    const k = (t - lo.position) / span
    return [
      lo.rgb[0] + (hi.rgb[0] - lo.rgb[0]) * k,
      lo.rgb[1] + (hi.rgb[1] - lo.rgb[1]) * k,
      lo.rgb[2] + (hi.rgb[2] - lo.rgb[2]) * k,
    ]
  }
  return last.rgb
}

/** CSS `linear-gradient` matching the stops, for a UI preview bar. */
export function gradientCss(stops: GradientStop[]): string {
  const sorted = [...stops].sort((a, b) => a.position - b.position)
  const parts = sorted.map((s) => `${s.color} ${(Math.min(1, Math.max(0, s.position)) * 100).toFixed(1)}%`)
  return `linear-gradient(90deg, ${parts.join(', ')})`
}

const LUT_SIZE = 256

/**
 * Paints a square heightfield into an offscreen canvas, coloured by
 * `(h - min) / (max - min)` mapped through the gradient.
 * Pixel layout matches `heightmapToTexture`, so it drops into the same texture slot.
 */
export function heightGradientTexture(
  heightfield: Float32Array,
  stops: GradientStop[],
): HTMLCanvasElement {
  const size = Math.round(Math.sqrt(heightfield.length))
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const image = ctx.createImageData(size, size)
  const px = image.data

  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < heightfield.length; i++) {
    const h = heightfield[i]
    if (h < min) min = h
    if (h > max) max = h
  }
  const range = max - min
  const invRange = range > 1e-9 ? 1 / range : 0

  const sorted = stops
    .map((s) => ({ position: Math.min(1, Math.max(0, s.position)), rgb: hexToRgb(s.color) }))
    .sort((a, b) => a.position - b.position)
  const lut = new Uint8ClampedArray(LUT_SIZE * 3)
  for (let i = 0; i < LUT_SIZE; i++) {
    const [r, g, b] = sorted.length ? sampleSorted(sorted, i / (LUT_SIZE - 1)) : [0, 0, 0]
    lut[i * 3] = r
    lut[i * 3 + 1] = g
    lut[i * 3 + 2] = b
  }

  for (let i = 0; i < size * size; i++) {
    const t = (heightfield[i] - min) * invRange
    const li = Math.min(LUT_SIZE - 1, Math.max(0, Math.round(t * (LUT_SIZE - 1)))) * 3
    const off = i * 4
    px[off] = lut[li]
    px[off + 1] = lut[li + 1]
    px[off + 2] = lut[li + 2]
    px[off + 3] = 255
  }

  ctx.putImageData(image, 0, 0)
  return canvas
}
