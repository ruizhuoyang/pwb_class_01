import { useState } from 'react'
import ParamSlider from './ParamSlider'
import type { ViewMode } from './ViewSwitcher'
import type { SceneParams } from './ThreeCanvas'
import {
  BLEND_MODES,
  CELL_RETURNS,
  COLOR_MODES,
  DISTANCE_METRICS,
  NOISE_GROUPS,
  NOISE_TYPES,
  SHAPING_OPS,
  createLayer,
  usesCellular,
  usesFractal,
  type ColorMode,
  type NoiseLayer,
  type NoiseParams,
  type ShapingParams,
} from '../lib/noise'
import type { ErosionParams, ErosionState } from '../lib/erosion'
import './SidePanel.css'

export type SubTab = 'noise' | 'simulation'

type SidePanelProps = {
  view: ViewMode
  subTab: SubTab
  onSubTabChange: (tab: SubTab) => void
  layers: NoiseLayer[]
  onLayersChange: (layers: NoiseLayer[]) => void
  sceneParams: SceneParams
  onSceneParamsChange: (params: SceneParams) => void
  hasAppliedMap: boolean
  appliedSource: 'noise' | 'erosion' | null
  onTogglePreview: () => void
  showPreview: boolean
  onApply: () => void
  onClearMap: () => void
  // Simulation props
  erosionParams: ErosionParams
  onErosionParamsChange: (params: ErosionParams) => void
  erosionState: ErosionState | null
  erosionRunning: boolean
  erosionColorMode: ColorMode
  onErosionColorModeChange: (mode: ColorMode) => void
  onGenerateBase: () => void
  onStartErosion: () => void
  onStopErosion: () => void
  onResetErosion: () => void
  onApplyErosion: () => void
}

