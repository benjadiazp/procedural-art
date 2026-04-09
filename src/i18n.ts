/**
 * All localizable label keys for the procedural-art library.
 *
 * Values are the default English strings — these same strings are used as
 * lookup keys in the `labels` record passed to {@link mount}.
 * Untranslated keys fall back to English automatically.
 *
 * @example
 * ```ts
 * import { mount, i18nKeys } from 'procedural-art';
 *
 * const es: Record<string, string> = {
 *   [i18nKeys.common.parameters]: 'Parámetros',
 *   [i18nKeys.common.preset]: 'Predefinido',
 *   [i18nKeys.boids.name]: 'Boids',
 *   [i18nKeys.boids.presets.murmuration]: 'Murmuración',
 *   [i18nKeys.boids.labels.separation]: 'Separación',
 * };
 *
 * mount(container, { simulation: 'Boids', labels: es });
 * ```
 */
export const i18nKeys = {
  common: {
    parameters: 'Parameters',
    preset: 'Preset',
  },

  boids: {
    name: 'Boids',
    presets: {
      default: 'Default',
      murmuration: 'Murmuration',
      chaos: 'Chaos',
      oceanic: 'Oceanic',
      fireflies: 'Fireflies',
      tightSchool: 'Tight School',
      nebula: 'Nebula',
    },
    folders: {
      flock: 'Flock',
      behavior: 'Behavior',
      world: 'World',
      appearance: 'Appearance',
      postProcessing: 'Post Processing',
    },
    labels: {
      count: 'Count',
      predators: 'Predators',
      separation: 'Separation',
      alignment: 'Alignment',
      cohesion: 'Cohesion',
      speed: 'Speed',
      predatorSpeed: 'Predator Speed',
      perception: 'Perception',
      sepRadius: 'Sep. Radius',
      fleeRadius: 'Flee Radius',
      boundary: 'Boundary',
      pointSize: 'Point Size',
      brightness: 'Brightness',
      slowColor: 'Slow Color',
      fastColor: 'Fast Color',
      predatorColor: 'Predator Color',
      bloomStrength: 'Bloom Strength',
      bloomSmoothing: 'Bloom Smoothing',
      bloomThreshold: 'Bloom Threshold',
      afterimage: 'Afterimage',
      chromaticAberration: 'Chromatic Aberration',
      vignette: 'Vignette',
      filmGrain: 'Film Grain',
    },
  },

  reactionDiffusion: {
    name: 'Reaction-Diffusion',
    presets: {
      coral: 'Coral',
      mitosis: 'Mitosis',
      worms: 'Worms',
      maze: 'Maze',
      spots: 'Spots',
      solitons: 'Solitons',
      fingerprint: 'Fingerprint',
      bubbles: 'Bubbles',
    },
    folders: {
      chemistry: 'Chemistry',
      simulation: 'Simulation',
      appearance: 'Appearance',
      postProcessing: 'Post Processing',
    },
    labels: {
      feedRate: 'Feed Rate (f)',
      killRate: 'Kill Rate (k)',
      stepsPerFrame: 'Steps / Frame',
      timestep: 'Timestep',
      diffusionU: 'Diffusion U',
      diffusionV: 'Diffusion V',
      brushRadius: 'Brush Radius',
      background: 'Background',
      lowV: 'Low V',
      midV: 'Mid V',
      highV: 'High V',
      brightness: 'Brightness',
      bloomStrength: 'Bloom Strength',
      bloomSmoothing: 'Bloom Smoothing',
      bloomThreshold: 'Bloom Threshold',
      chromaticAberration: 'Chromatic Aberration',
      vignette: 'Vignette',
      filmGrain: 'Film Grain',
    },
  },

  physarum: {
    name: 'Physarum',
    presets: {
      default: 'Default',
      tendrils: 'Tendrils',
      denseNet: 'Dense Net',
      spirals: 'Spirals',
      veins: 'Veins',
      smoke: 'Smoke',
    },
    folders: {
      agents: 'Agents',
      trail: 'Trail',
      appearance: 'Appearance',
      postProcessing: 'Post Processing',
    },
    labels: {
      count: 'Count',
      sensorAngle: 'Sensor Angle',
      sensorDistance: 'Sensor Distance',
      turnSpeed: 'Turn Speed',
      moveSpeed: 'Move Speed',
      deposit: 'Deposit',
      decay: 'Decay',
      diffuse: 'Diffuse',
      brushRadius: 'Brush Radius',
      exposure: 'Exposure',
      background: 'Background',
      low: 'Low',
      mid: 'Mid',
      high: 'High',
      brightness: 'Brightness',
      bloomStrength: 'Bloom Strength',
      bloomRadius: 'Bloom Radius',
      bloomThreshold: 'Bloom Threshold',
    },
  },

  curlNoise: {
    name: 'Curl Noise',
    presets: {
      default: 'Default',
      smoke: 'Smoke',
      solarWind: 'Solar Wind',
      deepOcean: 'Deep Ocean',
      neonStorm: 'Neon Storm',
    },
    folders: {
      flowField: 'Flow Field',
      appearance: 'Appearance',
      postProcessing: 'Post Processing',
    },
    labels: {
      particles: 'Particles',
      noiseScale: 'Noise Scale',
      noiseSpeed: 'Noise Speed',
      flowStrength: 'Flow Strength',
      damping: 'Damping',
      turbulence: 'Turbulence',
      octaves: 'Octaves',
      boundary: 'Boundary',
      pointSize: 'Point Size',
      colorSlow: 'Color (Slow)',
      colorFast: 'Color (Fast)',
      opacity: 'Opacity',
      bloomStrength: 'Bloom Strength',
      bloomRadius: 'Bloom Radius',
      bloomThreshold: 'Bloom Threshold',
      trailPersistence: 'Trail Persistence',
    },
  },

  fluid: {
    name: 'Fluid',
    presets: {
      rainbow: 'Rainbow',
      ink: 'Ink',
      neon: 'Neon',
      smoke: 'Smoke',
    },
    folders: {
      physics: 'Physics',
      brush: 'Brush',
      appearance: 'Appearance',
      postProcessing: 'Post Processing',
    },
    labels: {
      velDissipation: 'Vel. Dissipation',
      dyeDissipation: 'Dye Dissipation',
      vorticity: 'Vorticity',
      pressureIters: 'Pressure Iters',
      radius: 'Radius',
      force: 'Force',
      saturation: 'Saturation',
      background: 'Background',
      brightness: 'Brightness',
      bloomStrength: 'Bloom Strength',
      bloomSmoothing: 'Bloom Smoothing',
      bloomThreshold: 'Bloom Threshold',
      chromaticAberration: 'Chromatic Aberration',
      vignette: 'Vignette',
      filmGrain: 'Film Grain',
    },
  },
} as const;

/** Extract all leaf string values from a nested object type */
type DeepValues<T> = T extends string ? T : { [K in keyof T]: DeepValues<T[K]> }[keyof T];

/** Union of every localizable key string */
export type LabelKey = DeepValues<typeof i18nKeys>;
