import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';
import GUI from 'lil-gui';
import type { Simulation, SimulationContext } from '../simulation';
import { addPresetControl } from '../shared/preset';
import curlNoiseGLSL from './shaders/curl-noise/curl-noise.glsl?raw';
import velocityShaderBase from './shaders/curl-noise/velocity.frag.glsl?raw';
import positionShader from './shaders/curl-noise/position.frag.glsl?raw';
import pointVert from './shaders/curl-noise/point.vert.glsl?raw';
import pointFrag from './shaders/curl-noise/point.frag.glsl?raw';

const TEX_WIDTH = 512;
const TEX_HEIGHT = 512;
const MAX_PARTICLES = TEX_WIDTH * TEX_HEIGHT; // 262 144

const velocityShader = curlNoiseGLSL + '\n' + velocityShaderBase;

// ────────────────────────────── Presets ──────────────────────────────
// ────────────────────────────── Presets ──────────────────────────────

interface CurlParams {
  count: number;
  noiseScale: number;
  noiseSpeed: number;
  flowStrength: number;
  damping: number;
  turbulence: number;
  octaves: number;
  boundarySize: number;
  pointSize: number;
  colorSlow: string;
  colorFast: string;
  opacity: number;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  afterimage: number;
}

const PRESETS: Record<string, CurlParams> = {
  'Default': {
    count: 150000,
    noiseScale: 0.35,
    noiseSpeed: 0.12,
    flowStrength: 4.0,
    damping: 0.5,
    turbulence: 0.55,
    octaves: 3,
    boundarySize: 8,
    pointSize: 1.4,
    colorSlow: '#331a00',
    colorFast: '#f28c28',
    opacity: 0.85,
    bloomStrength: 0.6,
    bloomRadius: 0.3,
    bloomThreshold: 0.35,
    afterimage: 0.92,
  },
  'Smoke': {
    count: 200000,
    noiseScale: 0.2,
    noiseSpeed: 0.05,
    flowStrength: 2.0,
    damping: 0.8,
    turbulence: 0.4,
    octaves: 4,
    boundarySize: 10,
    pointSize: 1.8,
    colorSlow: '#1a1a1a',
    colorFast: '#888888',
    opacity: 0.4,
    bloomStrength: 0.4,
    bloomRadius: 0.4,
    bloomThreshold: 0.4,
    afterimage: 0.96,
  },
  'Solar Wind': {
    count: 180000,
    noiseScale: 0.5,
    noiseSpeed: 0.25,
    flowStrength: 8.0,
    damping: 0.3,
    turbulence: 0.7,
    octaves: 3,
    boundarySize: 8,
    pointSize: 1.2,
    colorSlow: '#4a0505',
    colorFast: '#ffcc22',
    opacity: 0.9,
    bloomStrength: 0.8,
    bloomRadius: 0.4,
    bloomThreshold: 0.3,
    afterimage: 0.88,
  },
  'Deep Ocean': {
    count: 120000,
    noiseScale: 0.25,
    noiseSpeed: 0.08,
    flowStrength: 3.0,
    damping: 0.6,
    turbulence: 0.45,
    octaves: 3,
    boundarySize: 9,
    pointSize: 1.6,
    colorSlow: '#001122',
    colorFast: '#22aacc',
    opacity: 0.7,
    bloomStrength: 0.5,
    bloomRadius: 0.4,
    bloomThreshold: 0.35,
    afterimage: 0.94,
  },
  'Neon Storm': {
    count: 200000,
    noiseScale: 0.6,
    noiseSpeed: 0.3,
    flowStrength: 10.0,
    damping: 0.2,
    turbulence: 0.8,
    octaves: 2,
    boundarySize: 7,
    pointSize: 1.0,
    colorSlow: '#220044',
    colorFast: '#ff44ff',
    opacity: 1.0,
    bloomStrength: 1.0,
    bloomRadius: 0.3,
    bloomThreshold: 0.2,
    afterimage: 0.85,
  },
};

// ────────────────────────────── Simulation ──────────────────────────────

export class CurlNoiseSimulation implements Simulation {
  readonly name = 'Curl Noise';

  private ctx!: SimulationContext;
  private gpuCompute!: GPUComputationRenderer;
  private posVar!: ReturnType<GPUComputationRenderer['addVariable']>;
  private velVar!: ReturnType<GPUComputationRenderer['addVariable']>;
  private mesh!: THREE.Points;
  private material!: THREE.ShaderMaterial;
  private composer!: EffectComposer;
  private bloomPass!: UnrealBloomPass;
  private afterimagePass!: AfterimagePass;

