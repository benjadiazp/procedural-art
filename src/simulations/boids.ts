import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import { Pass } from 'postprocessing';
import type { Simulation, SimulationContext } from '../simulation';
import type { GPUVariable } from '../shared/types';
import { addPresetControl } from '../shared/preset';
import { createPostProcessing, type PostProcessingResult } from '../shared/post-processing';
import { injectDefines } from '../shared/glsl-utils';
import velocityShaderRaw from './shaders/boids/velocity.frag.glsl?raw';
import positionShader from './shaders/boids/position.frag.glsl?raw';
import pointVert from './shaders/boids/point.vert.glsl?raw';
import pointFrag from './shaders/boids/point.frag.glsl?raw';
import afterimageVS from './shaders/boids/afterimage.vert.glsl?raw';

// Texture dimensions — total capacity = TEX_WIDTH * TEX_HEIGHT
const TEX_WIDTH = 1024;
const TEX_HEIGHT = 512;
const MAX_BOIDS = TEX_WIDTH * TEX_HEIGHT; // 524 288
const MAX_PREDATORS = 8;
const OFFSCREEN_POS = 99999;

const velocityShader = injectDefines(velocityShaderRaw, { MAX_PREDATORS });

// ────────────────────────────── Presets ──────────────────────────────

type Params = BoidsSimulation['params'];
type PresetValues = Partial<Omit<Params, 'preset'>>;

const PRESETS: Record<string, PresetValues> = {
  'Default': {
    count: 100_000, predatorCount: 3,
    separationWeight: 1.8, alignmentWeight: 1.0, cohesionWeight: 0.6,
    speed: 10, predatorSpeed: 0.4,
    perceptionRadius: 8, separationRadius: 3, fleeRadius: 15,
    boundarySize: 200, pointSize: 1.5, brightness: 0.35,
    colorSlow: '#3366cc', colorFast: '#ff6622', predatorColor: '#ff00ff',
    bloomStrength: 0.8, bloomRadius: 0.5, bloomThreshold: 0.35, afterimage: 0.7,
    chromaticAberration: 0.0, vignetteDarkness: 0.45, noiseIntensity: 0.03,
  },
  'Murmuration': {
    count: 200_000, predatorCount: 2,
    separationWeight: 2.5, alignmentWeight: 2.0, cohesionWeight: 1.2,
    speed: 14, predatorSpeed: 0.3,
    perceptionRadius: 12, separationRadius: 2.5, fleeRadius: 25,
    boundarySize: 250, pointSize: 1.0, brightness: 0.25,
    colorSlow: '#112244', colorFast: '#aaccff', predatorColor: '#ff2200',
    bloomStrength: 0.6, bloomRadius: 0.6, bloomThreshold: 0.3, afterimage: 0.82,
    chromaticAberration: 0.0, vignetteDarkness: 0.4, noiseIntensity: 0.02,
  },
  'Chaos': {
    count: 150_000, predatorCount: 8,
    separationWeight: 0.8, alignmentWeight: 0.3, cohesionWeight: 0.2,
    speed: 20, predatorSpeed: 0.8,
    perceptionRadius: 6, separationRadius: 2, fleeRadius: 20,
    boundarySize: 180, pointSize: 1.2, brightness: 0.3,
    colorSlow: '#ff4400', colorFast: '#ffff00', predatorColor: '#00ffff',
    bloomStrength: 1.2, bloomRadius: 0.4, bloomThreshold: 0.2, afterimage: 0.5,
    chromaticAberration: 0.0, vignetteDarkness: 0.65, noiseIntensity: 0.06,
  },
  'Oceanic': {
    count: 300_000, predatorCount: 4,
    separationWeight: 1.5, alignmentWeight: 1.8, cohesionWeight: 0.4,
    speed: 6, predatorSpeed: 0.25,
    perceptionRadius: 10, separationRadius: 2, fleeRadius: 18,
    boundarySize: 300, pointSize: 1.0, brightness: 0.2,
    colorSlow: '#001133', colorFast: '#00ccff', predatorColor: '#ff0066',
    bloomStrength: 1.0, bloomRadius: 0.7, bloomThreshold: 0.25, afterimage: 0.88,
    chromaticAberration: 0.0, vignetteDarkness: 0.3, noiseIntensity: 0.02,
  },
  'Fireflies': {
    count: 50_000, predatorCount: 0,
    separationWeight: 3.0, alignmentWeight: 0.5, cohesionWeight: 0.3,
    speed: 5, predatorSpeed: 0.4,
    perceptionRadius: 6, separationRadius: 4, fleeRadius: 10,
    boundarySize: 250, pointSize: 2.5, brightness: 0.45,
    colorSlow: '#332200', colorFast: '#ffcc00', predatorColor: '#ff00ff',
    bloomStrength: 1.8, bloomRadius: 0.8, bloomThreshold: 0.15, afterimage: 0.6,
    chromaticAberration: 0.0, vignetteDarkness: 0.55, noiseIntensity: 0.04,
  },
  'Tight School': {
    count: 100_000, predatorCount: 5,
    separationWeight: 1.2, alignmentWeight: 2.5, cohesionWeight: 2.0,
    speed: 12, predatorSpeed: 0.5,
    perceptionRadius: 15, separationRadius: 2, fleeRadius: 30,
    boundarySize: 200, pointSize: 1.2, brightness: 0.3,
    colorSlow: '#003322', colorFast: '#33ff99', predatorColor: '#ff3300',
    bloomStrength: 0.7, bloomRadius: 0.5, bloomThreshold: 0.3, afterimage: 0.75,
    chromaticAberration: 0.0, vignetteDarkness: 0.4, noiseIntensity: 0.02,
  },
  'Nebula': {
    count: 400_000, predatorCount: 1,
    separationWeight: 1.0, alignmentWeight: 0.8, cohesionWeight: 0.8,
    speed: 4, predatorSpeed: 0.15,
    perceptionRadius: 10, separationRadius: 2, fleeRadius: 20,
    boundarySize: 350, pointSize: 0.8, brightness: 0.15,
    colorSlow: '#220044', colorFast: '#ff44cc', predatorColor: '#ffff00',
    bloomStrength: 1.4, bloomRadius: 0.9, bloomThreshold: 0.15, afterimage: 0.92,
    chromaticAberration: 0.0, vignetteDarkness: 0.5, noiseIntensity: 0.02,
  },
};