export default function SidePanel({
  view,
  subTab,
  onSubTabChange,
  layers,
  onLayersChange,
  sceneParams,
  onSceneParamsChange,
  hasAppliedMap,
  appliedSource,
  onTogglePreview,
  showPreview,
  onApply,
  onClearMap,
  erosionParams,
  onErosionParamsChange,
  erosionState,
  erosionRunning,
  erosionColorMode,
  onErosionColorModeChange,
  onGenerateBase,
  onStartErosion,
  onStopErosion,
  onResetErosion,
  onApplyErosion,
}: SidePanelProps) {
  const [expandedLayer, setExpandedLayer] = useState<string | null>(
    layers[0]?.id ?? null,
  )

  const updateScene = <Key extends keyof SceneParams>(
    key: Key,
    value: SceneParams[Key],
  ) => onSceneParamsChange({ ...sceneParams, [key]: value })

  const updateErosion = <Key extends keyof ErosionParams>(
    key: Key,
    value: ErosionParams[Key],
  ) => onErosionParamsChange({ ...erosionParams, [key]: value })

  const updateLayer = (id: string, patch: Partial<NoiseLayer>) => {
    onLayersChange(
      layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    )
  }

  const updateLayerParams = (id: string, patch: Partial<NoiseParams>) => {
    onLayersChange(
      layers.map((l) =>
        l.id === id ? { ...l, params: { ...l.params, ...patch } } : l,
      ),
    )
  }

  const updateLayerShaping = (id: string, patch: Partial<ShapingParams>) => {
    onLayersChange(
      layers.map((l) =>
        l.id === id ? { ...l, shaping: { ...l.shaping, ...patch } } : l,
      ),
    )
  }

  const addLayer = () => {
    const layer = createLayer({
      name: `Layer ${layers.length + 1}`,
      blendMode: 'add',
      opacity: 0.5,
      params: {
        ...layers[0].params,
        type: 'worley',
        seed: Math.floor(Math.random() * 100000),
      },
    })
    onLayersChange([...layers, layer])
    setExpandedLayer(layer.id)
  }

  const removeLayer = (id: string) => {
    if (layers.length <= 1) return
    const next = layers.filter((l) => l.id !== id)
    onLayersChange(next)
    if (expandedLayer === id) setExpandedLayer(next[0]?.id ?? null)
  }

  const moveLayer = (id: string, dir: -1 | 1) => {
    const idx = layers.findIndex((l) => l.id === id)
    const target = idx + dir
    if (target < 0 || target >= layers.length) return
    const copy = [...layers]
    const tmp = copy[idx]
    copy[idx] = copy[target]
    copy[target] = tmp
    onLayersChange(copy)
  }

  // ═══════════════════════════════════════
  // ── 3D view panel ──
  // ═══════════════════════════════════════
  if (view === '3d') {
    return (
      <aside className="side-panel" aria-label="Scene controls">
        <h2 className="side-panel__title">Plane</h2>

        {/* Status message */}
        {erosionState && !hasAppliedMap && (
          <p className="side-panel__hint">
            Simulation map ready — Apply uses eroded heightmap.
          </p>
        )}
        {hasAppliedMap && (
          <p className="side-panel__hint">
            Map applied ({appliedSource === 'erosion' ? 'simulation' : 'noise'}).
          </p>
        )}

        <ParamSlider
          id="plane-segments"
          label="Plane Res"
          value={sceneParams.planeSegments}
          min={4}
          max={1024}
          step={4}
          onChange={(v) => updateScene('planeSegments', v)}
        />

        <ParamSlider
          id="noise-field-size"
          label="Noise Res"
          value={sceneParams.noiseFieldSize}
          min={32}
          max={1024}
          step={32}
          format={(v) => `${v}²`}
          onChange={(v) => updateScene('noiseFieldSize', v)}
        />

        <ParamSlider
          id="displacement-scale"
          label="Displace"
          value={sceneParams.displacementScale}
          min={0}
          max={6}
          step={0.1}
          format={(v) => v.toFixed(2)}
          onChange={(v) => updateScene('displacementScale', v)}
        />

        <div className="side-panel__field">
          <div className="side-panel__row">
            <span className="side-panel__label">Fog</span>
            <label className="side-panel__toggle">
              <input
                type="checkbox"
                checked={sceneParams.fog}
                onChange={(e) => updateScene('fog', e.target.checked)}
              />
              <span className="side-panel__toggle-track" />
            </label>
          </div>
        </div>

        <div className="side-panel__field side-panel__row">
          <button type="button" className="side-panel__button" style={{ flex: 1 }} onClick={onTogglePreview}>
            {showPreview ? 'Hide Map' : 'Show Map'}
          </button>
          {erosionState ? (
            <button type="button" className="side-panel__button side-panel__button--accent" style={{ flex: 1 }} onClick={onApplyErosion}>
              Apply Sim
            </button>
          ) : (
            <button type="button" className="side-panel__button side-panel__button--accent" style={{ flex: 1 }} onClick={onApply}>
              Apply Noise
            </button>
          )}
        </div>

        {hasAppliedMap && (
          <div className="side-panel__field">
            <button type="button" className="side-panel__button" onClick={onClearMap}>
              Clear Map
            </button>
          </div>
        )}
      </aside>
    )
  }

  // ═══════════════════════════════════════
  // ── 2D view panel with sub-tabs ──
  // ═══════════════════════════════════════
  return (
    <aside className="side-panel" aria-label="2D controls">
      {/* ── Sub-tab switcher ── */}
      <nav className="sub-tabs" aria-label="2D sub-view">
        <button
          type="button"
          className={`sub-tabs__button ${subTab === 'noise' ? 'sub-tabs__button--active' : ''}`}
          onClick={() => onSubTabChange('noise')}
        >
          Noise
        </button>
        <button
          type="button"
          className={`sub-tabs__button ${subTab === 'simulation' ? 'sub-tabs__button--active' : ''}`}
          onClick={() => onSubTabChange('simulation')}
        >
          Simulation
        </button>
      </nav>

      {/* ───────────────────────────────── */}
      {/* ── Noise sub-tab ──               */}
      {/* ───────────────────────────────── */}
      {subTab === 'noise' && (
        <>
          <h2 className="side-panel__title">Noise</h2>

          {/* ── Layer list ── */}
          <div className="layer-list">
            {layers.map((layer, idx) => {
              const isExpanded = expandedLayer === layer.id
              const fractal = usesFractal(layer.params.type)
              const cellular = usesCellular(layer.params.type)
              const isDomainWarp = layer.params.type === 'domainWarp'
              const info = NOISE_TYPES.find((t) => t.value === layer.params.type)
              const shapingInfo = SHAPING_OPS.find((s) => s.value === layer.shaping.op)

              return (
                <div
                  key={layer.id}
                  className={`layer-card ${isExpanded ? 'layer-card--expanded' : ''}`}
                >
                  {/* Header */}
                  <div className="layer-card__header">
                    <label className="side-panel__toggle layer-card__vis">
                      <input
                        type="checkbox"
                        checked={layer.visible}
                        onChange={(e) => updateLayer(layer.id, { visible: e.target.checked })}
                      />
                      <span className="side-panel__toggle-track" />
                    </label>

                    <button
                      type="button"
                      className="layer-card__name"
                      onClick={() => setExpandedLayer(isExpanded ? null : layer.id)}
                    >
                      {layer.name}
                    </button>

                    <span className="layer-card__type">{layer.params.type}</span>

                    <div className="layer-card__actions">
                      <button type="button" title="Move up" disabled={idx === 0} onClick={() => moveLayer(layer.id, -1)}>↑</button>
                      <button type="button" title="Move down" disabled={idx === layers.length - 1} onClick={() => moveLayer(layer.id, 1)}>↓</button>
                      <button type="button" title="Remove" disabled={layers.length <= 1} onClick={() => removeLayer(layer.id)}>×</button>
                    </div>
                  </div>

                  {/* Expanded body */}
                  {isExpanded && (
                    <div className="layer-card__body">
                      {idx > 0 && (
                        <>
                          <div className="side-panel__section">Blend</div>
                          <div className="side-panel__field">
                            <label className="side-panel__label" htmlFor={`blend-${layer.id}`}>Mode</label>
                            <select id={`blend-${layer.id}`} className="side-panel__select" value={layer.blendMode} onChange={(e) => updateLayer(layer.id, { blendMode: e.target.value as NoiseLayer['blendMode'] })}>
                              {BLEND_MODES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                            </select>
                          </div>
                          <ParamSlider id={`opacity-${layer.id}`} label="Opacity" value={layer.opacity} min={0} max={1} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => updateLayer(layer.id, { opacity: v })} />
                        </>
                      )}

                      <div className="side-panel__section">Type</div>
                      <div className="side-panel__field">
                        <label className="side-panel__label" htmlFor={`type-${layer.id}`}>Algorithm</label>
                        <select id={`type-${layer.id}`} className="side-panel__select" value={layer.params.type} onChange={(e) => updateLayerParams(layer.id, { type: e.target.value as NoiseParams['type'] })}>
                          {NOISE_GROUPS.map((g) => (
                            <optgroup key={g} label={g}>
                              {NOISE_TYPES.filter((t) => t.group === g).map((t) => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </div>
                      {info && <p className="side-panel__hint">{info.description}</p>}

                      <div className="side-panel__section">Shape</div>
                      <ParamSlider id={`scale-${layer.id}`} label="Scale" value={layer.params.scale} min={0.5} max={60} step={0.5} format={(v) => v.toFixed(1)} onChange={(v) => updateLayerParams(layer.id, { scale: v })} />
                      <ParamSlider id={`power-${layer.id}`} label="Power" value={layer.params.power} min={0.2} max={5} step={0.1} format={(v) => v.toFixed(1)} onChange={(v) => updateLayerParams(layer.id, { power: v })} />
                      <div className="side-panel__field">
                        <div className="side-panel__row">
                          <span className="side-panel__label">Invert</span>
                          <label className="side-panel__toggle">
                            <input type="checkbox" checked={layer.params.invert} onChange={(e) => updateLayerParams(layer.id, { invert: e.target.checked })} />
                            <span className="side-panel__toggle-track" />
                          </label>
                        </div>
                      </div>

                      <div className="side-panel__section">Shaping</div>
                      <div className="side-panel__field">
                        <label className="side-panel__label" htmlFor={`shaping-${layer.id}`}>Operation</label>
                        <select id={`shaping-${layer.id}`} className="side-panel__select" value={layer.shaping.op} onChange={(e) => updateLayerShaping(layer.id, { op: e.target.value as ShapingParams['op'] })}>
                          {SHAPING_OPS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </div>
                      {shapingInfo && layer.shaping.op !== 'none' && (
                        <p className="side-panel__hint">{shapingInfo.description}</p>
                      )}
                      {layer.shaping.op === 'power' && (
                        <ParamSlider id={`shp-pow-${layer.id}`} label="Exponent" value={layer.shaping.power} min={0.1} max={6} step={0.1} format={(v) => v.toFixed(1)} onChange={(v) => updateLayerShaping(layer.id, { power: v })} />
                      )}
                      {layer.shaping.op === 'smoothstep' && (
                        <>
                          <ParamSlider id={`shp-ssmin-${layer.id}`} label="Edge Min" value={layer.shaping.smoothstepMin} min={0} max={0.9} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => updateLayerShaping(layer.id, { smoothstepMin: v })} />
                          <ParamSlider id={`shp-ssmax-${layer.id}`} label="Edge Max" value={layer.shaping.smoothstepMax} min={0.1} max={1} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => updateLayerShaping(layer.id, { smoothstepMax: v })} />
                        </>
                      )}
                      {layer.shaping.op === 'terrace' && (
                        <ParamSlider id={`shp-ter-${layer.id}`} label="Steps" value={layer.shaping.terraceSteps} min={2} max={20} onChange={(v) => updateLayerShaping(layer.id, { terraceSteps: v })} />
                      )}
                      {layer.shaping.op === 'clamp' && (
                        <>
                          <ParamSlider id={`shp-clmin-${layer.id}`} label="Clamp Min" value={layer.shaping.clampMin} min={0} max={0.9} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => updateLayerShaping(layer.id, { clampMin: v })} />
                          <ParamSlider id={`shp-clmax-${layer.id}`} label="Clamp Max" value={layer.shaping.clampMax} min={0.1} max={1} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => updateLayerShaping(layer.id, { clampMax: v })} />
                        </>
                      )}
                      {layer.shaping.op === 'quantize' && (
                        <ParamSlider id={`shp-qnt-${layer.id}`} label="Levels" value={layer.shaping.quantizeLevels} min={2} max={16} onChange={(v) => updateLayerShaping(layer.id, { quantizeLevels: v })} />
                      )}

                      {fractal && (
                        <>
                          <div className="side-panel__section">Fractal</div>
                          <ParamSlider id={`oct-${layer.id}`} label="Octaves" value={layer.params.octaves} min={1} max={10} onChange={(v) => updateLayerParams(layer.id, { octaves: v })} />
                          <ParamSlider id={`per-${layer.id}`} label="Persistence" value={layer.params.persistence} min={0.05} max={0.95} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => updateLayerParams(layer.id, { persistence: v })} />
                          <ParamSlider id={`lac-${layer.id}`} label="Lacunarity" value={layer.params.lacunarity} min={1.2} max={4} step={0.1} format={(v) => v.toFixed(1)} onChange={(v) => updateLayerParams(layer.id, { lacunarity: v })} />
                        </>
                      )}

                      {isDomainWarp && (
                        <>
                          <div className="side-panel__section">Warp</div>
                          <ParamSlider id={`warp-${layer.id}`} label="Warp Strength" value={layer.params.warpStrength} min={0} max={12} step={0.2} format={(v) => v.toFixed(1)} onChange={(v) => updateLayerParams(layer.id, { warpStrength: v })} />
                        </>
                      )}

                      {cellular && (
                        <>
                          <div className="side-panel__section">Cellular</div>
                          <div className="side-panel__field">
                            <label className="side-panel__label" htmlFor={`dist-${layer.id}`}>Distance</label>
                            <select id={`dist-${layer.id}`} className="side-panel__select" value={layer.params.distanceMetric} onChange={(e) => updateLayerParams(layer.id, { distanceMetric: e.target.value as NoiseParams['distanceMetric'] })}>
                              {DISTANCE_METRICS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          </div>
                          {layer.params.type === 'worley' && (
                            <div className="side-panel__field">
                              <label className="side-panel__label" htmlFor={`cell-${layer.id}`}>Return</label>
                              <select id={`cell-${layer.id}`} className="side-panel__select" value={layer.params.cellReturn} onChange={(e) => updateLayerParams(layer.id, { cellReturn: e.target.value as NoiseParams['cellReturn'] })}>
                                {CELL_RETURNS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </select>
                            </div>
                          )}
                        </>
                      )}

                      <div className="side-panel__section">Seed</div>
                      <div className="side-panel__field">
                        <div className="side-panel__row">
                          <span className="side-panel__label">Value</span>
                          <span className="side-panel__value">{layer.params.seed}</span>
                        </div>
                        <button type="button" className="side-panel__button" onClick={() => updateLayerParams(layer.id, { seed: Math.floor(Math.random() * 100000) })}>
                          Randomize
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="side-panel__field">
            <button type="button" className="side-panel__button side-panel__button--accent" onClick={addLayer}>
              + Add Layer
            </button>
          </div>

          {/* Global output */}
          <div className="side-panel__section">Output</div>

          <div className="side-panel__field">
            <label className="side-panel__label" htmlFor="noise-color">Color</label>
            <select
              id="noise-color"
              className="side-panel__select"
              value={layers[0]?.params.colorMode ?? 'grayscale'}
              onChange={(e) => {
                const mode = e.target.value as NoiseParams['colorMode']
                onLayersChange(layers.map((l) => ({ ...l, params: { ...l.params, colorMode: mode } })))
              }}
            >
              {COLOR_MODES.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <ParamSlider
            id="noise-resolution"
            label="Resolution"
            value={layers[0]?.params.resolution ?? 512}
            min={64}
            max={1024}
            step={64}
            format={(v) => `${v}px`}
            onChange={(v) => onLayersChange(layers.map((l) => ({ ...l, params: { ...l.params, resolution: v } })))}
          />
        </>
      )}

      {/* ───────────────────────────────── */}
      {/* ── Simulation sub-tab ──          */}
      {/* ───────────────────────────────── */}
      {subTab === 'simulation' && (
        <>
          <h2 className="side-panel__title">Hydraulic Erosion</h2>

          <p className="side-panel__hint">
            Runs droplet erosion over the current noise heightmap. Progress is kept when you switch views.
          </p>

          {/* Control buttons */}
          <div className="side-panel__field side-panel__row">
            {!erosionRunning ? (
              <button
                type="button"
                className="side-panel__button side-panel__button--accent"
                style={{ flex: 1 }}
                onClick={erosionState ? onStartErosion : onGenerateBase}
              >
                {erosionState ? '▶ Start' : 'Generate'}
              </button>
            ) : (
              <button
                type="button"
                className="side-panel__button side-panel__button--accent"
                style={{ flex: 1 }}
                onClick={onStopErosion}
              >
                ■ Stop
              </button>
            )}
            <button
              type="button"
              className="side-panel__button"
              style={{ flex: 1 }}
              onClick={onResetErosion}
              disabled={erosionRunning}
            >
              Reset
            </button>
          </div>

          <div className="side-panel__field">
            <button
              type="button"
              className="side-panel__button side-panel__button--accent"
              onClick={onApplyErosion}
              disabled={!erosionState}
            >
              Apply to Plane
            </button>
          </div>

          {/* Stats */}
          {erosionState && (
            <div className="side-panel__field">
              <div className="side-panel__row">
                <span className="side-panel__label">Drops</span>
                <span className="side-panel__value">
                  {erosionState.totalDroplets.toLocaleString()}
                </span>
                <span className="side-panel__value">
                  {erosionParams.mapSize}²
                </span>
                <span className="side-panel__value" style={{ color: erosionRunning ? 'var(--accent)' : 'var(--text-muted)' }}>
                  {erosionRunning ? 'running' : 'paused'}
                </span>
              </div>
            </div>
          )}

          {/* Droplet params */}
          <ParamSlider id="ero-droplets" label="Drops / Frame" value={erosionParams.dropletsPerStep} min={50} max={2000} step={50} onChange={(v) => updateErosion('dropletsPerStep', v)} />
          <ParamSlider id="ero-lifetime" label="Lifetime" value={erosionParams.maxLifetime} min={8} max={128} step={4} onChange={(v) => updateErosion('maxLifetime', v)} />

          {/* Erosion params */}
          <ParamSlider id="ero-friction" label="Inertia" value={1 - erosionParams.friction} min={0.7} max={1} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => updateErosion('friction', 1 - v)} />
          <ParamSlider id="ero-capacity" label="Capacity" value={erosionParams.sedimentCapacity} min={0.5} max={20} step={0.5} format={(v) => v.toFixed(1)} onChange={(v) => updateErosion('sedimentCapacity', v)} />
          <ParamSlider id="ero-minspeed" label="Min Slope" value={erosionParams.minSpeed} min={0.001} max={0.1} step={0.001} format={(v) => v.toFixed(3)} onChange={(v) => updateErosion('minSpeed', v)} />
          <ParamSlider id="ero-deposit" label="Deposition" value={erosionParams.depositRate} min={0.01} max={1} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => updateErosion('depositRate', v)} />
          <ParamSlider id="ero-erode" label="Erosion" value={erosionParams.erodeRate} min={0.01} max={1} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => updateErosion('erodeRate', v)} />
          <ParamSlider id="ero-evaporation" label="Evaporation" value={erosionParams.evaporationRate} min={0} max={0.1} step={0.005} format={(v) => v.toFixed(3)} onChange={(v) => updateErosion('evaporationRate', v)} />
          <ParamSlider id="ero-gravity" label="Gravity" value={erosionParams.gravity} min={1} max={20} step={0.5} format={(v) => v.toFixed(1)} onChange={(v) => updateErosion('gravity', v)} />
          <ParamSlider id="ero-water" label="Water" value={erosionParams.initialWater} min={0.1} max={3} step={0.1} format={(v) => v.toFixed(1)} onChange={(v) => updateErosion('initialWater', v)} />
          <ParamSlider id="ero-brush" label="Brush Radius" value={erosionParams.brushRadius} min={1} max={8} step={1} onChange={(v) => updateErosion('brushRadius', v)} />

          {/* Map size */}
          <div className="side-panel__section">Map</div>
          <ParamSlider id="ero-mapsize" label="Map Size" value={erosionParams.mapSize} min={64} max={1024} step={64} format={(v) => `${v}px`} onChange={(v) => updateErosion('mapSize', v)} />

          {/* Display */}
          <div className="side-panel__section">Display</div>
          <div className="side-panel__field">
            <label className="side-panel__label" htmlFor="ero-color">Color</label>
            <select id="ero-color" className="side-panel__select" value={erosionColorMode} onChange={(e) => onErosionColorModeChange(e.target.value as ColorMode)}>
              {COLOR_MODES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </>
      )}
    </aside>
  )
}