  private params: CurlParams & { preset: string } = { preset: 'Default', ...PRESETS['Default'] };

  // ── Setup ──

  setup(ctx: SimulationContext): void {
    this.ctx = ctx;
    const { scene, camera, renderer, gui } = ctx;

    scene.background = new THREE.Color(0x050505);
    camera.position.set(0, 0, 18);
    camera.lookAt(0, 0, 0);

    this.initGPU(renderer);
    this.initParticles(scene);
    this.initPostProcessing(renderer, scene, camera);
    this.buildGUI(gui, ctx.l);
  }

  private initGPU(renderer: THREE.WebGLRenderer): void {
    const gpu = new GPUComputationRenderer(TEX_WIDTH, TEX_HEIGHT, renderer);
    this.gpuCompute = gpu;

    // Position texture — xyz + w (life)
    const posTex = gpu.createTexture();
    const velTex = gpu.createTexture();
    const posArr = posTex.image.data as Float32Array;
    const velArr = velTex.image.data as Float32Array;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const i4 = i * 4;
      // Spherical distribution
      const phi = Math.random() * Math.PI * 2;
      const cosTheta = Math.random() * 2 - 1;
      const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
      const r = Math.cbrt(Math.random()) * this.params.boundarySize * 0.8;

      posArr[i4] = sinTheta * Math.cos(phi) * r;
      posArr[i4 + 1] = sinTheta * Math.sin(phi) * r;
      posArr[i4 + 2] = cosTheta * r;
      posArr[i4 + 3] = 3 + Math.random() * 7; // life

      velArr[i4] = (Math.random() - 0.5) * 0.1;
      velArr[i4 + 1] = (Math.random() - 0.5) * 0.1;
      velArr[i4 + 2] = (Math.random() - 0.5) * 0.1;
      velArr[i4 + 3] = 1;
    }

    this.posVar = gpu.addVariable('texturePosition', positionShader, posTex);
    this.velVar = gpu.addVariable('textureVelocity', velocityShader, velTex);

    gpu.setVariableDependencies(this.posVar, [this.posVar, this.velVar]);
    gpu.setVariableDependencies(this.velVar, [this.posVar, this.velVar]);

    // Position uniforms
    const posU = this.posVar.material.uniforms;
    posU.uDelta = { value: 0 };
    posU.uActiveCount = { value: this.params.count };
    posU.uBoundarySize = { value: this.params.boundarySize };

    // Velocity uniforms
    const velU = this.velVar.material.uniforms;
    velU.uDelta = { value: 0 };
    velU.uTime = { value: 0 };
    velU.uActiveCount = { value: this.params.count };
    velU.uNoiseScale = { value: this.params.noiseScale };
    velU.uNoiseSpeed = { value: this.params.noiseSpeed };
    velU.uFlowStrength = { value: this.params.flowStrength };
    velU.uDamping = { value: this.params.damping };
    velU.uTurbulence = { value: this.params.turbulence };
    velU.uOctaves = { value: this.params.octaves };
    velU.uBoundarySize = { value: this.params.boundarySize };