// ────────────────────────────── Afterimage Pass ──────────────────────────────

class AfterimagePass extends Pass {
  private feedbackTarget: THREE.WebGLRenderTarget;
  private blendMaterial: THREE.ShaderMaterial;
  private copyMaterial: THREE.ShaderMaterial;

  constructor(damp = 0.96, width = 1, height = 1) {
    super('Afterimage');

    this.feedbackTarget = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
    });

    this.blendMaterial = new THREE.ShaderMaterial({
      uniforms: {
        inputBuffer: { value: null },
        tOld: { value: this.feedbackTarget.texture },
        damp: { value: damp },
      },
      vertexShader: afterimageVS,
      fragmentShader: /* glsl */ `
        uniform sampler2D inputBuffer;
        uniform sampler2D tOld;
        uniform float damp;
        varying vec2 vUv;
        void main() {
          vec4 texelNew = texture2D(inputBuffer, vUv);
          vec4 texelOld = texture2D(tOld, vUv);
          gl_FragColor = max(texelNew, texelOld * damp);
        }
      `,
    });

    this.copyMaterial = new THREE.ShaderMaterial({
      uniforms: { inputBuffer: { value: null } },
      vertexShader: afterimageVS,
      fragmentShader: /* glsl */ `
        uniform sampler2D inputBuffer;
        varying vec2 vUv;
        void main() { gl_FragColor = texture2D(inputBuffer, vUv); }
      `,
    });

    this.fullscreenMaterial = this.blendMaterial;
  }

  get damp(): number {
    return this.blendMaterial.uniforms.damp.value;
  }

  set damp(value: number) {
    this.blendMaterial.uniforms.damp.value = value;
  }

  render(
    renderer: THREE.WebGLRenderer,
    inputBuffer: THREE.WebGLRenderTarget,
    outputBuffer: THREE.WebGLRenderTarget,
  ) {
    this.blendMaterial.uniforms.inputBuffer.value = inputBuffer.texture;
    this.blendMaterial.uniforms.tOld.value = this.feedbackTarget.texture;

    this.fullscreenMaterial = this.blendMaterial;
    renderer.setRenderTarget(outputBuffer);
    renderer.render(this.scene, this.camera);

    this.copyMaterial.uniforms.inputBuffer.value = outputBuffer.texture;
    this.fullscreenMaterial = this.copyMaterial;
    renderer.setRenderTarget(this.feedbackTarget);
    renderer.render(this.scene, this.camera);

    this.fullscreenMaterial = this.blendMaterial;
  }

  setSize(width: number, height: number) {
    this.feedbackTarget.setSize(width, height);
  }

  dispose() {
    super.dispose();
    this.feedbackTarget.dispose();
    this.blendMaterial.dispose();
    this.copyMaterial.dispose();
  }
}

