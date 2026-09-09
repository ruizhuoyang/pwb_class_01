import { useCallback, useState } from 'react'
import ThreeCanvas, { type SceneParams } from './components/ThreeCanvas'
import NoiseCanvas from './components/NoiseCanvas'
import NoisePreview from './components/NoisePreview'
import ErosionCanvas from './components/ErosionCanvas'
import SidePanel from './components/SidePanel'
import ViewSwitcher, { type ViewMode } from './components/ViewSwitcher'
import { createDefaultLayers, type ColorMode, type NoiseLayer } from './lib/noise'
import {
  generateHeightfield,
  generateNoiseTexture,
  heightmapToTexture,
} from './lib/generateNoiseTexture'
import {
  createErosionState,
  DEFAULT_EROSION_PARAMS,
  type ErosionParams,
  type ErosionState,
} from './lib/erosion'
import './App.css'

const DEFAULT_SCENE: SceneParams = {
  planeSegments: 64,
  displacementScale: 1.5,
  noiseFieldSize: 128,
  fog: false,
}

const SUBTITLE: Record<ViewMode, string> = {
  '3d': 'Interactive Three.js Canvas',
  '2d': 'Procedural Noise',
  sim: 'Hydraulic Erosion',
}

function App() {
  const [view, setView] = useState<ViewMode>('3d')
  const [layers, setLayers] = useState<NoiseLayer[]>(createDefaultLayers)
  const [sceneParams, setSceneParams] = useState<SceneParams>(DEFAULT_SCENE)
  const [showPreview, setShowPreview] = useState(false)

  const [colorMap, setColorMap] = useState<HTMLCanvasElement | null>(null)
  const [heightfield, setHeightfield] = useState<Float32Array | null>(null)

  // Erosion state
  const [erosionParams, setErosionParams] = useState<ErosionParams>(DEFAULT_EROSION_PARAMS)
  const [erosionState, setErosionState] = useState<ErosionState | null>(null)
  const [erosionRunning, setErosionRunning] = useState(false)
  const [erosionColorMode, setErosionColorMode] = useState<ColorMode>('terrain')

  const handleApply = useCallback(() => {
    const size = sceneParams.noiseFieldSize
    setColorMap(generateNoiseTexture(layers, size))
    setHeightfield(generateHeightfield(layers, size))
  }, [layers, sceneParams.noiseFieldSize])

  const handleClear = useCallback(() => {
    setColorMap(null)
    setHeightfield(null)
  }, [])

  // Erosion callbacks
  const handleGenerateBase = useCallback(() => {
    const size = erosionParams.mapSize
    const hf = generateHeightfield(layers, size)
    setErosionState(createErosionState(hf))
    setErosionRunning(false)
  }, [layers, erosionParams.mapSize])

  const handleStartErosion = useCallback(() => setErosionRunning(true), [])
  const handleStopErosion = useCallback(() => setErosionRunning(false), [])
  const handleResetErosion = useCallback(() => {
    setErosionRunning(false)
    setErosionState(null)
  }, [])
  const handleErosionStateUpdate = useCallback(
    (state: ErosionState) => setErosionState(state),
    [],
  )

  const handleApplyErosion = useCallback(() => {
    if (!erosionState) return
    const size = erosionParams.mapSize
    setColorMap(heightmapToTexture(erosionState.heightmap, size, erosionColorMode))
    setHeightfield(new Float32Array(erosionState.heightmap))
    setSceneParams((prev) => ({ ...prev, noiseFieldSize: size }))
  }, [erosionState, erosionParams.mapSize, erosionColorMode])

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-brand">
          <h1 className="app-title">PWB Class 01</h1>
          <p className="app-subtitle">{SUBTITLE[view]}</p>
        </div>
        <ViewSwitcher view={view} onChange={setView} />
      </header>

      <main className="app-main">
        <section
          className="canvas-section"
          aria-label={
            view === '3d'
              ? '3D viewport'
              : view === '2d'
                ? '2D noise viewport'
                : 'Erosion simulation'
          }
        >
          {view === '3d' && (
            <>
              <ThreeCanvas
                sceneParams={sceneParams}
                colorMap={colorMap}
                heightfield={heightfield}
              />
              {showPreview && (
                <NoisePreview
                  layers={layers}
                  noiseFieldSize={sceneParams.noiseFieldSize}
                  onApply={handleApply}
                  onClose={() => setShowPreview(false)}
                />
              )}
            </>
          )}
          {view === '2d' && <NoiseCanvas layers={layers} />}
          {view === 'sim' && (
            <ErosionCanvas
              erosionState={erosionState}
              erosionParams={erosionParams}
              running={erosionRunning}
              colorMode={erosionColorMode}
              onStateUpdate={handleErosionStateUpdate}
            />
          )}
        </section>
        <SidePanel
          view={view}
          layers={layers}
          onLayersChange={setLayers}
          sceneParams={sceneParams}
          onSceneParamsChange={setSceneParams}
          hasAppliedMap={colorMap !== null}
          showPreview={showPreview}
          onTogglePreview={() => setShowPreview((p) => !p)}
          onApply={handleApply}
          onClearMap={handleClear}
          erosionParams={erosionParams}
          onErosionParamsChange={setErosionParams}
          erosionState={erosionState}
          erosionRunning={erosionRunning}
          erosionColorMode={erosionColorMode}
          onErosionColorModeChange={setErosionColorMode}
          onGenerateBase={handleGenerateBase}
          onStartErosion={handleStartErosion}
          onStopErosion={handleStopErosion}
          onResetErosion={handleResetErosion}
          onApplyErosion={handleApplyErosion}
        />
      </main>
    </div>
  )
}

export default App
