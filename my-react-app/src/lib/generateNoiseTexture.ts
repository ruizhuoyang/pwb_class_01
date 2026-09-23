import {
  applyShaping,
  blendValues,
  colorForValue,
  createNoiseSampler,
  type NoiseLayer,
} from './noise'

/**
 * Renders multi-layer noise into an offscreen canvas for 3D texture use.
 */
export function generateNoiseTexture(
  layers: NoiseLayer[],
  size: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size

  const ctx = canvas.getContext('2d')!
  const image = ctx.createImageData(size, size)
  const px = image.data
  const colorMode = layers[0]?.params.colorMode ?? 'grayscale'

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = compositeLayers(layers, x, y, size)
      const [r, g, b] = colorForValue(colorMode, v)
      const offset = (y * size + x) * 4
      px[offset] = r
      px[offset + 1] = g
      px[offset + 2] = b
      px[offset + 3] = 255
    }
  }

  ctx.putImageData(image, 0, 0)
  return canvas
}

/**
 * Generates a Float32Array of composited 0..1 values for displacement.
 */
export function generateHeightfield(
  layers: NoiseLayer[],
  size: number,
): Float32Array {
  const data = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      data[y * size + x] = compositeLayers(layers, x, y, size)
    }
  }
  return data
}

/**
 * Renders a raw Float32Array heightmap (0..1) into a coloured offscreen canvas.
 */
export function heightmapToTexture(
  heightmap: Float32Array,
  size: number,
  colorMode: import('./noise').ColorMode = 'terrain',
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size

  const ctx = canvas.getContext('2d')!
  const image = ctx.createImageData(size, size)
  const px = image.data

  for (let i = 0; i < heightmap.length; i++) {
    const v = Math.min(1, Math.max(0, heightmap[i]))
    const [r, g, b] = colorForValue(colorMode, v)
    const off = i * 4
    px[off] = r
    px[off + 1] = g
    px[off + 2] = b
    px[off + 3] = 255
  }

  ctx.putImageData(image, 0, 0)
  return canvas
}

function compositeLayers(
  layers: NoiseLayer[],
  x: number,
  y: number,
  size: number,
): number {
  let result = 0
  let first = true

  for (const layer of layers) {
    if (!layer.visible) continue
    const sampler = createNoiseSampler(layer.params)
    const nx = (x / size) * layer.params.scale
    const ny = (y / size) * layer.params.scale
    let v = sampler.sample(nx, ny)
    v = applyShaping(v, layer.shaping)

    if (first) {
      result = v * layer.opacity
      first = false
    } else {
      result = blendValues(result, v, layer.blendMode, layer.opacity)
    }
  }

  return Math.min(1, Math.max(0, result))
}
