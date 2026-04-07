import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import {
  EffectComposer, EffectPass, RenderPass,
  BloomEffect, ChromaticAberrationEffect, VignetteEffect, NoiseEffect,
  BlendFunction,
} from 'postprocessing';
import type { Simulation, SimulationContext, SimulationClickEvent } from '../simulation';

const SIM_SIZE = 512;
const PLANE_SIZE = 20;

// ────────────────────────────── GLSL ──────────────────────────────

const computeShader = /* glsl */ `
uniform float uFeedRate;
uniform float uKillRate;
uniform float uDiffusionU;
uniform float uDiffusionV;
uniform float uTimestep;
uniform vec4 uBrush; // xy = position (0-1), z = radius, w = active

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec2 tx = 1.0 / resolution.xy;

  vec4 c = texture2D(textureChemicals, uv);
  float U = c.r;
  float V = c.g;

  // 9-point weighted Laplacian (wrap handled by RepeatWrapping)
  float lapU = -U, lapV = -V;
  vec4 s;

  // Cardinals (weight 0.2)
  s = texture2D(textureChemicals, uv + vec2( tx.x, 0.0)); lapU += s.r * 0.2; lapV += s.g * 0.2;
  s = texture2D(textureChemicals, uv + vec2(-tx.x, 0.0)); lapU += s.r * 0.2; lapV += s.g * 0.2;
  s = texture2D(textureChemicals, uv + vec2(0.0,  tx.y)); lapU += s.r * 0.2; lapV += s.g * 0.2;
  s = texture2D(textureChemicals, uv + vec2(0.0, -tx.y)); lapU += s.r * 0.2; lapV += s.g * 0.2;

  // Diagonals (weight 0.05)
  s = texture2D(textureChemicals, uv + vec2( tx.x,  tx.y)); lapU += s.r * 0.05; lapV += s.g * 0.05;
  s = texture2D(textureChemicals, uv + vec2(-tx.x,  tx.y)); lapU += s.r * 0.05; lapV += s.g * 0.05;
  s = texture2D(textureChemicals, uv + vec2( tx.x, -tx.y)); lapU += s.r * 0.05; lapV += s.g * 0.05;
  s = texture2D(textureChemicals, uv + vec2(-tx.x, -tx.y)); lapU += s.r * 0.05; lapV += s.g * 0.05;

  // Gray-Scott reaction-diffusion
  float uvv = U * V * V;
  float newU = U + (uDiffusionU * lapU - uvv + uFeedRate * (1.0 - U)) * uTimestep;
  float newV = V + (uDiffusionV * lapV + uvv - (uFeedRate + uKillRate) * V) * uTimestep;

  // Brush seeding
  if (uBrush.w > 0.5) {
    vec2 d = abs(uv - uBrush.xy);
    d = min(d, 1.0 - d); // wrap-aware distance
    float dist = length(d);
    if (dist < uBrush.z) {
      float t = smoothstep(uBrush.z, uBrush.z * 0.2, dist);
      newV = mix(newV, 1.0, t);
      newU = mix(newU, 0.0, t * 0.5);
    }
  }

  gl_FragColor = vec4(clamp(newU, 0.0, 1.0), clamp(newV, 0.0, 1.0), 0.0, 1.0);
}
`;

const displayVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const displayFrag = /* glsl */ `
uniform sampler2D tChemicals;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec3 uColor4;
uniform float uBrightness;

varying vec2 vUv;

void main() {
  vec4 chem = texture2D(tChemicals, vUv);
  float v = chem.g;
  float u = chem.r;

  // Multi-stop gradient driven by V concentration
  vec3 color;
  float t1 = 0.08, t2 = 0.25;
  if (v < t1) {
    color = mix(uColor1, uColor2, v / t1);
  } else if (v < t2) {
    color = mix(uColor2, uColor3, (v - t1) / (t2 - t1));
  } else {
    color = mix(uColor3, uColor4, clamp((v - t2) / (1.0 - t2), 0.0, 1.0));
  }

  // Subtle depth shading from U chemical
  color *= 0.82 + 0.18 * u;
  color *= uBrightness;

  gl_FragColor = vec4(color, 1.0);
}
`;

// ────────────────────────────── Presets ──────────────────────────────

type Params = ReactionDiffusionSimulation['params'];
type PresetValues = Partial<Omit<Params, 'preset'>>;