// ────────────────────────────── Simulation ──────────────────────────────

export class BoidsSimulation implements Simulation {
  name = 'Boids';

  // GPU compute
  private gpuCompute!: GPUComputationRenderer;
  private posVar!: GPUVariable;
  private velVar!: GPUVariable;

  // Rendering
  private points!: THREE.Points;
  private ptMat!: THREE.ShaderMaterial;
  private ptGeo!: THREE.BufferGeometry;

  // Predators (CPU, passed as uniforms)
  private predPos: THREE.Vector3[] = [];
  private predMeshes: THREE.Mesh[] = [];
  private predGroup!: THREE.Group;
  private predGeom!: THREE.SphereGeometry;
  private predMat!: THREE.MeshBasicMaterial;

  // Post-processing
  private pp!: PostProcessingResult;
  private afterimagePass!: AfterimagePass;

  private ctx!: SimulationContext;

  private params = {
    preset: 'Default',
    count: 100_000,
    predatorCount: 3,
    separationWeight: 1.8,
    alignmentWeight: 1.0,
    cohesionWeight: 0.6,
    speed: 10.0,
    predatorSpeed: 0.4,
    perceptionRadius: 8.0,
    separationRadius: 3.0,
    fleeRadius: 15.0,
    boundarySize: 200,
    pointSize: 1.5,
    brightness: 0.35,
    colorSlow: '#3366cc',
    colorFast: '#ff6622',
    predatorColor: '#ff00ff',
    bloomStrength: 0.8,
    bloomRadius: 0.5,
    bloomThreshold: 0.35,
    afterimage: 0.7,
    chromaticAberration: 0.0,
    vignetteDarkness: 0.45,
    noiseIntensity: 0.03,
  };

  /* ─── lifecycle ─── */

  setup(ctx: SimulationContext) {
    this.ctx = ctx;

    ctx.scene.background = new THREE.Color(0x000408);
    ctx.scene.add(new THREE.AmbientLight(0xffffff, 1));

    ctx.camera.position.set(0, 100, 250);
    ctx.camera.lookAt(0, 0, 0);
    ctx.camera.far = 1200;
    ctx.camera.updateProjectionMatrix();

    this.initPredators(ctx.scene);
    this.initGPUCompute(ctx.renderer);
    this.initPoints(ctx.scene);
    this.initPostProcessing(ctx);
    this.setupGUI(ctx);
  }

  update(time: number, delta: number) {
    const dt = Math.min(delta, 1 / 15);

    // Predator orbits (Lissajous)
    this.updatePredators(time);

    // GPU compute
    const vu = this.velVar.material.uniforms;
    const pu = this.posVar.material.uniforms;
    vu.uDelta.value = dt;
    vu.uTime.value = time;
    pu.uDelta.value = dt;
    this.gpuCompute.compute();

    // Feed result textures to point material
    const u = this.ptMat.uniforms;
    u.tPosition.value = this.gpuCompute.getCurrentRenderTarget(this.posVar).texture;
    u.tVelocity.value = this.gpuCompute.getCurrentRenderTarget(this.velVar).texture;
  }

  render() {
    this.pp.composer.render();
  }

  onResize(w: number, h: number) {
    this.pp.composer.setSize(w, h);
    this.afterimagePass.setSize(w, h);
  }

  resetCamera(ctx: SimulationContext) {
    ctx.camera.position.set(0, 100, 250);
    ctx.camera.lookAt(0, 0, 0);
  }

  reset() {
    this.gpuCompute.dispose();
    this.initGPUCompute(this.ctx.renderer);
  }

  dispose() {
    this.gpuCompute.dispose();
    this.ptGeo.dispose();
    this.ptMat.dispose();
    this.predGeom.dispose();
    this.predMat.dispose();
    this.pp.composer.dispose();
  }

  /* ─── init helpers ─── */

  private initPredators(scene: THREE.Scene) {
    this.predGeom = new THREE.SphereGeometry(0.8, 8, 8);
    this.predMat = new THREE.MeshBasicMaterial({ color: this.params.predatorColor });
    this.predGroup = new THREE.Group();
    scene.add(this.predGroup);

    for (let i = 0; i < MAX_PREDATORS; i++) {
      this.predPos.push(new THREE.Vector3(OFFSCREEN_POS, OFFSCREEN_POS, OFFSCREEN_POS));
      const m = new THREE.Mesh(this.predGeom, this.predMat);
      m.visible = false;
      this.predMeshes.push(m);
      this.predGroup.add(m);
    }
  }

