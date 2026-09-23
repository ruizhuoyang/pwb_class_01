// ─────────────────────────────────────────────────────────
// Chunking — split the density field into independent 3D blocks
//
// The world is resolution³ samples = (resolution - 1)³ cells. Chunks
// partition the *cells*: chunk (cx, cy, cz) owns cells
// [c·S, c·S + S) per axis (the last chunk may be smaller). Its samples
// therefore run c·S … c·S + S inclusive, so neighbours share one plane
// of samples — every shared edge interpolates the same two values and
// the meshes meet without cracks.
//
// Each chunk also stores a one-sample apron beyond its cells, needed
// only for the central differences of gradient normals, so both sides
// of a seam compute identical normals. Samples outside the world are
// never evaluated; the sampler reports them as empty, which caps the
// surface at the world border.
// ─────────────────────────────────────────────────────────

import type { DensityFn, Vec3 } from './densityGrid'
import { marchRegion, OUTSIDE_OFFSET, type MeshData } from './marchingCubes'

type Int3 = [number, number, number]

const APRON = 1

export const CHUNK_SIZES = [8, 16, 32]
export const DEFAULT_CHUNK_SIZE = 16

export type ChunkLayout = {
  /** World samples per axis. */
  resolution: number
  /** World edge length. */
  extent: number
  /** Cells per chunk edge. */
  chunkSize: number
  /** Chunks per axis (the world is a cube). */
  chunksPerAxis: number
}

/** A chunk's own density samples (iso-independent). */
export type ChunkDensity = {
  key: string
  coord: Int3
  /** Global sample index of the chunk's first sample, per axis. */
  origin: Int3
  /** Cells owned by this chunk, per axis. */
  cells: Int3
  /** Stored block size per axis: cells + 1 + 2·APRON. */
  dims: Int3
  data: Float32Array
}

export type ChunkMesh = {
  key: string
  coord: Int3
  bounds: { min: Vec3; max: Vec3 }
  mesh: MeshData
}

export function createChunkLayout(resolution: number, extent: number, chunkSize: number): ChunkLayout {
  return { resolution, extent, chunkSize, chunksPerAxis: Math.ceil((resolution - 1) / chunkSize) }
}

export function chunkCount(layout: ChunkLayout): number {
  return layout.chunksPerAxis ** 3
}

/** Same formula as gridToWorld, so chunk vertices land exactly where the unchunked mesh puts them. */
function sampleToWorld(layout: ChunkLayout, i: number): number {
  return -layout.extent / 2 + i * (layout.extent / (layout.resolution - 1))
}

export function chunkKey([cx, cy, cz]: Int3): string {
  return `${cx},${cy},${cz}`
}

/** Evaluates `fn` only over one chunk's samples plus its apron. */
export function buildChunkDensity(layout: ChunkLayout, coord: Int3, fn: DensityFn): ChunkDensity {
  const { resolution: n, chunkSize: s } = layout
  const origin = coord.map((c) => c * s) as Int3
  const cells = origin.map((o) => Math.min(s, n - 1 - o)) as Int3
  const dims = cells.map((c) => c + 1 + 2 * APRON) as Int3
  const [dx, dy, dz] = dims
  const data = new Float32Array(dx * dy * dz)

  const inWorld = (g: number) => g >= 0 && g < n
  let i = 0
  for (let lz = 0; lz < dz; lz++) {
    const gz = origin[2] + lz - APRON
    const z = sampleToWorld(layout, gz)
    for (let ly = 0; ly < dy; ly++) {
      const gy = origin[1] + ly - APRON
      const y = sampleToWorld(layout, gy)
      for (let lx = 0; lx < dx; lx++, i++) {
        const gx = origin[0] + lx - APRON
        if (inWorld(gx) && inWorld(gy) && inWorld(gz)) data[i] = fn(sampleToWorld(layout, gx), y, z)
      }
    }
  }
  return { key: chunkKey(coord), coord, origin, cells, dims, data }
}

export function buildChunkDensities(layout: ChunkLayout, fn: DensityFn): ChunkDensity[] {
  const out: ChunkDensity[] = []
  const c = layout.chunksPerAxis
  for (let cz = 0; cz < c; cz++)
    for (let cy = 0; cy < c; cy++)
      for (let cx = 0; cx < c; cx++) out.push(buildChunkDensity(layout, [cx, cy, cz], fn))
  return out
}

/** Runs Marching Cubes over one chunk's cells, reading only that chunk's samples. */
export function meshChunk(layout: ChunkLayout, chunk: ChunkDensity, isoLevel: number): ChunkMesh {
  const n = layout.resolution
  const { origin, cells, dims, data } = chunk
  const [dx, dy] = dims
  const outside = isoLevel + OUTSIDE_OFFSET

  const sample = (x: number, y: number, z: number) => {
    const gx = origin[0] + x
    const gy = origin[1] + y
    const gz = origin[2] + z
    if (gx < 0 || gy < 0 || gz < 0 || gx >= n || gy >= n || gz >= n) return outside
    return data[x + APRON + (y + APRON) * dx + (z + APRON) * dx * dy]
  }

  // Only chunks on the world border march the padding cell, which caps the surface there.
  // Interior boundaries are left open and continue seamlessly in the neighbour.
  const cellMin = origin.map((o) => (o === 0 ? -1 : 0)) as Int3
  const cellMax = origin.map((o, a) => cells[a] + (o + cells[a] === n - 1 ? 1 : 0)) as Int3

  const mesh = marchRegion(
    {
      sample,
      cellMin,
      cellMax,
      toWorld: (axis, i) => sampleToWorld(layout, origin[axis] + i),
      gradientNormals: true,
    },
    isoLevel,
  )

  return {
    key: chunk.key,
    coord: chunk.coord,
    bounds: {
      min: origin.map((o) => sampleToWorld(layout, o)) as Vec3,
      max: origin.map((o, a) => sampleToWorld(layout, o + cells[a])) as Vec3,
    },
    mesh,
  }
}

export function meshChunks(layout: ChunkLayout, chunks: ChunkDensity[], isoLevel: number): ChunkMesh[] {
  return chunks.map((chunk) => meshChunk(layout, chunk, isoLevel))
}

/**
 * Regenerates a single chunk (density + mesh) and returns updated copies of both lists.
 * Nothing outside that chunk's samples is touched.
 */
export function rebuildChunk(
  layout: ChunkLayout,
  densities: ChunkDensity[],
  meshes: ChunkMesh[],
  index: number,
  fn: DensityFn,
  isoLevel: number,
): { densities: ChunkDensity[]; meshes: ChunkMesh[] } {
  const density = buildChunkDensity(layout, densities[index].coord, fn)
  const nextDensities = densities.slice()
  const nextMeshes = meshes.slice()
  nextDensities[index] = density
  nextMeshes[index] = meshChunk(layout, density, isoLevel)
  return { densities: nextDensities, meshes: nextMeshes }
}
