import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import CustomShaderMaterial from 'three-custom-shader-material/vanilla'

import slicedVertexShader from './shaders/sliced/vertex.glsl'
import slicedFragmentShader from './shaders/sliced/fragment.glsl'

/**
 * ============================================================================
 * CONFIGURATION
 * ============================================================================
 */
const CONFIG = {
  // Camera distance limits
//   MIN_ZOOM_DISTANCE: 8,
//   MAX_ZOOM_DISTANCE: 25,
  
  // Intersection Observer threshold
  VISIBILITY_THRESHOLD: 0.1,
  PAUSE_DELAY: 500,
  
  // Asset paths - AUTOMATIC DETECTION
  // In dev (Vite): Uses local ./static/ paths
  // In production (Webflow): Uses your Vercel CDN
  get DRACO_PATH() {
    return import.meta.env.DEV 
      ? './draco/' 
      : 'https://webgl-hero-scene.vercel.app/draco/'
  },
  
  get MODEL_PATH() {
    return import.meta.env.DEV 
      ? './gears.glb' 
      : 'https://webgl-hero-scene.vercel.app/gears.glb'
  },
  
  // Performance settings
  ENABLE_SHADOWS: true,
  ENABLE_MOTION_BLUR: true,
  
  // Rotation settings
  AUTO_ROTATE_SPEED: 0.1,
  RESUME_DELAY: 700,
  TRANSITION_DURATION: 1200
}

/**
 * ============================================================================
 * LOGGING UTILITIES
 * ============================================================================
 */
const Logger = {
  prefix: '[WebGL Hero]',
  
  info(message, ...args) {
    console.log(`${this.prefix} ℹ️`, message, ...args)
  },
  
  success(message, ...args) {
    console.log(`${this.prefix} ✅`, message, ...args)
  },
  
  warn(message, ...args) {
    console.warn(`${this.prefix} ⚠️`, message, ...args)
  },
  
  error(message, error) {
    console.error(`${this.prefix} ❌`, message, error)
  },
  
  performance(label, value) {
    console.log(`${this.prefix} ⚡`, label, `${value.toFixed(2)}ms`)
  }
}

/**
 * ============================================================================
 * CONTAINER INITIALIZATION with FALLBACK
 * ============================================================================
 */
function initializeContainer() {
  const startTime = performance.now()
  
  const webflowContainer = document.getElementById('webgl-hero-target') || 
                          document.querySelector('.webgl-hero')
  
  let container, canvas, mode
  
  if (webflowContainer) {
    mode = 'webflow'
    container = webflowContainer
    
    canvas = document.createElement('canvas')
    canvas.classList.add('webgl')
    canvas.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      outline: none;
      cursor: grab;
    `
    
    container.appendChild(canvas)
    Logger.success('Webflow mode initialized')
  } else {
    mode = 'vite'
    canvas = document.querySelector('canvas.webgl')
    
    if (!canvas) {
      canvas = document.createElement('canvas')
      canvas.classList.add('webgl')
      canvas.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        outline: none;
        cursor: grab;
      `
      document.body.appendChild(canvas)
    }
    
    container = document.body
    Logger.warn('Vite dev mode - Webflow container not found')
  }
  
  Logger.performance('Container init', performance.now() - startTime)
  Logger.info('Asset paths:', {
    draco: CONFIG.DRACO_PATH,
    model: CONFIG.MODEL_PATH
  })
  
  return { container, canvas, mode }
}

/**
 * ============================================================================
 * VISIBILITY MANAGER
 * ============================================================================
 */
class VisibilityManager {
  constructor(container, onVisibilityChange, mode) {
    this.container = container
    this.onVisibilityChange = onVisibilityChange
    this.mode = mode
    this.isVisible = true
    this.pauseTimeout = null
    this.observer = null
    
    if (mode === 'webflow') {
      this.init()
    }
  }
  
  init() {
    const options = {
      root: null,
      rootMargin: '0px',
      threshold: CONFIG.VISIBILITY_THRESHOLD
    }
    
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const wasVisible = this.isVisible
        this.isVisible = entry.isIntersecting
        
        if (this.pauseTimeout) {
          clearTimeout(this.pauseTimeout)
          this.pauseTimeout = null
        }
        
        if (this.isVisible && !wasVisible) {
          Logger.info('Hero visible - rendering resumed')
          this.onVisibilityChange(true)
        } else if (!this.isVisible && wasVisible) {
          Logger.info(`Hero invisible - pausing in ${CONFIG.PAUSE_DELAY}ms`)
          this.pauseTimeout = setTimeout(() => {
            this.onVisibilityChange(false)
          }, CONFIG.PAUSE_DELAY)
        }
      })
    }, options)
    
    this.observer.observe(this.container)
    Logger.success('Visibility observer initialized')
  }
  
  destroy() {
    if (this.observer) {
      this.observer.disconnect()
      this.observer = null
    }
    if (this.pauseTimeout) {
      clearTimeout(this.pauseTimeout)
    }
  }
}

