import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { DAY_CYCLE_HOURS_PER_SECOND, type EnvironmentParams } from '../lib/environment'
import { createEnvironmentScene } from '../lib/environmentScene'
import './ThreeCanvas.css'

/** How often the playing day cycle reports its time back to the UI. */
const TIME_REPORT_MS = 200

export type SceneParams = {
  planeSegments: number
  displacementScale: number
  noiseFieldSize: number
  fog: boolean
}

export type ViewportParams = {
  solid: boolean
  wireframe: boolean
  axes: boolean
  grid: boolean
}

export type CameraView = {
  position: [number, number, number]
  target: [number, number, number]
}

export type ThreeCanvasHandle = {
  resetView: () => void
  getView: () => CameraView | null
  setView: (view: CameraView) => void
}

const HOME_VIEW: CameraView = { position: [0, 6, 8], target: [0, 0, 0] }

type ThreeCanvasProps = {
  sceneParams: SceneParams
  viewport: ViewportParams
  /** Offscreen canvas painted with the color noise map. */
  colorMap: HTMLCanvasElement | null
  /** Raw 0..1 square heightfield; its size is derived from the array length. */
  heightfield: Float32Array | null
  environment: EnvironmentParams
  /** Called (throttled) while the day cycle advances the time. */
  onTimeOfDayChange: (hours: number) => void
  ref?: Ref<ThreeCanvasHandle>
}

