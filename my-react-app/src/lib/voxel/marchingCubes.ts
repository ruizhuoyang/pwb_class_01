// ─────────────────────────────────────────────────────────
// Marching Cubes — density samples → indexed triangle mesh
//
// Each cell between 8 neighbouring samples is classified by which
// corners are empty (density < isoLevel). The 8-bit case index looks
// up which of the 12 cell edges the surface crosses (edgeTable) and how
// those crossing points form triangles (triTable). Uses the standard
// Lorensen/Bourke tables shipped with three.js.
//
// Corner order        Edge order
//   c0 (0,0,0)          e0 c0-c1   e4 c4-c5   e8  c0-c4
//   c1 (1,0,0)          e1 c1-c2   e5 c5-c6   e9  c1-c5
//   c2 (1,1,0)          e2 c2-c3   e6 c6-c7   e10 c2-c6
//   c3 (0,1,0)          e3 c3-c0   e7 c7-c4   e11 c3-c7
//   c4..c7 = c0..c3 with z + 1
// ─────────────────────────────────────────────────────────

import { edgeTable, triTable } from 'three/addons/objects/MarchingCubes.js'
import { gridToWorld, type DensityGrid } from './densityGrid'

export type MeshData = {
  /** xyz per vertex. */
  positions: Float32Array
  /** Three vertex indices per triangle. */
  indices: Uint32Array
  /** Per-vertex normals when computed from the density gradient; otherwise derive from triangles. */
  normals?: Float32Array
}

type Int3 = [number, number, number]

/** A box of cells on some integer sample lattice. */
export type MarchRegion = {
  /** Density at a lattice point. Must cover every cell corner (and ±1 around them for gradient normals). */
  sample: (x: number, y: number, z: number) => number
  /** Lower corner of the first cell, per axis. */
  cellMin: Int3
  /** One past the lower corner of the last cell, per axis. */
  cellMax: Int3
  /** World coordinate of lattice index `i` along `axis`. */
  toWorld: (axis: number, i: number) => number
  /**
   * Normals from the density gradient: identical on both sides of a shared boundary,
   * so separately meshed regions shade seamlessly.
   */
  gradientNormals: boolean
}

/** Added to the iso level for samples outside the volume, so borders get capped. */
export const OUTSIDE_OFFSET = -1e6

const CORNERS: Int3[] = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
]

/** Each edge as (lower corner offset, axis 0=x 1=y 2=z). */
const EDGES: [number, number, number, number][] = [
  [0, 0, 0, 0], [1, 0, 0, 1], [0, 1, 0, 0], [0, 0, 0, 1],
  [0, 0, 1, 0], [1, 0, 1, 1], [0, 1, 1, 0], [0, 0, 1, 1],
  [0, 0, 0, 2], [1, 0, 0, 2], [1, 1, 0, 2], [0, 1, 0, 2],
]

/** Meshes a whole DensityGrid in one pass (the unchunked path). */
export function marchingCubes(grid: DensityGrid, isoLevel: number): MeshData {
  const r = grid.resolution
  const d = grid.data
  // Samples outside the grid count as empty, so shapes touching the border get capped
  // instead of leaving holes. The large gap puts cap vertices right on the border samples.
  const outside = isoLevel + OUTSIDE_OFFSET
  const mesh = marchRegion(
    {
      sample: (x, y, z) =>
        x < 0 || y < 0 || z < 0 || x >= r || y >= r || z >= r ? outside : d[x + y * r + z * r * r],
      // Cells span -1..r-1 so the padding layer on every side is included.
      cellMin: [-1, -1, -1],
      cellMax: [r, r, r],
      toWorld: (_axis, i) => gridToWorld(grid, i),
      gradientNormals: false,
    },
    isoLevel,
  )
  orientOutward(mesh)
  return mesh
}