/**
 * ============================================================================
 * MAIN APPLICATION
 * ============================================================================
 */

// Performance tracking
const perfStart = performance.now()

// Initialize container
const { container, canvas, mode } = initializeContainer()

// Scene setup
const scene = new THREE.Scene()
scene.background = null

// Loaders
const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath(CONFIG.DRACO_PATH)
const gltfLoader = new GLTFLoader()
gltfLoader.setDRACOLoader(dracoLoader)

// Shader uniforms
const uniforms = {
  uSliceStart: new THREE.Uniform(1.75),
  uSliceArc: new THREE.Uniform(1.25),
  uAngularVelocity: new THREE.Uniform(0.0)
}

const PatchMap = {
  csm_Slice: {
    '#include <colorspace_fragment>': `
      #include <colorspace_fragment>
      if(!gl_FrontFacing) gl_FragColor = vec4(0.15,0.16,0.17,1.0);
    `
  }
}

// Procedural normal map
const createMetalNormalMap = () => {
  const size = 512
  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = size
  tempCanvas.height = size
  const ctx = tempCanvas.getContext('2d')
  const imageData = ctx.createImageData(size, size)
  
  for (let i = 0; i < imageData.data.length; i += 4) {
    const noise = Math.random() * 20 + 128
    imageData.data[i] = noise
    imageData.data[i+1] = noise
    imageData.data[i+2] = 128 + Math.random()*10
    imageData.data[i+3] = 255
  }
  
  ctx.putImageData(imageData, 0, 0)
  const texture = new THREE.CanvasTexture(tempCanvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(4,4)
  
  return texture
}

const metalNormalMap = createMetalNormalMap()

// Materials
const material = new THREE.MeshPhysicalMaterial({
  metalness: 0.85,
  roughness: 0.25,
  ior: 1.4,
  reflectivity: 0.8,
  envMapIntensity: 0.6,
  color: '#c0c8d0',
  normalMap: metalNormalMap,
  normalScale: new THREE.Vector2(0.4, 0.4),
  polygonOffset: true,
  polygonOffsetFactor: 3,
  polygonOffsetUnits: 3
})

const slicedMaterial = new CustomShaderMaterial({
  baseMaterial: THREE.MeshPhysicalMaterial,
  vertexShader: slicedVertexShader,
  fragmentShader: slicedFragmentShader,
  uniforms,
  patchMap: PatchMap,
  metalness: 0.95,
  roughness: 0.15,
  ior: 1.4,
  reflectivity: 0.8,
  envMapIntensity: 0.6,
  color: '#b8c2cc',
  normalMap: metalNormalMap,
  normalScale: new THREE.Vector2(0.2, 0.2),
  side: THREE.DoubleSide
})

const slicedDepthMaterial = new CustomShaderMaterial({
  baseMaterial: THREE.MeshDepthMaterial,
  vertexShader: slicedVertexShader,
  fragmentShader: slicedFragmentShader,
  uniforms,
  patchMap: PatchMap,
  depthPacking: THREE.RGBADepthPacking
})

// Load model
let model = null
const modelLoadStart = performance.now()

gltfLoader.load(
  CONFIG.MODEL_PATH,
  (gltf) => {
    model = gltf.scene

    model.traverse((child) => {
      if(child.isMesh) {
        child.geometry.computeVertexNormals()
        
        if(child.name === 'outerHull') {
          child.material = slicedMaterial
          child.customDepthMaterial = slicedDepthMaterial
        } else {
          child.material = material
        }
        
        child.material.color.convertSRGBToLinear()
        
        if (CONFIG.ENABLE_SHADOWS) {
          child.castShadow = true
          child.receiveShadow = true
        }
      }
    })
    
    scene.add(model)
    
    Logger.success('3D model loaded')
    Logger.performance('Model load time', performance.now() - modelLoadStart)
    
    // Mark canvas as loaded
    canvas.classList.add('loaded')
    
    // Dispatch custom event for external listeners
    window.dispatchEvent(new CustomEvent('webglReady'))
  },
  (progress) => {
    // Progress tracking (only log at key milestones)
    const percent = Math.round((progress.loaded / progress.total) * 100)
    if (percent === 25 || percent === 50 || percent === 75) {
      Logger.info(`Loading: ${percent}%`)
    }
  },
  (error) => {
    Logger.error('Failed to load 3D model', error)
    
    // Show fallback
    document.body.classList.add('webgl-fallback')
    
    // Hide canvas
    if (canvas) {
      canvas.style.display = 'none'
    }
    
    // Dispatch error event
    window.dispatchEvent(new CustomEvent('webglError', { 
      detail: { 
        error: error.message,
        stack: error.stack
      } 
    }))
  }
)

// Lights
scene.add(new THREE.AmbientLight('#ffffff', 4))

const keyLight = new THREE.DirectionalLight('#ffffff', 10)
keyLight.position.set(8, 10, 7)

if (CONFIG.ENABLE_SHADOWS) {
  keyLight.castShadow = true
  keyLight.shadow.mapSize.set(1024, 1024)
  keyLight.shadow.bias = -0.0003
  keyLight.shadow.normalBias = 0.05
  keyLight.shadow.radius = 4
}

scene.add(keyLight)

const keyLightSecond = new THREE.PointLight('#708090', 10)
keyLightSecond.position.set(-8, -10, -7)
scene.add(keyLightSecond)

const rimLight = new THREE.DirectionalLight('#4da8ff', 4)
rimLight.position.set(-9, 6, -8)
scene.add(rimLight)

const fillLight = new THREE.DirectionalLight('#ffb366', 3)
fillLight.position.set(6, 3, 6)
scene.add(fillLight)

/**
 * Camera & Controls
 */
const sizes = { 
  width: container.clientWidth || window.innerWidth, 
  height: container.clientHeight || window.innerHeight, 
  pixelRatio: Math.min(window.devicePixelRatio, 2) 
}

const camera = new THREE.PerspectiveCamera(35, sizes.width / sizes.height, 0.01, 100)
camera.position.set(-5, 5, 12)
scene.add(camera)

const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true
controls.dampingFactor = 0.08
controls.autoRotate = false
controls.target.set(0, 0, 0)
controls.enableZoom = false  // ← DISABLE ZOOM
controls.maxPolarAngle = Math.PI * 0.75
controls.update()

// Logger.info(`Zoom limits: ${CONFIG.MIN_ZOOM_DISTANCE} - ${CONFIG.MAX_ZOOM_DISTANCE}`)

/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({
  canvas,
  alpha: true,
  antialias: true,
  powerPreference: 'high-performance'
})

renderer.shadowMap.enabled = CONFIG.ENABLE_SHADOWS
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 0.9
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(sizes.pixelRatio)

/**
 * Initialize managers
 */
// const scrollManager = new ScrollManager(controls, canvas, mode)
const visibilityManager = new VisibilityManager(container, handleVisibilityChange, mode)

/**
 * Motion settings
 */
const motionSettings = {
  enabled: CONFIG.ENABLE_MOTION_BLUR,
  intensity: 5.0
}

const rotationSettings = {
  enabled: true,
  speed: CONFIG.AUTO_ROTATE_SPEED,
  pauseOnInteraction: true,
  resumeDelay: CONFIG.RESUME_DELAY,
  smoothTransition: true,
  transitionDuration: CONFIG.TRANSITION_DURATION
}

/**
 * Resize handler
 */
function handleResize() {
  if (mode === 'vite') {
    sizes.width = window.innerWidth
    sizes.height = window.innerHeight
  } else {
    sizes.width = container.clientWidth || window.innerWidth
    sizes.height = container.clientHeight || window.innerHeight
  }
  
  camera.aspect = sizes.width / sizes.height
  camera.updateProjectionMatrix()
  renderer.setSize(sizes.width, sizes.height)
}

window.addEventListener('resize', handleResize)

/**
 * Auto-rotation system
 */
let autoRotate = true
let userInteracting = false
let resumeTimeout = null
let rotationSpeedMultiplier = 1.0
let transitionStartTime = 0
let isMouseDown = false
let isTouching = false

function easePower2Out(t) {
  return t * (2 - t)
}

function resumeRotation() {
  userInteracting = false
  
  if(rotationSettings.pauseOnInteraction && rotationSettings.enabled) {
    clearTimeout(resumeTimeout)
    resumeTimeout = setTimeout(() => {
      if(!userInteracting) {
        autoRotate = true
        if(rotationSettings.smoothTransition) {
          rotationSpeedMultiplier = 0.0
          transitionStartTime = performance.now()
        } else {
          rotationSpeedMultiplier = 1.0
        }
      }
    }, rotationSettings.resumeDelay)
  }
}

// ═══════════════════════════════════════════════════════
// CURSOR MANAGEMENT - Grab & Grabbing
// ═══════════════════════════════════════════════════════
canvas.addEventListener('mousedown', (event) => {
  if(event.button === 0) {
    isMouseDown = true
    canvas.style.cursor = 'grabbing'  // ← Grabbing cursor
  }
})

canvas.addEventListener('mouseup', () => {
  isMouseDown = false
  canvas.style.cursor = 'grab'  // ← Back to grab cursor
})

canvas.addEventListener('mouseleave', () => {
  isMouseDown = false
  canvas.style.cursor = 'grab'  // ← Back to grab cursor
  if(userInteracting) resumeRotation()
})


// Touch tracking
canvas.addEventListener('touchstart', () => {
  isTouching = true
  canvas.style.cursor = 'grabbing'  // ← Mobile grabbing
})

canvas.addEventListener('touchend', () => {
  isTouching = false
  canvas.style.cursor = 'grab'  // ← Back to grab
})

canvas.addEventListener('touchcancel', () => {
  isTouching = false
  canvas.style.cursor = 'grab'  // ← Back to grab
})

// OrbitControls listeners
controls.addEventListener('start', () => {
  if(isMouseDown || isTouching) {
    userInteracting = true
    
    if(rotationSettings.pauseOnInteraction) {
      autoRotate = false
      rotationSpeedMultiplier = 0.0
    }
    
    clearTimeout(resumeTimeout)
  }
})

controls.addEventListener('end', () => {
  if(userInteracting) resumeRotation()
})

/**
 * Motion blur system
 */
let previousRotation = 0
let smoothedVelocity = 0
const velocitySmoothing = 0.9

/**
 * ============================================================================
 * ANIMATION LOOP
 * ============================================================================
 */
const clock = new THREE.Clock()
let isRendering = true
let animationFrameId = null

function tick() {
  if (!isRendering) return
  
  const delta = clock.getDelta()

  if(model) {
    // Handle rotation transition
    if(autoRotate && rotationSettings.smoothTransition && rotationSpeedMultiplier < 1.0) {
      const transitionElapsed = performance.now() - transitionStartTime
      const transitionProgress = Math.min(transitionElapsed / rotationSettings.transitionDuration, 1.0)
      rotationSpeedMultiplier = easePower2Out(transitionProgress)
    }

    // Auto-rotate
    if(autoRotate && !userInteracting && rotationSettings.enabled) {
      const rotationSpeed = rotationSettings.speed * rotationSpeedMultiplier
      model.rotation.y += rotationSpeed * delta
    }

    // Motion blur
    if (motionSettings.enabled) {
      const currentRotation = model.rotation.y
      const rawVelocity = Math.abs(currentRotation - previousRotation) / Math.max(delta, 0.001)
      smoothedVelocity = smoothedVelocity * velocitySmoothing + rawVelocity * (1 - velocitySmoothing)

      const normalizedVelocity = Math.min(smoothedVelocity * motionSettings.intensity, 1.0)
      if(Math.abs(uniforms.uAngularVelocity.value - normalizedVelocity) > 0.01) {
        uniforms.uAngularVelocity.value = normalizedVelocity
      }
      
      previousRotation = currentRotation
    }
  }

  controls.update()
  renderer.render(scene, camera)
  
  animationFrameId = requestAnimationFrame(tick)
}

// Visibility change handler
function handleVisibilityChange(visible) {
  if (visible && !isRendering) {
    isRendering = true
    clock.start()
    Logger.info('Rendering resumed')
    tick()
  } else if (!visible && isRendering) {
    isRendering = false
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId)
      animationFrameId = null
    }
    clock.stop()
    Logger.info('Rendering paused (saving resources)')
  }
}

// Start animation
tick()

// Performance summary
Logger.performance('Total init time', performance.now() - perfStart)
Logger.success(`WebGL Hero initialized (${mode} mode)`)

/**
 * ============================================================================
 * CLEANUP
 * ============================================================================
 */
window.addEventListener('beforeunload', () => {
  visibilityManager.destroy()
  
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
  }
  
  renderer.dispose()
  controls.dispose()
  
  Logger.info('Resources cleaned up')
})