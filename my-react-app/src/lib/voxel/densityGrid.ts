// ─────────────────────────────────────────────────────────
// Density grid — a cube of scalar samples centred on the origin
//
// Convention: density > isoLevel is solid, otherwise empty.
// For distance-style shapes the surface sits at density 0.
// Samples live on grid *corners* (resolution points per axis,
// resolution - 1 cells), which is the layout Marching Cubes expects.
// ─────────────────────────────────────────────────────────

export type Vec3 = [number, number, number]

/** Density at a world-space point. */
export type DensityFn = (x: number, y: number, z: number) => number

export type DensityGrid = {
  /** Samples per axis. */
  resolution: number
  /** World-space edge length of the cube. */
  extent: number
  /** resolution³ samples, x fastest, then y, then z. */
  data: Float32Array
}

export function createDensityGrid(resolution: number, extent: number): DensityGrid {
  return { resolution, extent, data: new Float32Array(resolution ** 3) }
}

export function gridIndex(grid: DensityGrid, ix: number, iy: number, iz: number): number {
  const r = grid.resolution
  return ix + iy * r + iz * r * r
}

/** Distance between neighbouring samples. */
export function gridSpacing(grid: DensityGrid): number {
  return grid.extent / (grid.resolution - 1)
}

/** World coordinate of sample index `i` along any axis. */
export function gridToWorld(grid: DensityGrid, i: number): number {
  return -grid.extent / 2 + i * gridSpacing(grid)
}

/** Overwrites every sample with `fn` evaluated at its world position. */
export function fillDensityGrid(grid: DensityGrid, fn: DensityFn): DensityGrid {
  const r = grid.resolution
  let i = 0
  for (let iz = 0; iz < r; iz++) {
    const z = gridToWorld(grid, iz)
    for (let iy = 0; iy < r; iy++) {
      const y = gridToWorld(grid, iy)
      for (let ix = 0; ix < r; ix++) {
        grid.data[i++] = fn(gridToWorld(grid, ix), y, z)
      }
    }
  }
  return grid
}

export function countSolid(grid: DensityGrid, isoLevel: number): number {
  let count = 0
  for (let i = 0; i < grid.data.length; i++) if (grid.data[i] > isoLevel) count++
  return count
}

/**
 * Indices of solid samples with at least one empty 6-neighbour (or on the grid edge).
 * Interior samples are hidden anyway, so drawing only these keeps instance counts low.
 */
export function collectSurfaceVoxels(grid: DensityGrid, isoLevel: number): Uint32Array {
  const r = grid.resolution
  const d = grid.data
  const r2 = r * r
  const out: number[] = []
  for (let iz = 0; iz < r; iz++) {
    for (let iy = 0; iy < r; iy++) {
      for (let ix = 0; ix < r; ix++) {
        const i = ix + iy * r + iz * r2
        if (d[i] <= isoLevel) continue
        const onEdge = ix === 0 || iy === 0 || iz === 0 || ix === r - 1 || iy === r - 1 || iz === r - 1
        if (
          onEdge ||
          d[i - 1] <= isoLevel || d[i + 1] <= isoLevel ||
          d[i - r] <= isoLevel || d[i + r] <= isoLevel ||
          d[i - r2] <= isoLevel || d[i + r2] <= isoLevel
        ) {
          out.push(i)
        }
      }
    }
  }
  return Uint32Array.from(out)
}
