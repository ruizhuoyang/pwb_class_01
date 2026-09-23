// ─────────────────────────────────────────────────────────
// CSG on density fields (inside = positive)
//
//   union      A ∪ B  → max(a, b)    solid if either is solid
//   intersect  A ∩ B  → min(a, b)    solid only where both are
//   subtract   A − B  → min(a, -b)   solid in A and outside B
//
// Operations are applied in place to the running grid, so each
// step works on the result of every step before it.
// ─────────────────────────────────────────────────────────

import { gridToWorld, type DensityFn, type DensityGrid } from './densityGrid'

export type CsgOp = 'union' | 'subtract' | 'intersect'

export const CSG_OPS: { value: CsgOp; label: string }[] = [
  { value: 'union', label: 'Union' },
  { value: 'subtract', label: 'Subtract' },
  { value: 'intersect', label: 'Intersect' },
]

export function combineDensity(current: number, shape: number, op: CsgOp): number {
  switch (op) {
    case 'union':
      return Math.max(current, shape)
    case 'intersect':
      return Math.min(current, shape)
    case 'subtract':
      return Math.min(current, -shape)
  }
}

/** Combines `fn` into every sample of `grid` using `op`. */
export function applyCsg(grid: DensityGrid, fn: DensityFn, op: CsgOp): DensityGrid {
  const r = grid.resolution
  const d = grid.data
  let i = 0
  for (let iz = 0; iz < r; iz++) {
    const z = gridToWorld(grid, iz)
    for (let iy = 0; iy < r; iy++) {
      const y = gridToWorld(grid, iy)
      for (let ix = 0; ix < r; ix++) {
        d[i] = combineDensity(d[i], fn(gridToWorld(grid, ix), y, z), op)
        i++
      }
    }
  }
  return grid
}