const PRESETS: Record<string, PresetValues> = {
  'Coral': {
    feedRate: 0.0545, killRate: 0.062,
    diffusionU: 0.2097, diffusionV: 0.105,
    timestep: 1.0, iterations: 16, brushRadius: 0.02,
    color1: '#0a0a2e', color2: '#1a6b6b', color3: '#e07850', color4: '#ffffff',
    brightness: 1.2,
    bloomStrength: 0.3, bloomRadius: 0.4, bloomThreshold: 0.6,
    chromaticAberration: 0.0, vignetteDarkness: 0.4, noiseIntensity: 0.02,
  },
  'Mitosis': {
    feedRate: 0.0367, killRate: 0.0649,
    diffusionU: 0.2097, diffusionV: 0.105,
    timestep: 1.0, iterations: 16, brushRadius: 0.025,
    color1: '#1a0a2e', color2: '#6b1a6b', color3: '#e050a0', color4: '#ffe0f0',
    brightness: 1.2,
    bloomStrength: 0.4, bloomRadius: 0.5, bloomThreshold: 0.5,
    chromaticAberration: 0.0, vignetteDarkness: 0.35, noiseIntensity: 0.015,
  },
  'Worms': {
    feedRate: 0.058, killRate: 0.065,
    diffusionU: 0.2097, diffusionV: 0.105,
    timestep: 1.0, iterations: 20, brushRadius: 0.015,
    color1: '#0a1a0a', color2: '#2a4a1a', color3: '#a08030', color4: '#f0e0c0',
    brightness: 1.1,
    bloomStrength: 0.2, bloomRadius: 0.3, bloomThreshold: 0.7,
    chromaticAberration: 0.0, vignetteDarkness: 0.45, noiseIntensity: 0.03,
  },
  'Maze': {
    feedRate: 0.029, killRate: 0.057,
    diffusionU: 0.2097, diffusionV: 0.105,
    timestep: 1.0, iterations: 24, brushRadius: 0.02,
    color1: '#0a0a14', color2: '#1a1a6b', color3: '#5090d0', color4: '#e0f0ff',
    brightness: 1.1,
    bloomStrength: 0.25, bloomRadius: 0.4, bloomThreshold: 0.65,
    chromaticAberration: 0.0, vignetteDarkness: 0.5, noiseIntensity: 0.02,
  },
  'Spots': {
    feedRate: 0.035, killRate: 0.065,
    diffusionU: 0.2097, diffusionV: 0.105,
    timestep: 1.0, iterations: 16, brushRadius: 0.02,
    color1: '#1a0a00', color2: '#6b3000', color3: '#d09030', color4: '#fff0d0',
    brightness: 1.2,
    bloomStrength: 0.3, bloomRadius: 0.3, bloomThreshold: 0.6,
    chromaticAberration: 0.0, vignetteDarkness: 0.4, noiseIntensity: 0.025,
  },
  'Solitons': {
    feedRate: 0.03, killRate: 0.06,
    diffusionU: 0.2097, diffusionV: 0.105,
    timestep: 1.0, iterations: 16, brushRadius: 0.015,
    color1: '#0a0000', color2: '#6b0a0a', color3: '#d03020', color4: '#ff8040',
    brightness: 1.3,
    bloomStrength: 0.5, bloomRadius: 0.5, bloomThreshold: 0.4,
    chromaticAberration: 0.0, vignetteDarkness: 0.5, noiseIntensity: 0.03,
  },
  'Fingerprint': {
    feedRate: 0.055, killRate: 0.062,
    diffusionU: 0.2097, diffusionV: 0.105,
    timestep: 1.0, iterations: 20, brushRadius: 0.02,
    color1: '#0a1a1a', color2: '#0a4a5a', color3: '#40b0c0', color4: '#e0ffff',
    brightness: 1.1,
    bloomStrength: 0.2, bloomRadius: 0.3, bloomThreshold: 0.7,
    chromaticAberration: 0.0, vignetteDarkness: 0.35, noiseIntensity: 0.02,
  },
  'Bubbles': {
    feedRate: 0.012, killRate: 0.05,
    diffusionU: 0.2097, diffusionV: 0.105,
    timestep: 1.0, iterations: 24, brushRadius: 0.03,
    color1: '#14001a', color2: '#4a1a6b', color3: '#9060c0', color4: '#e0d0ff',
    brightness: 1.2,
    bloomStrength: 0.4, bloomRadius: 0.5, bloomThreshold: 0.5,
    chromaticAberration: 0.0, vignetteDarkness: 0.45, noiseIntensity: 0.02,
  },
};

