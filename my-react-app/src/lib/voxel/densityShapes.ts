// ─────────────────────────────────────────────────────────
// Density shapes — each shape becomes a DensityFn
//
// Shapes return (roughly) signed distance flipped so inside is
// positive: density = radius - distance for a sphere. Keeping every
// shape in this form lets CSG combine them with min/max
// (see csg.ts).
// ─────────────────────────────────────────────────────────

import type { DensityFn, Vec3 } from './densityGrid'
import { createFbm3D } from './noise3d'

export type SphereShape = {
  type: 'sphere'
  center: Vec3
  radius: number
}

export type BoxShape = {
  type: 'box'
  center: Vec3
  /** Full edge lengths along x, y, z. */
  size: Vec3
}

export type NoiseShape = {
  type: 'noise'
  /** Offset of the noise pattern. */
  center: Vec3
  /** Noise frequency; higher = smaller blobs. */
  scale: number
  /** Raises or lowers the fill amount: higher = less solid. */
  threshold: number
  seed: number
}

/** Add new shape variants to this union. */
export type DensityShape = SphereShape | BoxShape | NoiseShape

export type DensityShapeType = DensityShape['type']

export const SHAPE_TYPES: { value: DensityShapeType; label: string }[] = [
  { value: 'sphere', label: 'Sphere' },
  { value: 'box', label: 'Box' },
  { value: 'noise', label: 'Noise Volume' },
]

const NOISE_OCTAVES = 3

/** Default shape of a given type, placed at `center`. */
export function createShape(type: DensityShapeType, center: Vec3 = [0, 0, 0]): DensityShape {
  switch (type) {
    case 'sphere':
      return { type, center, radius: 1.5 }
    case 'box':
      return { type, center, size: [2, 2, 2] }
    case 'noise':
      return { type, center, scale: 0.6, threshold: 0, seed: Math.floor(Math.random() * 100000) }
  }
}

export function sphereDensity(center: Vec3, radius: number): DensityFn {
  const [cx, cy, cz] = center
  return (x, y, z) => {
    const dx = x - cx
    const dy = y - cy
    const dz = z - cz
    return radius - Math.sqrt(dx * dx + dy * dy + dz * dz)
  }
}

/** Negated box signed distance: positive inside, 0 on the faces. */
export function boxDensity(center: Vec3, size: Vec3): DensityFn {
  const [cx, cy, cz] = center
  const hx = size[0] / 2
  const hy = size[1] / 2
  const hz = size[2] / 2
  return (x, y, z) => {
    // Per-axis distance past each face (negative while inside that slab).
    const qx = Math.abs(x - cx) - hx
    const qy = Math.abs(y - cy) - hy
    const qz = Math.abs(z - cz) - hz
    const ox = Math.max(qx, 0)
    const oy = Math.max(qy, 0)
    const oz = Math.max(qz, 0)
    const outside = Math.sqrt(ox * ox + oy * oy + oz * oz)
    const inside = Math.min(Math.max(qx, qy, qz), 0)
    return -(outside + inside)
  }
}

/**
 * fBm noise minus a threshold. Dividing by `scale` keeps the density change
 * per world unit similar to the distance shapes, so CSG blends stay balanced.
 */
export function noiseDensity(center: Vec3, scale: number, threshold: number, seed: number): DensityFn {
  const [cx, cy, cz] = center
  const fbm = createFbm3D(seed, NOISE_OCTAVES)
  return (x, y, z) => (fbm((x - cx) * scale, (y - cy) * scale, (z - cz) * scale) - threshold) / scale
}

export function shapeToDensity(shape: DensityShape): DensityFn {
  switch (shape.type) {
    case 'sphere':
      return sphereDensity(shape.center, shape.radius)
    case 'box':
      return boxDensity(shape.center, shape.size)
    case 'noise':
      return noiseDensity(shape.center, shape.scale, shape.threshold, shape.seed)
  }
}
