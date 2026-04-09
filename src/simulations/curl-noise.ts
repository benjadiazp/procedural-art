import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';
import GUI from 'lil-gui';
import type { Simulation, SimulationContext } from '../simulation';

const TEX_WIDTH = 512;
const TEX_HEIGHT = 512;
const MAX_PARTICLES = TEX_WIDTH * TEX_HEIGHT; // 262 144

// ────────────────────────────── GLSL ──────────────────────────────

const curlNoiseGLSL = /* glsl */ `
// Simplex 3D noise + curl computation
vec3 mod289v3(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289v4(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289v4(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g, l.zxy);
  vec3 i2 = max(g, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289v3(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
  + i.y + vec4(0.0, i1.y, i2.y, 1.0))
  + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

vec3 curlNoise(vec3 p) {
  float e = 0.01;
  float n1, n2;
  vec3 curl;

  // ∂/∂y of noise_z - ∂/∂z of noise_y
  n1 = snoise(vec3(p.x, p.y + e, p.z));
  n2 = snoise(vec3(p.x, p.y - e, p.z));
  float dz_dy = (n1 - n2) / (2.0 * e);
  n1 = snoise(vec3(p.x, p.y, p.z + e));
  n2 = snoise(vec3(p.x, p.y, p.z - e));
  float dy_dz = (n1 - n2) / (2.0 * e);
  curl.x = dz_dy - dy_dz;

  // ∂/∂z of noise_x - ∂/∂x of noise_z
  n1 = snoise(vec3(p.x, p.y, p.z + e) + 100.0);
  n2 = snoise(vec3(p.x, p.y, p.z - e) + 100.0);
  float dx_dz = (n1 - n2) / (2.0 * e);
  n1 = snoise(vec3(p.x + e, p.y, p.z) + 100.0);
  n2 = snoise(vec3(p.x - e, p.y, p.z) + 100.0);
  float dz_dx = (n1 - n2) / (2.0 * e);
  curl.y = dx_dz - dz_dx;

  // ∂/∂x of noise_y - ∂/∂y of noise_x
  n1 = snoise(vec3(p.x + e, p.y, p.z) + 200.0);
  n2 = snoise(vec3(p.x - e, p.y, p.z) + 200.0);
  float dy_dx = (n1 - n2) / (2.0 * e);
  n1 = snoise(vec3(p.x, p.y + e, p.z) + 200.0);
  n2 = snoise(vec3(p.x, p.y - e, p.z) + 200.0);
  float dx_dy = (n1 - n2) / (2.0 * e);
  curl.z = dy_dx - dx_dy;

  return curl;
}
`;

const velocityShader = /* glsl */ `
${curlNoiseGLSL}

uniform float uDelta;
uniform float uTime;
uniform float uActiveCount;
uniform float uNoiseScale;
uniform float uNoiseSpeed;
uniform float uFlowStrength;
uniform float uDamping;
uniform float uBoundarySize;
uniform float uTurbulence;
uniform int uOctaves;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  float index = gl_FragCoord.y * resolution.x + gl_FragCoord.x;

  if (index >= uActiveCount) {
    gl_FragColor = texture2D(textureVelocity, uv);
    return;
  }

  vec3 pos = texture2D(texturePosition, uv).xyz;
  vec3 vel = texture2D(textureVelocity, uv).xyz;

  // Multi-octave curl noise
  vec3 noisePos = pos * uNoiseScale + vec3(0.0, 0.0, uTime * uNoiseSpeed);
  vec3 curl = vec3(0.0);
  float amplitude = 1.0;
  float frequency = 1.0;
  float totalAmp = 0.0;

  for (int i = 0; i < 4; i++) {
    if (i >= uOctaves) break;
    curl += curlNoise(noisePos * frequency) * amplitude;
    totalAmp += amplitude;
    amplitude *= uTurbulence;
    frequency *= 2.0;
  }
  curl /= totalAmp;

  // Apply curl force
  vec3 force = curl * uFlowStrength;

  // Soft boundary — push particles back toward center
  float dist = length(pos);
  if (dist > uBoundarySize * 0.7) {
    float overshoot = (dist - uBoundarySize * 0.7) / (uBoundarySize * 0.3);
    force -= normalize(pos) * overshoot * overshoot * uFlowStrength * 2.0;
  }

  vel += force * uDelta;
  vel *= (1.0 - uDamping * uDelta);

  // Speed cap
  float speed = length(vel);
  float maxSpeed = uFlowStrength * 2.0;
  if (speed > maxSpeed) vel *= maxSpeed / speed;

  gl_FragColor = vec4(vel, 1.0);
}
`;

