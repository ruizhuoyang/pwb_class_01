// ─────────────────────────────────────────────────────────
// Environment scene objects — sky dome, sun, stars, clouds, rain
//
// Created once per ThreeCanvas; `update` is called every frame and
// only touches colours, matrices and a few buffers. Reuses the
// canvas's existing sun light, ambient light and fog.
// ─────────────────────────────────────────────────────────

import * as THREE from 'three'
import { computeEnvironment, type EnvironmentParams, type EnvironmentState } from './environment'

export type EnvironmentScene = {
  update: (params: EnvironmentParams, dt: number, fogEnabled: boolean, cameraPosition: THREE.Vector3) => void
  dispose: () => void
}

type SceneLights = { sun: THREE.DirectionalLight; ambient: THREE.AmbientLight }

const SKY_RADIUS = 90
const SUN_DISTANCE = 80
const STAR_COUNT = 700
/** Base density of the existing Fog toggle. */
const FOG_TOGGLE_DENSITY = 0.045

const CLOUD_COUNT = 60
/** Clouds drift inside x, z ∈ [-CLOUD_RANGE, CLOUD_RANGE] and wrap around. */
const CLOUD_RANGE = 14
const CLOUD_FADE = 3
/**
 * Between the terrain peaks (~2) and the default camera (y 6, looking down), because the
 * default view never shows anything above the horizon.
 */
const CLOUD_BASE = 3.2
const CLOUD_THICKNESS = 1.2

const RAIN_DROPS = 1200
const RAIN_HALF = 9
const RAIN_TOP = CLOUD_BASE + 0.5
const RAIN_SPEED = 12
const RAIN_LENGTH = 0.35

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Puff = { cloud: number; offset: THREE.Vector3; scale: THREE.Vector3 }
type Cloud = { x: number; y: number; z: number }

