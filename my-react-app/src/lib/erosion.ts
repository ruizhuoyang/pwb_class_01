// ─────────────────────────────────────────────────────────
// Hydraulic erosion simulation — particle-based
//
// Drops virtual raindrops on a heightmap. Each droplet
// rolls downhill, picks up sediment from steep slopes,
// and deposits it where the terrain flattens or the
// droplet slows down. Over many iterations the terrain
// develops realistic-looking river valleys and ridges.
// ─────────────────────────────────────────────────────────

export type ErosionParams = {
  /** Map resolution (width = height). */
  mapSize: number
  /** Droplets simulated per step. */
  dropletsPerStep: number
  /** Max lifetime of each droplet (iterations). */
  maxLifetime: number
  /** How much sediment a drop can carry per unit speed. */
  sedimentCapacity: number
  /** Fraction of capacity gap deposited per step. */
  depositRate: number
  /** Fraction of capacity gap eroded per step. */
  erodeRate: number
  /** Speed lost per step (friction). */
  friction: number
  /** Evaporation of water per step. */
  evaporationRate: number
  /** Scale factor for gravity → speed. */
  gravity: number
  /** Radius of erosion brush (pixels). */
  brushRadius: number
  /** Initial water volume of each droplet. */
  initialWater: number
  /** Minimum speed to keep the drop alive. */
  minSpeed: number
}

export const DEFAULT_EROSION_PARAMS: ErosionParams = {
  mapSize: 256,
  dropletsPerStep: 200,
  maxLifetime: 64,
  sedimentCapacity: 6,
  depositRate: 0.25,
  erodeRate: 0.35,
  friction: 0.06,
  evaporationRate: 0.01,
  gravity: 6,
  brushRadius: 3,
  initialWater: 1,
  minSpeed: 0.01,
}

export type ErosionState = {
  /** The heightmap being eroded (0..1 values, mapSize × mapSize). */
  heightmap: Float32Array
  /** Total droplets simulated so far. */
  totalDroplets: number
  /** Total simulation steps taken. */
  steps: number
}

/** Create a fresh erosion state from an initial heightmap. */
export function createErosionState(
  sourceHeightmap: Float32Array,
): ErosionState {
  return {
    heightmap: new Float32Array(sourceHeightmap),
    totalDroplets: 0,
    steps: 0,
  }
}

/**
 * Run one simulation step (N droplets) and mutate the state in-place.
 * Returns the same state object for convenience.
 */
export function stepErosion(
  state: ErosionState,
  params: ErosionParams,
): ErosionState {
  const { mapSize } = params
  const map = state.heightmap

  const brushWeights = buildBrush(params.brushRadius)

  for (let drop = 0; drop < params.dropletsPerStep; drop++) {
    let posX = Math.random() * (mapSize - 2) + 1
    let posY = Math.random() * (mapSize - 2) + 1
    let dirX = 0
    let dirY = 0
    let speed = 1
    let water = params.initialWater
    let sediment = 0

    for (let life = 0; life < params.maxLifetime; life++) {
      const cellX = Math.floor(posX)
      const cellY = Math.floor(posY)
      const offX = posX - cellX
      const offY = posY - cellY

      // Bilinear gradient
      const grad = gradient(map, mapSize, cellX, cellY, offX, offY)
      const height = bilinear(map, mapSize, cellX, cellY, offX, offY)

      // Update direction with inertia
      dirX = dirX * (1 - params.friction) - grad.gx
      dirY = dirY * (1 - params.friction) - grad.gy
      const dirLen = Math.sqrt(dirX * dirX + dirY * dirY)
      if (dirLen > 0) { dirX /= dirLen; dirY /= dirLen }

      // Move
      const newX = posX + dirX
      const newY = posY + dirY

      // Out of bounds → stop
      if (
        newX < 1 || newX >= mapSize - 2 ||
        newY < 1 || newY >= mapSize - 2
      ) break

      const newHeight = bilinear(
        map, mapSize,
        Math.floor(newX), Math.floor(newY),
        newX - Math.floor(newX), newY - Math.floor(newY),
      )
      const heightDiff = newHeight - height

      // Sediment capacity based on slope, speed, water
      const cap = Math.max(
        -heightDiff * speed * water * params.sedimentCapacity,
        0.001,
      )

      if (sediment > cap || heightDiff > 0) {
        // Deposit
        const depositAmount = heightDiff > 0
          ? Math.min(sediment, heightDiff)
          : (sediment - cap) * params.depositRate
        sediment -= depositAmount
        depositAt(map, mapSize, cellX, cellY, offX, offY, depositAmount)
      } else {
        // Erode
        const erodeAmount = Math.min(
          (cap - sediment) * params.erodeRate,
          -heightDiff,
        )
        erodeBrush(map, mapSize, posX, posY, erodeAmount, params.brushRadius, brushWeights)
        sediment += erodeAmount
      }

      // Update speed
      speed = Math.sqrt(Math.max(0, speed * speed + heightDiff * params.gravity))
      if (speed < params.minSpeed) break

      // Evaporate
      water *= (1 - params.evaporationRate)
      if (water < 0.001) break

      posX = newX
      posY = newY
    }

    state.totalDroplets++
  }

  state.steps++
  return state
}