export default function ThreeCanvas({
  sceneParams,
  viewport,
  colorMap,
  heightfield,
  environment,
  onTimeOfDayChange,
  ref,
}: ThreeCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const viewportRef = useRef(viewport)

  useEffect(() => {
    viewportRef.current = viewport
  }, [viewport])

  useImperativeHandle(ref, () => {
    const applyView = (view: CameraView) => {
      const camera = cameraRef.current
      const controls = controlsRef.current
      if (!camera || !controls) return
      camera.position.set(...view.position)
      controls.target.set(...view.target)
      controls.update()
    }
    return {
      resetView: () => applyView(HOME_VIEW),
      setView: applyView,
      getView: () => {
        const camera = cameraRef.current
        const controls = controlsRef.current
        if (!camera || !controls) return null
        return {
          position: camera.position.toArray() as CameraView['position'],
          target: controls.target.toArray() as CameraView['target'],
        }
      },
    }
  }, [])

  // Keep mutable refs so the render loop can read latest values
  // without re-mounting the entire Three.js scene.
  const sceneRef = useRef(sceneParams)
  const colorMapRef = useRef(colorMap)
  const heightfieldRef = useRef(heightfield)

  // Track versions to detect changes inside the animation loop.
  const segmentsRef = useRef(sceneParams.planeSegments)
  const dispScaleRef = useRef(sceneParams.displacementScale)
  const fogEnabledRef = useRef(sceneParams.fog)
  const mapVersionRef = useRef(0)

  // Sync refs in effects (not during render) to satisfy lint rules.
  useEffect(() => {
    sceneRef.current = sceneParams
  }, [sceneParams])

  useEffect(() => {
    colorMapRef.current = colorMap
  }, [colorMap])

  useEffect(() => {
    heightfieldRef.current = heightfield
  }, [heightfield])

  const environmentRef = useRef(environment)
  const onTimeRef = useRef(onTimeOfDayChange)
  useEffect(() => {
    environmentRef.current = environment
  }, [environment])
  useEffect(() => {
    onTimeRef.current = onTimeOfDayChange
  }, [onTimeOfDayChange])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // ── Renderer / scene / camera ──
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a0b0d)

    const fog = new THREE.FogExp2(0x0a0b0d, 0.045)
    if (sceneRef.current.fog) scene.fog = fog

    const camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / container.clientHeight,
      0.1,
      200,
    )
    camera.position.set(...HOME_VIEW.position)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(container.clientWidth, container.clientHeight)
    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.set(...HOME_VIEW.target)
    cameraRef.current = camera
    controlsRef.current = controls

    // ── Lights ──
    const ambient = new THREE.AmbientLight(0xffffff, 0.5)
    scene.add(ambient)
    const dir = new THREE.DirectionalLight(0xffffff, 1.2)
    dir.position.set(5, 8, 4)
    scene.add(dir)

    // ── Environment: drives the sun light, ambient, fog, sky, clouds and rain ──
    const environmentScene = createEnvironmentScene(scene, { sun: dir, ambient }, fog)
    let timeOfDay = environmentRef.current.timeOfDay
    let seenTime = timeOfDay
    let reportedTime = timeOfDay
    let lastReport = 0
    let wasPlaying = false
    let lastFrame = performance.now()

    // ── Grid ──
    const grid = new THREE.GridHelper(20, 20, 0x3a3f4b, 0x1e2228)
    grid.position.y = -0.01
    scene.add(grid)

    const axes = new THREE.AxesHelper(6)
    axes.position.y = 0.02
    scene.add(axes)

    // ── Plane mesh ──
    let segments = sceneRef.current.planeSegments
    let geometry = new THREE.PlaneGeometry(10, 10, segments, segments)
    const material = new THREE.MeshStandardMaterial({
      color: 0x3ecf8e,
      metalness: 0.08,
      roughness: 0.6,
      flatShading: true,
      side: THREE.DoubleSide,
      // Pushes the solid surface back so the wireframe overlay doesn't z-fight.
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    })
    const plane = new THREE.Mesh(geometry, material)
    plane.rotation.x = -Math.PI / 2
    scene.add(plane)

    const wireMaterial = new THREE.MeshBasicMaterial({
      color: 0x3ecf8e,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    })
    const wire = new THREE.Mesh(geometry, wireMaterial)
    wire.rotation.x = -Math.PI / 2
    scene.add(wire)

    let colorTexture: THREE.CanvasTexture | null = null
    let currentMapVersion = -1

    const rebuildGeometry = () => {
      const seg = sceneRef.current.planeSegments
      if (seg === segments && geometry) return
      segments = seg

      const old = geometry
      geometry = new THREE.PlaneGeometry(10, 10, segments, segments)
      plane.geometry = geometry
      wire.geometry = geometry
      old.dispose()

      // Re-apply heightfield to new geometry
      applyHeightfield()
    }

    const applyHeightfield = () => {
      const hf = heightfieldRef.current
      const scale = sceneRef.current.displacementScale
      const positions = geometry.attributes.position
      const count = positions.count
      const fieldSize = hf ? Math.round(Math.sqrt(hf.length)) : 0
      const segs = segments + 1

      for (let i = 0; i < count; i++) {
        let height = 0
        if (hf) {
          const col = i % segs
          const row = Math.floor(i / segs)
          const u = col / (segs - 1)
          const v = row / (segs - 1)
          const fx = Math.min(Math.floor(u * fieldSize), fieldSize - 1)
          const fy = Math.min(Math.floor(v * fieldSize), fieldSize - 1)
          height = hf[fy * fieldSize + fx] * scale
        }
        positions.setZ(i, height)
      }

      positions.needsUpdate = true
      geometry.computeVertexNormals()
    }

    const applyColorMap = () => {
      const src = colorMapRef.current
      if (!src) {
        if (colorTexture) {
          material.map = null
          colorTexture.dispose()
          colorTexture = null
          material.color.set(0x3ecf8e)
          material.needsUpdate = true
        }
        return
      }

      if (colorTexture) colorTexture.dispose()
      colorTexture = new THREE.CanvasTexture(src)
      colorTexture.minFilter = THREE.LinearFilter
      colorTexture.magFilter = THREE.LinearFilter
      material.map = colorTexture
      material.color.set(0xffffff)
      material.needsUpdate = true
    }

    // ── Animate ──
    let frameId = 0

    const animate = () => {
      frameId = requestAnimationFrame(animate)

      // Detect param changes and update incrementally.
      if (sceneRef.current.planeSegments !== segments) {
        rebuildGeometry()
      }

      if (sceneRef.current.displacementScale !== dispScaleRef.current) {
        dispScaleRef.current = sceneRef.current.displacementScale
        applyHeightfield()
      }

      const now = performance.now()
      const dt = Math.min((now - lastFrame) / 1000, 0.1)
      lastFrame = now

      // Time comes from the UI, except while the day cycle plays: then the canvas
      // advances it and reports back. A UI value we didn't report is a user edit.
      const env = environmentRef.current
      if (env.timeOfDay !== seenTime) {
        seenTime = env.timeOfDay
        if (seenTime !== reportedTime) timeOfDay = seenTime
      }
      if (env.dayCycle) timeOfDay = (timeOfDay + dt * DAY_CYCLE_HOURS_PER_SECOND) % 24
      const stopped = wasPlaying && !env.dayCycle
      if ((env.dayCycle && now - lastReport > TIME_REPORT_MS) || stopped) {
        lastReport = now
        reportedTime = timeOfDay
        onTimeRef.current(timeOfDay)
      }
      wasPlaying = env.dayCycle
      // Fog toggle and weather fog are combined by the environment.
      environmentScene.update({ ...env, timeOfDay }, dt, fogEnabledRef.current, camera.position)

      if (mapVersionRef.current !== currentMapVersion) {
        currentMapVersion = mapVersionRef.current
        applyColorMap()
        applyHeightfield()
      }

      const vp = viewportRef.current
      plane.visible = vp.solid
      wire.visible = vp.wireframe
      wireMaterial.opacity = vp.solid ? 0.35 : 0.9
      axes.visible = vp.axes
      grid.visible = vp.grid

      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    // ── Resize ──
    const handleResize = () => {
      const { clientWidth, clientHeight } = container
      if (clientWidth === 0 || clientHeight === 0) return
      camera.aspect = clientWidth / clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(clientWidth, clientHeight)
    }

    const ro = new ResizeObserver(handleResize)
    ro.observe(container)

    return () => {
      cancelAnimationFrame(frameId)
      ro.disconnect()
      controls.dispose()
      cameraRef.current = null
      controlsRef.current = null
      environmentScene.dispose()
      geometry.dispose()
      material.dispose()
      wireMaterial.dispose()
      axes.dispose()
      colorTexture?.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [])

  // Bump map version whenever colorMap or heightfield reference changes.
  useEffect(() => {
    mapVersionRef.current += 1
  }, [colorMap, heightfield])

  // Sync latest segments ref.
  useEffect(() => {
    segmentsRef.current = sceneParams.planeSegments
  }, [sceneParams.planeSegments])

  // Sync displacement scale ref.
  useEffect(() => {
    dispScaleRef.current = sceneParams.displacementScale
  }, [sceneParams.displacementScale])

  // Sync fog ref.
  useEffect(() => {
    fogEnabledRef.current = sceneParams.fog
  }, [sceneParams.fog])

  return (
    <div
      ref={containerRef}
      className="three-canvas"
      aria-label="Interactive 3D canvas"
    />
  )
}