  private initGPUCompute(renderer: THREE.WebGLRenderer) {
    this.gpuCompute = new GPUComputationRenderer(TEX_WIDTH, TEX_HEIGHT, renderer);

    const dtPos = this.gpuCompute.createTexture();
    const dtVel = this.gpuCompute.createTexture();
    this.fillPosition(dtPos);
    this.fillVelocity(dtVel);

    this.posVar = this.gpuCompute.addVariable('texturePosition', positionShader, dtPos);
    this.velVar = this.gpuCompute.addVariable('textureVelocity', velocityShader, dtVel);

    this.gpuCompute.setVariableDependencies(this.posVar, [this.posVar, this.velVar]);
    this.gpuCompute.setVariableDependencies(this.velVar, [this.posVar, this.velVar]);

    // position uniforms
    const pu = this.posVar.material.uniforms;
    pu.uDelta = { value: 0 };
    pu.uActiveCount = { value: this.params.count };

    // velocity uniforms
    const vu = this.velVar.material.uniforms;
    vu.uDelta = { value: 0 };
    vu.uTime = { value: 0 };
    vu.uActiveCount = { value: this.params.count };
    vu.uSeparationWeight = { value: this.params.separationWeight };
    vu.uAlignmentWeight = { value: this.params.alignmentWeight };
    vu.uCohesionWeight = { value: this.params.cohesionWeight };
    vu.uMaxSpeed = { value: this.params.speed };
    vu.uPerceptionRadius = { value: this.params.perceptionRadius };
    vu.uSeparationRadius = { value: this.params.separationRadius };
    vu.uBoundarySize = { value: this.params.boundarySize };
    vu.uPredatorCount = { value: this.params.predatorCount };
    vu.uPredators = { value: this.predPos };
    vu.uFleeRadius = { value: this.params.fleeRadius };

    const err = this.gpuCompute.init();
    if (err) console.error('GPUCompute init error:', err);
  }

  private fillPosition(tex: THREE.DataTexture) {
    const d = tex.image.data as Float32Array;
    const r = this.params.boundarySize * 0.6;
    for (let i = 0; i < d.length; i += 4) {
      d[i]     = (Math.random() - 0.5) * 2 * r;
      d[i + 1] = (Math.random() - 0.5) * 2 * r;
      d[i + 2] = (Math.random() - 0.5) * 2 * r;
      d[i + 3] = 1;
    }
  }

  private fillVelocity(tex: THREE.DataTexture) {
    const d = tex.image.data as Float32Array;
    const s = this.params.speed;
    for (let i = 0; i < d.length; i += 4) {
      const vx = Math.random() - 0.5;
      const vy = Math.random() - 0.5;
      const vz = Math.random() - 0.5;
      const len = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
      d[i]     = (vx / len) * s * 0.5;
      d[i + 1] = (vy / len) * s * 0.5;
      d[i + 2] = (vz / len) * s * 0.5;
      d[i + 3] = 1;
    }
  }