// ── Internal helpers ──

function bilinear(
  map: Float32Array,
  size: number,
  cx: number,
  cy: number,
  u: number,
  v: number,
): number {
  const idx = (r: number, c: number) => Math.min(size - 1, Math.max(0, r)) * size + Math.min(size - 1, Math.max(0, c))
  const h00 = map[idx(cy, cx)]
  const h10 = map[idx(cy, cx + 1)]
  const h01 = map[idx(cy + 1, cx)]
  const h11 = map[idx(cy + 1, cx + 1)]
  return h00 * (1 - u) * (1 - v) + h10 * u * (1 - v) + h01 * (1 - u) * v + h11 * u * v
}

function gradient(
  map: Float32Array,
  size: number,
  cx: number,
  cy: number,
  u: number,
  v: number,
): { gx: number; gy: number } {
  const idx = (r: number, c: number) => Math.min(size - 1, Math.max(0, r)) * size + Math.min(size - 1, Math.max(0, c))
  const h00 = map[idx(cy, cx)]
  const h10 = map[idx(cy, cx + 1)]
  const h01 = map[idx(cy + 1, cx)]
  const h11 = map[idx(cy + 1, cx + 1)]
  const gx = (h10 - h00) * (1 - v) + (h11 - h01) * v
  const gy = (h01 - h00) * (1 - u) + (h11 - h10) * u
  return { gx, gy }
}

function depositAt(
  map: Float32Array,
  size: number,
  cx: number,
  cy: number,
  u: number,
  v: number,
  amount: number,
) {
  const idx = (r: number, c: number) => {
    const rr = Math.min(size - 1, Math.max(0, r))
    const cc = Math.min(size - 1, Math.max(0, c))
    return rr * size + cc
  }
  map[idx(cy, cx)] += amount * (1 - u) * (1 - v)
  map[idx(cy, cx + 1)] += amount * u * (1 - v)
  map[idx(cy + 1, cx)] += amount * (1 - u) * v
  map[idx(cy + 1, cx + 1)] += amount * u * v
}

function buildBrush(radius: number): Float32Array {
  const size = radius * 2 + 1
  const weights = new Float32Array(size * size)
  let total = 0
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist <= radius) {
        const w = Math.max(0, 1 - dist / radius)
        weights[(dy + radius) * size + (dx + radius)] = w
        total += w
      }
    }
  }
  if (total > 0) {
    for (let i = 0; i < weights.length; i++) weights[i] /= total
  }
  return weights
}

function erodeBrush(
  map: Float32Array,
  mapSize: number,
  px: number,
  py: number,
  amount: number,
  radius: number,
  weights: Float32Array,
) {
  const cx = Math.floor(px)
  const cy = Math.floor(py)
  const brushSize = radius * 2 + 1

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const mx = cx + dx
      const my = cy + dy
      if (mx < 0 || mx >= mapSize || my < 0 || my >= mapSize) continue
      const w = weights[(dy + radius) * brushSize + (dx + radius)]
      if (w <= 0) continue
      const idx = my * mapSize + mx
      map[idx] = Math.max(0, map[idx] - amount * w)
    }
  }
}