export function createEnvironmentScene(scene: THREE.Scene, lights: SceneLights, fog: THREE.FogExp2): EnvironmentScene {
  const random = mulberry32(1337)

  // ── Sky dome: vertex colours from horizon to zenith ──
  const skyGeometry = new THREE.SphereGeometry(SKY_RADIUS, 32, 16)
  const skyColors = new Float32Array(skyGeometry.attributes.position.count * 3)
  skyGeometry.setAttribute('color', new THREE.BufferAttribute(skyColors, 3))
  const skyMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })
  const sky = new THREE.Mesh(skyGeometry, skyMaterial)
  sky.renderOrder = -1

  // ── Sun: additive glow sprite ──
  const sunTexture = new THREE.CanvasTexture(createGlowCanvas())
  const sunMaterial = new THREE.SpriteMaterial({
    map: sunTexture,
    transparent: true,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending,
  })
  const sunSprite = new THREE.Sprite(sunMaterial)
  sunSprite.scale.setScalar(16)

  const moon = new THREE.DirectionalLight(0x9db4e8, 0)
  scene.add(moon)

  // ── Stars on the upper hemisphere ──
  const starPositions = new Float32Array(STAR_COUNT * 3)
  for (let i = 0; i < STAR_COUNT; i++) {
    const theta = random() * Math.PI * 2
    const y = 0.05 + random() * 0.95
    const r = Math.sqrt(1 - y * y)
    starPositions.set([Math.cos(theta) * r, y, Math.sin(theta) * r].map((v) => v * (SKY_RADIUS - 5)), i * 3)
  }
  const starGeometry = new THREE.BufferGeometry()
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
  const starMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1.6,
    sizeAttenuation: false,
    transparent: true,
    depthWrite: false,
    fog: false,
  })
  const stars = new THREE.Points(starGeometry, starMaterial)

  // ── Clouds: a fixed pool of puffs, clouds shown in pool order ──
  const clouds: Cloud[] = []
  const puffs: Puff[] = []
  const puffEnd: number[] = []
  for (let c = 0; c < CLOUD_COUNT; c++) {
    const size = 0.5 + random() * 0.6
    clouds.push({
      x: (random() * 2 - 1) * CLOUD_RANGE,
      y: CLOUD_BASE + random() * CLOUD_THICKNESS,
      z: (random() * 2 - 1) * CLOUD_RANGE,
    })
    const count = 4 + Math.floor(random() * 3)
    for (let p = 0; p < count; p++) {
      puffs.push({
        cloud: c,
        offset: new THREE.Vector3((random() * 2 - 1) * 1.1 * size, (random() * 2 - 1) * 0.15 * size, (random() * 2 - 1) * 0.5 * size),
        scale: new THREE.Vector3(0.6 + random() * 0.4, 0.3 + random() * 0.15, 0.45 + random() * 0.3).multiplyScalar(size),
      })
    }
    puffEnd.push(puffs.length)
  }
  const puffGeometry = new THREE.IcosahedronGeometry(1, 1)
  const cloudMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    flatShading: true,
    transparent: true,
    opacity: 0.85,
  })
  const cloudMesh = new THREE.InstancedMesh(puffGeometry, cloudMaterial, puffs.length)
  cloudMesh.frustumCulled = false
  let windOffset = 0

  // ── Rain: short streaks falling inside a box around the terrain ──
  const rainPositions = new Float32Array(RAIN_DROPS * 6)
  const dropHeights = new Float32Array(RAIN_DROPS)
  for (let i = 0; i < RAIN_DROPS; i++) {
    const x = (random() * 2 - 1) * RAIN_HALF
    const z = (random() * 2 - 1) * RAIN_HALF
    dropHeights[i] = random() * RAIN_TOP
    rainPositions.set([x, 0, z, x, 0, z], i * 6)
  }
  const rainGeometry = new THREE.BufferGeometry()
  const rainAttribute = new THREE.BufferAttribute(rainPositions, 3)
  rainAttribute.setUsage(THREE.DynamicDrawUsage)
  rainGeometry.setAttribute('position', rainAttribute)
  const rainMaterial = new THREE.LineBasicMaterial({ color: 0xa9bdd4, transparent: true, opacity: 0.5, depthWrite: false })
  const rain = new THREE.LineSegments(rainGeometry, rainMaterial)
  rain.frustumCulled = false

  // Sky, sun and stars are infinitely far away, so they follow the camera.
  const skyGroup = new THREE.Group()
  skyGroup.add(sky, sunSprite, stars)
  scene.add(skyGroup, cloudMesh, rain)

  let cachedKey = ''
  let env: EnvironmentState | null = null
  const matrix = new THREE.Matrix4()
  const quaternion = new THREE.Quaternion()
  const position = new THREE.Vector3()
  const scale = new THREE.Vector3()
  const skyColor = new THREE.Color()

  const applyLighting = (state: EnvironmentState) => {
    lights.sun.position.copy(state.sunDirection).multiplyScalar(10)
    lights.sun.color.copy(state.sunColor)
    lights.sun.intensity = state.sunIntensity
    moon.position.copy(state.sunDirection).multiplyScalar(-10)
    moon.intensity = state.moonIntensity
    lights.ambient.color.copy(state.ambientColor)
    lights.ambient.intensity = state.ambientIntensity

    const skyPositions = skyGeometry.attributes.position
    for (let i = 0; i < skyPositions.count; i++) {
      const h = skyPositions.getY(i) / SKY_RADIUS
      if (h >= 0) skyColor.copy(state.horizonColor).lerp(state.zenithColor, Math.pow(h, 0.6))
      else skyColor.copy(state.horizonColor).multiplyScalar(1 + h * 0.5)
      skyColors.set([skyColor.r, skyColor.g, skyColor.b], i * 3)
    }
    skyGeometry.attributes.color.needsUpdate = true
    scene.background = state.horizonColor
    fog.color.copy(state.horizonColor)

    sunSprite.position.copy(state.sunDirection).multiplyScalar(SUN_DISTANCE)
    sunMaterial.color.copy(state.sunColor)
    sunMaterial.opacity = state.sunDisc
    sunSprite.visible = state.sunDisc > 0.01
    starMaterial.opacity = state.starOpacity
    stars.visible = state.starOpacity > 0.01
    // Clouds scatter sky light, so part of their colour is self-lit rather than sun-lit.
    cloudMaterial.color.copy(state.cloudColor)
    cloudMaterial.emissive.copy(state.cloudColor).multiplyScalar(0.45)
    rainMaterial.opacity = 0.5 * state.rain
  }

  const updateClouds = (params: EnvironmentParams, dt: number, wind: number) => {
    cloudMesh.visible = params.clouds && params.cloudCover > 0
    if (!cloudMesh.visible) return
    windOffset += wind * dt
    const shownClouds = Math.round(params.cloudCover * CLOUD_COUNT)
    cloudMesh.count = shownClouds > 0 ? puffEnd[shownClouds - 1] : 0
    const span = CLOUD_RANGE * 2
    for (let i = 0; i < cloudMesh.count; i++) {
      const puff = puffs[i]
      const cloud = clouds[puff.cloud]
      const x = ((((cloud.x + windOffset + CLOUD_RANGE) % span) + span) % span) - CLOUD_RANGE
      // Shrink clouds near the wrap edge so they never pop in or out.
      const fade = Math.min(1, (CLOUD_RANGE - Math.abs(x)) / CLOUD_FADE)
      position.set(x + puff.offset.x, cloud.y + puff.offset.y, cloud.z + puff.offset.z)
      scale.copy(puff.scale).multiplyScalar(Math.max(0.001, fade))
      cloudMesh.setMatrixAt(i, matrix.compose(position, quaternion, scale))
    }
    cloudMesh.instanceMatrix.needsUpdate = true
  }

  const updateRain = (dt: number, strength: number, wind: number) => {
    rain.visible = strength > 0
    if (!rain.visible) return
    const slant = wind * 0.15
    for (let i = 0; i < RAIN_DROPS; i++) {
      let y = dropHeights[i] - RAIN_SPEED * dt
      if (y < 0) y += RAIN_TOP
      dropHeights[i] = y
      const o = i * 6
      rainPositions[o + 1] = y + RAIN_LENGTH
      rainPositions[o + 3] = rainPositions[o] - slant
      rainPositions[o + 4] = y
    }
    rainAttribute.needsUpdate = true
  }

  return {
    update(params, dt, fogEnabled, cameraPosition) {
      skyGroup.position.copy(cameraPosition)
      const key = `${params.timeOfDay}|${params.sunAzimuth}|${params.sunIntensity}|${params.weather}`
      if (key !== cachedKey || !env) {
        cachedKey = key
        env = computeEnvironment(params)
        applyLighting(env)
      }
      const density = (fogEnabled ? FOG_TOGGLE_DENSITY : 0) + env.fogDensity
      fog.density = density
      scene.fog = density > 0 ? fog : null
      updateClouds(params, dt, env.wind)
      updateRain(dt, env.rain, env.wind)
    },
    dispose() {
      scene.remove(skyGroup, cloudMesh, rain, moon)
      skyGeometry.dispose()
      skyMaterial.dispose()
      sunTexture.dispose()
      sunMaterial.dispose()
      starGeometry.dispose()
      starMaterial.dispose()
      puffGeometry.dispose()
      cloudMaterial.dispose()
      cloudMesh.dispose()
      rainGeometry.dispose()
      rainMaterial.dispose()
      moon.dispose()
    },
  }
}

/** Soft white disc with a glow falloff, tinted by the sprite colour. */
function createGlowCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(0.12, 'rgba(255,255,255,1)')
    gradient.addColorStop(0.2, 'rgba(255,255,255,0.45)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 128, 128)
  }
  return canvas
}