  private initPoints(scene: THREE.Scene) {
    this.ptGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(MAX_BOIDS * 3);
    const ref = new Float32Array(MAX_BOIDS * 2);
    for (let i = 0; i < MAX_BOIDS; i++) {
      ref[i * 2]     = i % TEX_WIDTH;
      ref[i * 2 + 1] = Math.floor(i / TEX_WIDTH);
    }
    this.ptGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.ptGeo.setAttribute('reference', new THREE.BufferAttribute(ref, 2));
    this.ptGeo.setDrawRange(0, this.params.count);

    this.ptMat = new THREE.ShaderMaterial({
      uniforms: {
        tPosition:  { value: null },
        tVelocity:  { value: null },
        uPointSize: { value: this.params.pointSize },
        uMaxSpeed:  { value: this.params.speed },
        uActiveCount: { value: this.params.count },
        uTexRes:    { value: new THREE.Vector2(TEX_WIDTH, TEX_HEIGHT) },
        uColorSlow: { value: new THREE.Color(this.params.colorSlow) },
        uColorFast: { value: new THREE.Color(this.params.colorFast) },
        uBrightness: { value: this.params.brightness },
      },
      vertexShader: pointVert,
      fragmentShader: pointFrag,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.points = new THREE.Points(this.ptGeo, this.ptMat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  private initPostProcessing(ctx: SimulationContext) {
    const w = ctx.renderer.domElement.clientWidth;
    const h = ctx.renderer.domElement.clientHeight;

    this.pp = createPostProcessing(ctx.renderer, ctx.scene, ctx.camera, {
      bloomStrength: this.params.bloomStrength,
      bloomThreshold: this.params.bloomThreshold,
      bloomSmoothing: this.params.bloomRadius,
      chromaticAberration: this.params.chromaticAberration,
      vignetteDarkness: this.params.vignetteDarkness,
      noiseIntensity: this.params.noiseIntensity,
    }, {
      separateBloom: true,
      chromaModulationOffset: 0.2,
      vignetteOffset: 0.35,
      afterBloom: (composer) => {
        this.afterimagePass = new AfterimagePass(this.params.afterimage, w, h);
        composer.addPass(this.afterimagePass);
      },
    });
  }

  /* ─── predator motion ─── */

  private updatePredators(time: number) {
    const bs = this.params.boundarySize * 0.5;
    const sp = this.params.predatorSpeed;
    for (let i = 0; i < MAX_PREDATORS; i++) {
      if (i < this.params.predatorCount) {
        const ph = (i / MAX_PREDATORS) * Math.PI * 2;
        const a = 1.0 + (i % 3) * 0.3;
        const b = 1.3 + (i % 2) * 0.4;
        const c = 0.7 + (i % 4) * 0.2;
        this.predPos[i].set(
          bs * Math.sin(a * sp * time + ph),
          bs * 0.5 * Math.sin(b * sp * time + ph + 1.0),
          bs * Math.cos(c * sp * time + ph + 2.0),
        );
        this.predMeshes[i].position.copy(this.predPos[i]);
        this.predMeshes[i].visible = true;
      } else {
        this.predMeshes[i].visible = false;
        this.predPos[i].set(OFFSCREEN_POS, OFFSCREEN_POS, OFFSCREEN_POS);
      }
    }
  }

  /* ─── GUI ─── */

  private applyParams() {
    const p = this.params;
    const vu = this.velVar.material.uniforms;
    const pu = this.posVar.material.uniforms;
    const mu = this.ptMat.uniforms;

    // GPU compute uniforms
    pu.uActiveCount.value = p.count;
    vu.uActiveCount.value = p.count;
    vu.uSeparationWeight.value = p.separationWeight;
    vu.uAlignmentWeight.value = p.alignmentWeight;
    vu.uCohesionWeight.value = p.cohesionWeight;
    vu.uMaxSpeed.value = p.speed;
    vu.uPerceptionRadius.value = p.perceptionRadius;
    vu.uSeparationRadius.value = p.separationRadius;
    vu.uBoundarySize.value = p.boundarySize;
    vu.uPredatorCount.value = p.predatorCount;
    vu.uFleeRadius.value = p.fleeRadius;

    // Point material uniforms
    mu.uPointSize.value = p.pointSize;
    mu.uMaxSpeed.value = p.speed;
    mu.uActiveCount.value = p.count;
    mu.uBrightness.value = p.brightness;
    (mu.uColorSlow.value as THREE.Color).set(p.colorSlow);
    (mu.uColorFast.value as THREE.Color).set(p.colorFast);

    // Draw range
    this.ptGeo.setDrawRange(0, p.count);

    // Predators
    this.predMat.color.set(p.predatorColor);

    // Post-processing
    this.pp.applyParams({
      bloomStrength: p.bloomStrength,
      bloomThreshold: p.bloomThreshold,
      bloomSmoothing: p.bloomRadius,
      chromaticAberration: p.chromaticAberration,
      vignetteDarkness: p.vignetteDarkness,
      noiseIntensity: p.noiseIntensity,
    });
    this.afterimagePass.damp = p.afterimage;
  }

  private setupGUI(ctx: SimulationContext) {
    const { l } = ctx;
    const setVU = (name: string, v: number) => {
      this.velVar.material.uniforms[name].value = v;
    };

    addPresetControl(ctx.gui, this.params, PRESETS, () => this.applyParams(), l);

    const flock = ctx.gui.addFolder(l('Flock'));
    flock.add(this.params, 'count', 1000, MAX_BOIDS, 1000).name(l('Count')).onChange((v: number) => {
      this.posVar.material.uniforms.uActiveCount.value = v;
      setVU('uActiveCount', v);
      this.ptMat.uniforms.uActiveCount.value = v;
      this.ptGeo.setDrawRange(0, v);
    });
    flock.add(this.params, 'predatorCount', 0, MAX_PREDATORS, 1).name(l('Predators')).onChange((v: number) => {
      setVU('uPredatorCount', v);
    });

    const behavior = ctx.gui.addFolder(l('Behavior'));
    behavior.add(this.params, 'separationWeight', 0, 5, 0.1).name(l('Separation')).onChange((v: number) => setVU('uSeparationWeight', v));
    behavior.add(this.params, 'alignmentWeight', 0, 5, 0.1).name(l('Alignment')).onChange((v: number) => setVU('uAlignmentWeight', v));
    behavior.add(this.params, 'cohesionWeight', 0, 5, 0.1).name(l('Cohesion')).onChange((v: number) => setVU('uCohesionWeight', v));
    behavior.add(this.params, 'speed', 1, 25, 0.5).name(l('Speed')).onChange((v: number) => {
      setVU('uMaxSpeed', v);
      this.ptMat.uniforms.uMaxSpeed.value = v;
    });
    behavior.add(this.params, 'predatorSpeed', 0.1, 2, 0.05).name(l('Predator Speed'));
    behavior.add(this.params, 'perceptionRadius', 1, 15, 0.5).name(l('Perception')).onChange((v: number) => setVU('uPerceptionRadius', v));
    behavior.add(this.params, 'separationRadius', 0.5, 5, 0.1).name(l('Sep. Radius')).onChange((v: number) => setVU('uSeparationRadius', v));
    behavior.add(this.params, 'fleeRadius', 2, 30, 1).name(l('Flee Radius')).onChange((v: number) => setVU('uFleeRadius', v));

    const world = ctx.gui.addFolder(l('World'));
    world.add(this.params, 'boundarySize', 10, 400, 5).name(l('Boundary')).onChange((v: number) => setVU('uBoundarySize', v));

    const look = ctx.gui.addFolder(l('Appearance'));
    look.add(this.params, 'pointSize', 0.5, 5, 0.1).name(l('Point Size')).onChange((v: number) => {
      this.ptMat.uniforms.uPointSize.value = v;
    });
    look.add(this.params, 'brightness', 0.02, 0.5, 0.01).name(l('Brightness')).onChange((v: number) => {
      this.ptMat.uniforms.uBrightness.value = v;
    });
    look.addColor(this.params, 'colorSlow').name(l('Slow Color')).onChange((v: string) => {
      (this.ptMat.uniforms.uColorSlow.value as THREE.Color).set(v);
    });
    look.addColor(this.params, 'colorFast').name(l('Fast Color')).onChange((v: string) => {
      (this.ptMat.uniforms.uColorFast.value as THREE.Color).set(v);
    });
    look.addColor(this.params, 'predatorColor').name(l('Predator Color')).onChange((v: string) => {
      this.predMat.color.set(v);
    });

    const pp = ctx.gui.addFolder(l('Post Processing'));
    pp.add(this.params, 'bloomStrength', 0, 3, 0.05).name(l('Bloom Strength')).onChange((v: number) => {
      this.pp.bloomEffect.intensity = v;
    });
    pp.add(this.params, 'bloomRadius', 0, 1, 0.05).name(l('Bloom Smoothing')).onChange((v: number) => {
      this.pp.bloomEffect.luminanceMaterial.smoothing = v;
    });
    pp.add(this.params, 'bloomThreshold', 0, 1, 0.05).name(l('Bloom Threshold')).onChange((v: number) => {
      this.pp.bloomEffect.luminanceMaterial.threshold = v;
    });
    pp.add(this.params, 'afterimage', 0, 0.99, 0.01).name(l('Afterimage')).onChange((v: number) => {
      this.afterimagePass.damp = v;
    });
    pp.add(this.params, 'chromaticAberration', 0, 0.3, 0.005).name(l('Chromatic Aberration')).onChange((v: number) => {
      this.pp.chromaticAberration.offset.set(v, v);
    });
    pp.add(this.params, 'vignetteDarkness', 0, 1, 0.05).name(l('Vignette')).onChange((v: number) => {
      this.pp.vignetteEffect.darkness = v;
    });
    pp.add(this.params, 'noiseIntensity', 0, 0.2, 0.005).name(l('Film Grain')).onChange((v: number) => {
      this.pp.noiseEffect.blendMode.opacity.value = v;
    });
  }
}