// ────────────────────────────── Simulation ──────────────────────────────

export class ReactionDiffusionSimulation implements Simulation {
  name = 'Reaction-Diffusion';
  is2D = true;

  private gpuCompute!: GPUComputationRenderer;
  private chemVar: any;

  private displayMesh!: THREE.Mesh;
  private displayMat!: THREE.ShaderMaterial;
  private displayGeo!: THREE.PlaneGeometry;

  private composer!: EffectComposer;
  private bloomEffect!: BloomEffect;
  private chromaticAberration!: ChromaticAberrationEffect;
  private vignetteEffect!: VignetteEffect;
  private noiseEffect!: NoiseEffect;

  private ctx!: SimulationContext;

  private brushUV = new THREE.Vector2(-1, -1);
  private brushPending = false;

  private params = {
    preset: 'Coral',
    feedRate: 0.0545,
    killRate: 0.062,
    diffusionU: 0.2097,
    diffusionV: 0.105,
    timestep: 1.0,
    iterations: 16,
    brushRadius: 0.02,
    color1: '#0a0a2e',
    color2: '#1a6b6b',
    color3: '#e07850',
    color4: '#ffffff',
    brightness: 1.2,
    bloomStrength: 0.3,
    bloomRadius: 0.4,
    bloomThreshold: 0.6,
    chromaticAberration: 0.0,
    vignetteDarkness: 0.4,
    noiseIntensity: 0.02,
  };

  /* ─── lifecycle ─── */

  setup(ctx: SimulationContext) {
    this.ctx = ctx;

    ctx.scene.background = new THREE.Color(0x000000);

    ctx.camera.position.set(0, 0, 18);
    ctx.camera.lookAt(0, 0, 0);
    ctx.camera.near = 0.1;
    ctx.camera.far = 100;
    ctx.camera.updateProjectionMatrix();

    this.initGPUCompute(ctx.renderer);
    this.initDisplay(ctx.scene);
    this.initPostProcessing(ctx);
    this.setupGUI(ctx);
  }

  update(_time: number, _delta: number) {
    const cu = this.chemVar.material.uniforms;

    for (let i = 0; i < this.params.iterations; i++) {
      if (this.brushPending && i === 0) {
        cu.uBrush.value.set(this.brushUV.x, this.brushUV.y, this.params.brushRadius, 1.0);
      } else {
        cu.uBrush.value.w = 0.0;
      }
      this.gpuCompute.compute();
    }
    this.brushPending = false;

    this.displayMat.uniforms.tChemicals.value =
      this.gpuCompute.getCurrentRenderTarget(this.chemVar).texture;
  }

  onClick(event: SimulationClickEvent) {
    const intersects = event.raycaster.intersectObject(this.displayMesh);
    if (intersects.length > 0 && intersects[0].uv) {
      this.brushUV.set(intersects[0].uv.x, intersects[0].uv.y);
      this.brushPending = true;
    }
  }

  render() {
    this.composer.render();
  }

  onResize(w: number, h: number) {
    this.composer.setSize(w, h);
  }

  resetCamera(ctx: SimulationContext) {
    ctx.camera.position.set(0, 0, 18);
    ctx.camera.lookAt(0, 0, 0);
  }

  reset() {
    this.gpuCompute.dispose();
    this.initGPUCompute(this.ctx.renderer);
  }

  dispose() {
    this.gpuCompute.dispose();
    this.displayMat.dispose();
    this.displayGeo.dispose();
    this.composer.dispose();
  }

  /* ─── init helpers ─── */

  private initGPUCompute(renderer: THREE.WebGLRenderer) {
    this.gpuCompute = new GPUComputationRenderer(SIM_SIZE, SIM_SIZE, renderer);

    const dtChem = this.gpuCompute.createTexture();
    this.fillTexture(dtChem);

    this.chemVar = this.gpuCompute.addVariable('textureChemicals', computeShader, dtChem);
    this.gpuCompute.setVariableDependencies(this.chemVar, [this.chemVar]);

    this.chemVar.wrapS = THREE.RepeatWrapping;
    this.chemVar.wrapT = THREE.RepeatWrapping;

    const cu = this.chemVar.material.uniforms;
    cu.uFeedRate = { value: this.params.feedRate };
    cu.uKillRate = { value: this.params.killRate };
    cu.uDiffusionU = { value: this.params.diffusionU };
    cu.uDiffusionV = { value: this.params.diffusionV };
    cu.uTimestep = { value: this.params.timestep };
    cu.uBrush = { value: new THREE.Vector4(-1, -1, 0.02, 0) };

    const err = this.gpuCompute.init();
    if (err) console.error('GPUCompute init error:', err);
  }