export function marchRegion(region: MarchRegion, isoLevel: number): MeshData {
  const { sample, cellMin, cellMax, toWorld, gradientNormals } = region
  const [minX, minY, minZ] = cellMin
  const [maxX, maxY, maxZ] = cellMax

  // One vertex per crossed lattice edge, shared by the (up to 4) cells around it.
  const Lx = maxX - minX + 1
  const Ly = maxY - minY + 1
  const Lz = maxZ - minZ + 1
  const edgeVertex = new Int32Array(Lx * Ly * Lz * 3).fill(-1)
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  const values = new Float64Array(8)
  const cellEdges = new Int32Array(12)

  const gradient = (x: number, y: number, z: number): Int3 => [
    sample(x + 1, y, z) - sample(x - 1, y, z),
    sample(x, y + 1, z) - sample(x, y - 1, z),
    sample(x, y, z + 1) - sample(x, y, z - 1),
  ]

  const vertexOnEdge = (x: number, y: number, z: number, axis: number) => {
    const key = ((x - minX) + (y - minY) * Lx + (z - minZ) * Lx * Ly) * 3 + axis
    const cached = edgeVertex[key]
    if (cached >= 0) return cached

    const x2 = axis === 0 ? x + 1 : x
    const y2 = axis === 1 ? y + 1 : y
    const z2 = axis === 2 ? z + 1 : z
    const va = sample(x, y, z)
    const vb = sample(x2, y2, z2)
    const t = vb === va ? 0.5 : (isoLevel - va) / (vb - va)

    const ax = toWorld(0, x)
    const ay = toWorld(1, y)
    const az = toWorld(2, z)
    positions.push(
      ax + (toWorld(0, x2) - ax) * t,
      ay + (toWorld(1, y2) - ay) * t,
      az + (toWorld(2, z2) - az) * t,
    )

    if (gradientNormals) {
      // Density falls off outward, so the outward normal is the negative gradient.
      const ga = gradient(x, y, z)
      const gb = gradient(x2, y2, z2)
      const nx = -(ga[0] + (gb[0] - ga[0]) * t)
      const ny = -(ga[1] + (gb[1] - ga[1]) * t)
      const nz = -(ga[2] + (gb[2] - ga[2]) * t)
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
      normals.push(nx / len, ny / len, nz / len)
    }

    const index = positions.length / 3 - 1
    edgeVertex[key] = index
    return index
  }

  for (let z = minZ; z < maxZ; z++) {
    for (let y = minY; y < maxY; y++) {
      for (let x = minX; x < maxX; x++) {
        let cube = 0
        for (let c = 0; c < 8; c++) {
          const [ox, oy, oz] = CORNERS[c]
          values[c] = sample(x + ox, y + oy, z + oz)
          if (values[c] < isoLevel) cube |= 1 << c
        }
        const bits = edgeTable[cube]
        if (bits === 0) continue

        for (let e = 0; e < 12; e++) {
          if (!(bits & (1 << e))) continue
          const [ox, oy, oz, axis] = EDGES[e]
          cellEdges[e] = vertexOnEdge(x + ox, y + oy, z + oz, axis)
        }

        const base = cube << 4
        for (let i = 0; triTable[base + i] !== -1; i += 3) {
          indices.push(
            cellEdges[triTable[base + i]],
            cellEdges[triTable[base + i + 1]],
            cellEdges[triTable[base + i + 2]],
          )
        }
      }
    }
  }

  const mesh: MeshData = { positions: Float32Array.from(positions), indices: Uint32Array.from(indices) }
  if (gradientNormals) {
    mesh.normals = Float32Array.from(normals)
    orientByNormals(mesh)
  }
  return mesh
}

/**
 * The tables wind every triangle the same way, but whether that faces out depends on
 * the inside/outside convention. A closed mesh with outward faces has positive signed
 * volume, so flip all triangles if it comes out negative.
 */
function orientOutward({ positions: p, indices }: MeshData) {
  let volume = 0
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3
    const b = indices[t + 1] * 3
    const c = indices[t + 2] * 3
    volume +=
      p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) -
      p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) +
      p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])
  }
  if (volume < 0) flipAll(indices)
}

/**
 * Open pieces (chunks) have no meaningful volume, so compare the winding against the
 * gradient normals instead. The tables are consistent, so one vote decides for all.
 */
function orientByNormals({ positions: p, indices, normals: n }: MeshData) {
  if (!n) return
  let agreement = 0
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3
    const b = indices[t + 1] * 3
    const c = indices[t + 2] * 3
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2]
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2]
    const fx = uy * vz - uz * vy
    const fy = uz * vx - ux * vz
    const fz = ux * vy - uy * vx
    agreement += fx * (n[a] + n[b] + n[c]) + fy * (n[a + 1] + n[b + 1] + n[c + 1]) + fz * (n[a + 2] + n[b + 2] + n[c + 2])
  }
  if (agreement < 0) flipAll(indices)
}

function flipAll(indices: Uint32Array) {
  for (let t = 0; t < indices.length; t += 3) {
    const swap = indices[t + 1]
    indices[t + 1] = indices[t + 2]
    indices[t + 2] = swap
  }
}