    const err = gpu.init();
    if (err !== null) console.error('GPUComputationRenderer init error:', err);
  }

  private initParticles(scene: THREE.Scene): void {
    const geo = new THREE.BufferGeometry();
    const refs = new Float32Array(MAX_PARTICLES * 2);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const x = i % TEX_WIDTH;
      const y = Math.floor(i / TEX_WIDTH);
      refs[i * 2] = x;
      refs[i * 2 + 1] = y;
    }
    geo.setAttribute('reference', new THREE.BufferAttribute(refs, 2));

    // Dummy positions for bounding sphere
    const dummy = new Float32Array(MAX_PARTICLES * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(dummy, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1000);

    this.material = new THREE.ShaderMaterial({
      vertexShader: pointVert,
      fragmentShader: pointFrag,
      uniforms: {
        tPosition: { value: null },
        tVelocity: { value: null },
        uPointSize: { value: this.params.pointSize },
        uActiveCount: { value: this.params.count },
        uTexRes: { value: new THREE.Vector2(TEX_WIDTH, TEX_HEIGHT) },
        uMaxSpeed: { value: this.params.flowStrength * 2 },
        uColorSlow: { value: new THREE.Color(this.params.colorSlow) },
        uColorFast: { value: new THREE.Color(this.params.colorFast) },
        uOpacity: { value: this.params.opacity },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.mesh = new THREE.Points(geo, this.material);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  private initPostProcessing(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
  ): void {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      this.params.bloomStrength,
      this.params.bloomRadius,
      this.params.bloomThreshold,
    );
    this.composer.addPass(this.bloomPass);

    this.afterimagePass = new AfterimagePass(this.params.afterimage);
    this.composer.addPass(this.afterimagePass);
  }

  // ── Update ──

  update(time: number, delta: number): void {
    const dt = Math.min(delta, 0.05);

    const velU = this.velVar.material.uniforms;
    velU.uDelta.value = dt;
    velU.uTime.value = time;
    velU.uActiveCount.value = this.params.count;
    velU.uNoiseScale.value = this.params.noiseScale;
    velU.uNoiseSpeed.value = this.params.noiseSpeed;
    velU.uFlowStrength.value = this.params.flowStrength;
    velU.uDamping.value = this.params.damping;
    velU.uTurbulence.value = this.params.turbulence;
    velU.uOctaves.value = this.params.octaves;
    velU.uBoundarySize.value = this.params.boundarySize;

    const posU = this.posVar.material.uniforms;
    posU.uDelta.value = dt;
    posU.uActiveCount.value = this.params.count;
    posU.uBoundarySize.value = this.params.boundarySize;

    this.gpuCompute.compute();

    const mu = this.material.uniforms;
    mu.tPosition.value = this.gpuCompute.getCurrentRenderTarget(this.posVar).texture;
    mu.tVelocity.value = this.gpuCompute.getCurrentRenderTarget(this.velVar).texture;
    mu.uActiveCount.value = this.params.count;
    mu.uPointSize.value = this.params.pointSize;
    mu.uMaxSpeed.value = this.params.flowStrength * 2;
    mu.uColorSlow.value.set(this.params.colorSlow);
    mu.uColorFast.value.set(this.params.colorFast);
    mu.uOpacity.value = this.params.opacity;

    this.bloomPass.strength = this.params.bloomStrength;
    this.bloomPass.radius = this.params.bloomRadius;
    this.bloomPass.threshold = this.params.bloomThreshold;
    this.afterimagePass.uniforms['damp'].value = this.params.afterimage;
  }

  render(): void {
    this.composer.render();
  }

  onResize(width: number, height: number): void {
    this.composer.setSize(width, height);
    this.bloomPass.resolution.set(width, height);
  }

  resetCamera(ctx: SimulationContext): void {
    ctx.camera.position.set(0, 0, 18);
    ctx.camera.lookAt(0, 0, 0);
  }

  reset(): void {
    // Re-initialize GPU textures
    const { renderer } = this.ctx;
    this.gpuCompute.dispose();
    this.initGPU(renderer);
  }

  dispose(): void {
    this.ctx.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.gpuCompute.dispose();
    this.composer.dispose();
  }

  // ── GUI ──

  private buildGUI(gui: GUI, l: (key: string) => string): void {
    addPresetControl(gui, this.params, PRESETS, () => {/* params updated via Object.assign */}, l);

    const flow = gui.addFolder(l('Flow Field'));
    flow.add(this.params, 'count', 10000, MAX_PARTICLES, 1000).name(l('Particles'));
    flow.add(this.params, 'noiseScale', 0.05, 2.0, 0.01).name(l('Noise Scale'));
    flow.add(this.params, 'noiseSpeed', 0.0, 0.5, 0.01).name(l('Noise Speed'));
    flow.add(this.params, 'flowStrength', 0.5, 20.0, 0.1).name(l('Flow Strength'));
    flow.add(this.params, 'damping', 0.0, 2.0, 0.01).name(l('Damping'));
    flow.add(this.params, 'turbulence', 0.1, 1.0, 0.01).name(l('Turbulence'));
    flow.add(this.params, 'octaves', 1, 4, 1).name(l('Octaves'));
    flow.add(this.params, 'boundarySize', 3, 15, 0.5).name(l('Boundary'));

    const appearance = gui.addFolder(l('Appearance'));
    appearance.add(this.params, 'pointSize', 0.5, 6, 0.1).name(l('Point Size'));
    appearance.addColor(this.params, 'colorSlow').name(l('Color (Slow)'));
    appearance.addColor(this.params, 'colorFast').name(l('Color (Fast)'));
    appearance.add(this.params, 'opacity', 0.1, 1, 0.01).name(l('Opacity'));

    const post = gui.addFolder(l('Post Processing'));
    post.add(this.params, 'bloomStrength', 0, 4, 0.05).name(l('Bloom Strength'));
    post.add(this.params, 'bloomRadius', 0, 1, 0.01).name(l('Bloom Radius'));
    post.add(this.params, 'bloomThreshold', 0, 1, 0.01).name(l('Bloom Threshold'));
    post.add(this.params, 'afterimage', 0.8, 0.99, 0.005).name(l('Trail Persistence'));
  }
}
