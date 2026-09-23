import { createLayer, DEFAULT_NOISE_PARAMS, DEFAULT_SHAPING, type NoiseLayer } from './noise'

/**
 * Calibrated for the 10×10 plane at 256 segments / 256² heightmap:
 * broad fBm landmass with flattened lowlands (power shaping), plus ridged
 * detail overlaid so peaks get crests while valleys stay smooth.
 */
export function createCalibratedLayers(): NoiseLayer[] {
  return [
    createLayer({
      name: 'Landmass',
      blendMode: 'add',
      params: {
        ...DEFAULT_NOISE_PARAMS,
        type: 'fbm',
        scale: 2.5,
        octaves: 6,
        persistence: 0.5,
        lacunarity: 2,
        colorMode: 'terrain',
      },
      shaping: { ...DEFAULT_SHAPING, op: 'power', power: 1.3 },
    }),
    createLayer({
      name: 'Ridges',
      blendMode: 'overlay',
      opacity: 0.4,
      params: {
        ...DEFAULT_NOISE_PARAMS,
        type: 'ridged',
        scale: 4,
        octaves: 5,
        persistence: 0.5,
        lacunarity: 2.1,
        seed: 7919,
        colorMode: 'terrain',
      },
    }),
  ]
}