const positionShader = /* glsl */ `
uniform float uDelta;
uniform float uActiveCount;
uniform float uBoundarySize;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  float index = gl_FragCoord.y * resolution.x + gl_FragCoord.x;
  vec4 posData = texture2D(texturePosition, uv);
  vec3 pos = posData.xyz;
  float life = posData.w;

  if (index >= uActiveCount) {
    gl_FragColor = vec4(pos, life);
    return;
  }

  vec3 vel = texture2D(textureVelocity, uv).xyz;
  pos += vel * uDelta;

  // Age the particle
  life -= uDelta;

  // Respawn if out of bounds or life expired
  if (life <= 0.0 || length(pos) > uBoundarySize * 1.2) {
    // Hash-based respawn position
    float seed = index * 1.37 + fract(uDelta * 100.0) * 4871.0;
    float phi = fract(sin(seed * 12.9898) * 43758.5453) * 6.2831853;
    float cosTheta = fract(sin(seed * 78.233) * 28001.8384) * 2.0 - 1.0;
    float sinTheta = sqrt(1.0 - cosTheta * cosTheta);
    float r = pow(fract(sin(seed * 45.164) * 17539.2947), 0.333) * uBoundarySize * 0.8;
    pos = vec3(sinTheta * cos(phi), sinTheta * sin(phi), cosTheta) * r;
    life = 3.0 + fract(sin(seed * 93.989) * 63841.1937) * 7.0;
  }

  gl_FragColor = vec4(pos, life);
}
`;

const pointVert = /* glsl */ `
uniform sampler2D tPosition;
uniform sampler2D tVelocity;
uniform float uPointSize;
uniform float uActiveCount;
uniform vec2 uTexRes;
uniform float uMaxSpeed;

attribute vec2 reference;

varying float vSpeed;
varying float vLife;
varying float vActive;

void main() {
  float idx = reference.y * uTexRes.x + reference.x;
  vActive = step(idx, uActiveCount - 1.0);

  vec2 uv = (reference + 0.5) / uTexRes;
  vec4 posData = texture2D(tPosition, uv);
  vec3 pos = posData.xyz;
  vLife = posData.w;
  vec3 vel = texture2D(tVelocity, uv).xyz;
  vSpeed = clamp(length(vel) / uMaxSpeed, 0.0, 1.0);

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  // Size attenuation
  float size = uPointSize * (300.0 / -mvPosition.z);
  gl_PointSize = vActive > 0.5 ? max(size, 0.5) : 0.0;
}
`;

const pointFrag = /* glsl */ `
uniform vec3 uColorSlow;
uniform vec3 uColorFast;
uniform float uOpacity;

varying float vSpeed;
varying float vLife;
varying float vActive;

void main() {
  if (vActive < 0.5) discard;

  // Soft circle
  vec2 center = gl_PointCoord - 0.5;
  float d = length(center);
  if (d > 0.5) discard;
  float alpha = smoothstep(0.5, 0.15, d);

  // Color by speed
  vec3 color = mix(uColorSlow, uColorFast, vSpeed);

  // Fade near end of life
  float lifeFade = smoothstep(0.0, 1.5, vLife);

  gl_FragColor = vec4(color, alpha * uOpacity * lifeFade);
}
`;

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

  private params: CurlParams = { ...PRESETS['Default'] };

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
    this.buildGUI(gui);
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

  private buildGUI(gui: GUI): void {
    const presetNames = Object.keys(PRESETS);

    const presetObj = { preset: 'Default' };
    gui.add(presetObj, 'preset', presetNames).name('Preset').onChange((name: string) => {
      const p = PRESETS[name];
      if (!p) return;
      Object.assign(this.params, p);
      gui.controllersRecursive().forEach((c) => c.updateDisplay());
    });

    const flow = gui.addFolder('Flow Field');
    flow.add(this.params, 'count', 10000, MAX_PARTICLES, 1000).name('Particles');
    flow.add(this.params, 'noiseScale', 0.05, 2.0, 0.01).name('Noise Scale');
    flow.add(this.params, 'noiseSpeed', 0.0, 0.5, 0.01).name('Noise Speed');
    flow.add(this.params, 'flowStrength', 0.5, 20.0, 0.1).name('Flow Strength');
    flow.add(this.params, 'damping', 0.0, 2.0, 0.01).name('Damping');
    flow.add(this.params, 'turbulence', 0.1, 1.0, 0.01).name('Turbulence');
    flow.add(this.params, 'octaves', 1, 4, 1).name('Octaves');
    flow.add(this.params, 'boundarySize', 3, 15, 0.5).name('Boundary');

    const appearance = gui.addFolder('Appearance');
    appearance.add(this.params, 'pointSize', 0.5, 6, 0.1).name('Point Size');
    appearance.addColor(this.params, 'colorSlow').name('Color (Slow)');
    appearance.addColor(this.params, 'colorFast').name('Color (Fast)');
    appearance.add(this.params, 'opacity', 0.1, 1, 0.01).name('Opacity');

    const post = gui.addFolder('Post Processing');
    post.add(this.params, 'bloomStrength', 0, 4, 0.05).name('Bloom Strength');
    post.add(this.params, 'bloomRadius', 0, 1, 0.01).name('Bloom Radius');
    post.add(this.params, 'bloomThreshold', 0, 1, 0.01).name('Bloom Threshold');
    post.add(this.params, 'afterimage', 0.8, 0.99, 0.005).name('Trail Persistence');
  }
}