  private fillTexture(tex: THREE.DataTexture) {
    const d = tex.image.data as Float32Array;

    // Fill U = 1, V = 0
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 1.0;
      d[i + 1] = 0.0;
      d[i + 2] = 0.0;
      d[i + 3] = 1.0;
    }

    // Seed random circular patches of chemical V
    const numSeeds = 20;
    const seedRadius = 5;
    for (let s = 0; s < numSeeds; s++) {
      const cx = Math.floor(Math.random() * SIM_SIZE);
      const cy = Math.floor(Math.random() * SIM_SIZE);
      for (let dy = -seedRadius; dy <= seedRadius; dy++) {
        for (let dx = -seedRadius; dx <= seedRadius; dx++) {
          if (dx * dx + dy * dy > seedRadius * seedRadius) continue;
          const px = ((cx + dx) % SIM_SIZE + SIM_SIZE) % SIM_SIZE;
          const py = ((cy + dy) % SIM_SIZE + SIM_SIZE) % SIM_SIZE;
          const idx = (py * SIM_SIZE + px) * 4;
          d[idx] = 0.5 + (Math.random() - 0.5) * 0.02;
          d[idx + 1] = 0.25 + (Math.random() - 0.5) * 0.02;
        }
      }
    }
  }

  private initDisplay(scene: THREE.Scene) {
    this.displayGeo = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE);
    this.displayMat = new THREE.ShaderMaterial({
      uniforms: {
        tChemicals: { value: null },
        uColor1: { value: new THREE.Color(this.params.color1) },
        uColor2: { value: new THREE.Color(this.params.color2) },
        uColor3: { value: new THREE.Color(this.params.color3) },
        uColor4: { value: new THREE.Color(this.params.color4) },
        uBrightness: { value: this.params.brightness },
      },
      vertexShader: displayVert,
      fragmentShader: displayFrag,
    });
    this.displayMesh = new THREE.Mesh(this.displayGeo, this.displayMat);
    scene.add(this.displayMesh);
  }

  private initPostProcessing(ctx: SimulationContext) {
    this.composer = new EffectComposer(ctx.renderer, {
      frameBufferType: THREE.HalfFloatType,
    });

    this.composer.addPass(new RenderPass(ctx.scene, ctx.camera));

    this.bloomEffect = new BloomEffect({
      intensity: this.params.bloomStrength,
      luminanceThreshold: this.params.bloomThreshold,
      luminanceSmoothing: this.params.bloomRadius,
      mipmapBlur: true,
    });

    this.chromaticAberration = new ChromaticAberrationEffect({
      offset: new THREE.Vector2(this.params.chromaticAberration, this.params.chromaticAberration),
      radialModulation: true,
      modulationOffset: 0.15,
    });

    this.vignetteEffect = new VignetteEffect({
      darkness: this.params.vignetteDarkness,
      offset: 0.3,
    });

    this.noiseEffect = new NoiseEffect({
      blendFunction: BlendFunction.OVERLAY,
    });
    this.noiseEffect.blendMode.opacity.value = this.params.noiseIntensity;

    this.composer.addPass(new EffectPass(
      ctx.camera,
      this.bloomEffect,
      this.chromaticAberration,
      this.vignetteEffect,
      this.noiseEffect,
    ));
  }

  /* ─── GUI ─── */

  private applyParams() {
    const p = this.params;
    const cu = this.chemVar.material.uniforms;

    cu.uFeedRate.value = p.feedRate;
    cu.uKillRate.value = p.killRate;
    cu.uDiffusionU.value = p.diffusionU;
    cu.uDiffusionV.value = p.diffusionV;
    cu.uTimestep.value = p.timestep;

    const mu = this.displayMat.uniforms;
    (mu.uColor1.value as THREE.Color).set(p.color1);
    (mu.uColor2.value as THREE.Color).set(p.color2);
    (mu.uColor3.value as THREE.Color).set(p.color3);
    (mu.uColor4.value as THREE.Color).set(p.color4);
    mu.uBrightness.value = p.brightness;

    this.bloomEffect.intensity = p.bloomStrength;
    this.bloomEffect.luminanceMaterial.threshold = p.bloomThreshold;
    this.bloomEffect.luminanceMaterial.smoothing = p.bloomRadius;
    this.chromaticAberration.offset.set(p.chromaticAberration, p.chromaticAberration);
    this.vignetteEffect.darkness = p.vignetteDarkness;
    this.noiseEffect.blendMode.opacity.value = p.noiseIntensity;
  }

  private setupGUI(ctx: SimulationContext) {
    ctx.gui.add(this.params, 'preset', Object.keys(PRESETS)).name('Preset').onChange((name: string) => {
      Object.assign(this.params, PRESETS[name]);
      this.applyParams();
      ctx.gui.controllersRecursive().forEach(c => c.updateDisplay());
    });

    const chem = ctx.gui.addFolder('Chemistry');
    chem.add(this.params, 'feedRate', 0.0, 0.1, 0.0001).name('Feed Rate (f)').onChange((v: number) => {
      this.chemVar.material.uniforms.uFeedRate.value = v;
    });
    chem.add(this.params, 'killRate', 0.0, 0.1, 0.0001).name('Kill Rate (k)').onChange((v: number) => {
      this.chemVar.material.uniforms.uKillRate.value = v;
    });

    const sim = ctx.gui.addFolder('Simulation');
    sim.add(this.params, 'iterations', 1, 64, 1).name('Steps / Frame');
    sim.add(this.params, 'timestep', 0.1, 2.0, 0.1).name('Timestep').onChange((v: number) => {
      this.chemVar.material.uniforms.uTimestep.value = v;
    });
    sim.add(this.params, 'diffusionU', 0.0, 0.5, 0.001).name('Diffusion U').onChange((v: number) => {
      this.chemVar.material.uniforms.uDiffusionU.value = v;
    });
    sim.add(this.params, 'diffusionV', 0.0, 0.25, 0.001).name('Diffusion V').onChange((v: number) => {
      this.chemVar.material.uniforms.uDiffusionV.value = v;
    });
    sim.add(this.params, 'brushRadius', 0.005, 0.1, 0.005).name('Brush Radius');

    const look = ctx.gui.addFolder('Appearance');
    look.addColor(this.params, 'color1').name('Background').onChange((v: string) => {
      (this.displayMat.uniforms.uColor1.value as THREE.Color).set(v);
    });
    look.addColor(this.params, 'color2').name('Low V').onChange((v: string) => {
      (this.displayMat.uniforms.uColor2.value as THREE.Color).set(v);
    });
    look.addColor(this.params, 'color3').name('Mid V').onChange((v: string) => {
      (this.displayMat.uniforms.uColor3.value as THREE.Color).set(v);
    });
    look.addColor(this.params, 'color4').name('High V').onChange((v: string) => {
      (this.displayMat.uniforms.uColor4.value as THREE.Color).set(v);
    });
    look.add(this.params, 'brightness', 0.1, 3.0, 0.05).name('Brightness').onChange((v: number) => {
      this.displayMat.uniforms.uBrightness.value = v;
    });

    const pp = ctx.gui.addFolder('Post Processing');
    pp.add(this.params, 'bloomStrength', 0, 2, 0.05).name('Bloom Strength').onChange((v: number) => {
      this.bloomEffect.intensity = v;
    });
    pp.add(this.params, 'bloomRadius', 0, 1, 0.05).name('Bloom Smoothing').onChange((v: number) => {
      this.bloomEffect.luminanceMaterial.smoothing = v;
    });
    pp.add(this.params, 'bloomThreshold', 0, 1, 0.05).name('Bloom Threshold').onChange((v: number) => {
      this.bloomEffect.luminanceMaterial.threshold = v;
    });
    pp.add(this.params, 'chromaticAberration', 0, 0.3, 0.005).name('Chromatic Aberration').onChange((v: number) => {
      this.chromaticAberration.offset.set(v, v);
    });
    pp.add(this.params, 'vignetteDarkness', 0, 1, 0.05).name('Vignette').onChange((v: number) => {
      this.vignetteEffect.darkness = v;
    });
    pp.add(this.params, 'noiseIntensity', 0, 0.15, 0.005).name('Film Grain').onChange((v: number) => {
      this.noiseEffect.blendMode.opacity.value = v;
    });
  }
}
