// ─────────────────────────────────────────────────────────
// Voxel field — turns UI parameters into a filled density grid
//
// Pipeline: operations[0] fills the grid (base shape), then every
// later operation is combined into that same grid in list order.
// The finished DensityGrid is what Marching Cubes / chunking will consume.
// ─────────────────────────────────────────────────────────

import { createDensityGrid, fillDensityGrid, type DensityFn, type DensityGrid } from './densityGrid'
import { applyCsg, combineDensity, type CsgOp } from './csg'
import { shapeToDensity, type DensityShape } from './densityShapes'

export type VoxelOperation = {
  id: string
  /** Ignored for the first (base) operation. */
  op: CsgOp
  shape: DensityShape
}

export type VoxelParams = {
  /** Samples per axis. */
  resolution: number
  /** World-space edge length of the grid cube. */
  extent: number
  /** Density threshold separating solid from empty. */
  isoLevel: number
  /** Applied in order; the first entry is the base shape. */
  operations: VoxelOperation[]
}

let operationCounter = 0
export function createOperation(op: CsgOp, shape: DensityShape): VoxelOperation {
  operationCounter++
  return { id: `op-${operationCounter}`, op, shape }
}

export function createDefaultOperations(): VoxelOperation[] {
  return [
    createOperation('union', { type: 'sphere', center: [0, 0, 0], radius: 2.5 }),
    createOperation('union', { type: 'box', center: [2, -1, 0], size: [3, 2, 3] }),
    createOperation('subtract', { type: 'sphere', center: [1.8, 0, 1.2], radius: 1.5 }),
  ]
}

export function createDefaultVoxelParams(): VoxelParams {
  return {
    resolution: 64,
    extent: 8,
    isoLevel: 0,
    operations: createDefaultOperations(),
  }
}

export function buildVoxelGrid(params: VoxelParams): DensityGrid {
  const grid = createDensityGrid(params.resolution, params.extent)
  const [base, ...rest] = params.operations
  if (!base) return fillDensityGrid(grid, () => -1)

  fillDensityGrid(grid, shapeToDensity(base.shape))
  for (const step of rest) applyCsg(grid, shapeToDensity(step.shape), step.op)
  return grid
}

/**
 * The same operation list as a single point-wise function, so any sub-region
 * (e.g. one chunk) can be evaluated without filling the whole grid.
 */
export function composeDensity(operations: VoxelOperation[]): DensityFn {
  const [base, ...rest] = operations
  if (!base) return () => -1

  const baseFn = shapeToDensity(base.shape)
  const steps = rest.map((step) => ({ fn: shapeToDensity(step.shape), op: step.op }))
  // fround after each step mirrors the Float32 grid passes of buildVoxelGrid bit-for-bit.
  return (x, y, z) => {
    let d = Math.fround(baseFn(x, y, z))
    for (const step of steps) d = Math.fround(combineDensity(d, step.fn(x, y, z), step.op))
    return d
  }
}
