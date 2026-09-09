import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import './ThreeCanvas.css'

export type SceneParams = {
  planeSegments: number
  displacementScale: number
  noiseFieldSize: number
  fog: boolean
}

type ThreeCanvasProps = {
  sceneParams: SceneParams
  /** Offscreen canvas painted with the color noise map. */
  colorMap: HTMLCanvasElement | null
  /** Raw 0..1 heightfield matching noiseFieldSize × noiseFieldSize. */
  heightfield: Float32Array | null
}

export default function ThreeCanvas({
  sceneParams,
  colorMap,
  heightfield,
}: ThreeCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Keep mutable refs so the render loop can read latest values
  // without re-mounting the entire Three.js scene.
  const sceneRef = useRef(sceneParams)
  const colorMapRef = useRef(colorMap)
  const heightfieldRef = useRef(heightfield)

  // Track versions to detect changes inside the animation loop.
  const segmentsRef = useRef(sceneParams.planeSegments)
  const dispScaleRef = useRef(sceneParams.displacementScale)
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

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // ── Renderer / scene / camera ──
    const scene = new THREE.Scene()
    const bgColor = new THREE.Color(0x0a0b0d)
    scene.background = bgColor

    const camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / container.clientHeight,
      0.1,
      200,
    )
    camera.position.set(0, 6, 8)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(container.clientWidth, container.clientHeight)
    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.set(0, 0, 0)

    // ── Lights ──
    scene.add(new THREE.AmbientLight(0xffffff, 0.5))
    const dir = new THREE.DirectionalLight(0xffffff, 1.2)
    dir.position.set(5, 8, 4)
    scene.add(dir)

    // ── Grid ──
    const grid = new THREE.GridHelper(20, 20, 0x3a3f4b, 0x1e2228)
    grid.position.y = -0.01
    scene.add(grid)

    // ── Plane mesh ──
    let segments = sceneRef.current.planeSegments
    let geometry = new THREE.PlaneGeometry(10, 10, segments, segments)
    const material = new THREE.MeshStandardMaterial({
      color: 0x3ecf8e,
      metalness: 0.08,
      roughness: 0.6,
      flatShading: true,
      side: THREE.DoubleSide,
    })
    const plane = new THREE.Mesh(geometry, material)
    plane.rotation.x = -Math.PI / 2
    scene.add(plane)

    let colorTexture: THREE.CanvasTexture | null = null
    let currentMapVersion = -1
    let fogEnabled = sceneRef.current.fog
    if (fogEnabled) scene.fog = new THREE.FogExp2(bgColor.getHex(), 0.06)

    const rebuildGeometry = () => {
      const seg = sceneRef.current.planeSegments
      if (seg === segments && geometry) return
      segments = seg

      const old = geometry
      geometry = new THREE.PlaneGeometry(10, 10, segments, segments)
      plane.geometry = geometry
      old.dispose()

      // Re-apply heightfield to new geometry
      applyHeightfield()
    }

    const applyHeightfield = () => {
      const hf = heightfieldRef.current
      const scale = sceneRef.current.displacementScale
      const positions = geometry.attributes.position
      const count = positions.count
      const fieldSize = sceneRef.current.noiseFieldSize
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

      if (mapVersionRef.current !== currentMapVersion) {
        currentMapVersion = mapVersionRef.current
        applyColorMap()
        applyHeightfield()
      }

      // Fog toggle
      if (sceneRef.current.fog !== fogEnabled) {
        fogEnabled = sceneRef.current.fog
        scene.fog = fogEnabled ? new THREE.FogExp2(bgColor.getHex(), 0.06) : null
      }

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
      geometry.dispose()
      material.dispose()
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

  return (
    <div
      ref={containerRef}
      className="three-canvas"
      aria-label="Interactive 3D canvas"
    />
  )
}
