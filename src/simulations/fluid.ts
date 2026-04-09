import * as THREE from 'three';
import type { Simulation, SimulationContext } from '../simulation';
import { addPresetControl } from '../shared/preset';
import { createPostProcessing, type PostProcessingResult } from '../shared/post-processing';
import computeVert from './shaders/fluid/compute.vert.glsl?raw';
import splatFrag from './shaders/fluid/splat.frag.glsl?raw';
import advectFrag from './shaders/fluid/advect.frag.glsl?raw';
import divergenceFrag from './shaders/fluid/divergence.frag.glsl?raw';
import pressureFrag from './shaders/fluid/pressure.frag.glsl?raw';
import gradientSubFrag from './shaders/fluid/gradient-sub.frag.glsl?raw';
import curlFrag from './shaders/fluid/curl.frag.glsl?raw';
import vorticityFrag from './shaders/fluid/vorticity.frag.glsl?raw';
import clearFrag from './shaders/fluid/clear.frag.glsl?raw';
import displayVert from './shaders/fluid/display.vert.glsl?raw';
import displayFrag from './shaders/fluid/display.frag.glsl?raw';

const SIM_SIZE = 512;
const PLANE_SIZE = 20;
const PRESSURE_CLEAR_DISSIPATION = 0.8;

// ────────────────────────────── Double FBO ──────────────────────────────

class DoubleFBO {
  read: THREE.WebGLRenderTarget;
  write: THREE.WebGLRenderTarget;

  constructor(size: number) {
    const opts: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
    };
    this.read = new THREE.WebGLRenderTarget(size, size, opts);
    this.write = new THREE.WebGLRenderTarget(size, size, opts);
  }

  swap() {
    [this.read, this.write] = [this.write, this.read];
  }

  dispose() {
    this.read.dispose();
    this.write.dispose();
  }
}

// ────────────────────────────── Presets ──────────────────────────────

type Params = FluidSimulation['params'];
type PresetValues = Partial<Omit<Params, 'preset'>>;

const PRESETS: Record<string, PresetValues> = {
  'Rainbow': {
    velocityDissipation: 0.98,
    dyeDissipation: 0.97,
    curlStrength: 30,
    pressureIterations: 20,
    splatRadius: 0.003,
    splatForce: 6000,
    colorSaturation: 0.8,
    backgroundColor: '#050510',
    brightness: 1.0,
    bloomStrength: 0.4,
    bloomThreshold: 0.3,
    bloomSmoothing: 0.5,
    chromaticAberration: 0.08,
    vignetteDarkness: 0.4,
    noiseIntensity: 0.015,
  },
  'Ink': {
    velocityDissipation: 0.99,
    dyeDissipation: 0.985,
    curlStrength: 15,
    pressureIterations: 30,
    splatRadius: 0.004,
    splatForce: 4000,
    colorSaturation: 0.6,
    backgroundColor: '#0a0a14',
    brightness: 0.8,
    bloomStrength: 0.2,
    bloomThreshold: 0.5,
    bloomSmoothing: 0.4,
    chromaticAberration: 0.03,
    vignetteDarkness: 0.5,
    noiseIntensity: 0.02,
  },
  'Neon': {
    velocityDissipation: 0.97,
    dyeDissipation: 0.96,
    curlStrength: 40,
    pressureIterations: 20,
    splatRadius: 0.005,
    splatForce: 8000,
    colorSaturation: 1.0,
    backgroundColor: '#000000',
    brightness: 1.4,
    bloomStrength: 0.8,
    bloomThreshold: 0.2,
    bloomSmoothing: 0.6,
    chromaticAberration: 0.15,
    vignetteDarkness: 0.3,
    noiseIntensity: 0.01,
  },
  'Smoke': {
    velocityDissipation: 0.995,
    dyeDissipation: 0.99,
    curlStrength: 10,
    pressureIterations: 25,
    splatRadius: 0.006,
    splatForce: 3000,
    colorSaturation: 0.15,
    backgroundColor: '#0a0a0a',
    brightness: 0.7,
    bloomStrength: 0.15,
    bloomThreshold: 0.6,
    bloomSmoothing: 0.3,
    chromaticAberration: 0.02,
    vignetteDarkness: 0.45,
    noiseIntensity: 0.03,
  },
};

// ────────────────────────────── Simulation ──────────────────────────────

export class FluidSimulation implements Simulation {
  name = 'Fluid';
  is2D = true;

  /* compute infrastructure */
  private computeScene!: THREE.Scene;
  private computeCamera!: THREE.OrthographicCamera;
  private computeQuad!: THREE.Mesh;

  /* render targets */
  private velocity!: DoubleFBO;
  private pressure!: DoubleFBO;
  private dye!: DoubleFBO;
  private divergenceRT!: THREE.WebGLRenderTarget;
  private curlRT!: THREE.WebGLRenderTarget;

  /* shader materials */
  private splatMat!: THREE.ShaderMaterial;
  private advectMat!: THREE.ShaderMaterial;
  private divergenceMat!: THREE.ShaderMaterial;
  private pressureMat!: THREE.ShaderMaterial;
  private gradientSubMat!: THREE.ShaderMaterial;
  private curlMat!: THREE.ShaderMaterial;
  private vorticityMat!: THREE.ShaderMaterial;
  private clearMat!: THREE.ShaderMaterial;

  /* display */
  private displayMesh!: THREE.Mesh;
  private displayMat!: THREE.ShaderMaterial;
  private displayGeo!: THREE.PlaneGeometry;

  /* post-processing */
  private pp!: PostProcessingResult;

  private ctx!: SimulationContext;
  private canvas!: HTMLCanvasElement;
  private raycaster = new THREE.Raycaster();

  /* pointer tracking */
  private pointerDown = false;
  private pointerUV = new THREE.Vector2(-1, -1);
  private pointerPrevUV = new THREE.Vector2(-1, -1);
  private pointerMoved = false;
  private pointerFirstMove = true;

  /* auto-splat */
  private autoSplatTimer = 0;

  /* bound handlers for cleanup */
  private boundPointerDown!: (e: PointerEvent) => void;
  private boundPointerMove!: (e: PointerEvent) => void;
  private boundPointerUp!: () => void;

  private params = {
    preset: 'Rainbow',
    velocityDissipation: 0.98,
    dyeDissipation: 0.97,
    curlStrength: 30,
    pressureIterations: 20,
    splatRadius: 0.003,
    splatForce: 6000,
    colorSaturation: 0.8,
    backgroundColor: '#050510',
    brightness: 1.0,
    bloomStrength: 0.4,
    bloomThreshold: 0.3,
    bloomSmoothing: 0.5,
    chromaticAberration: 0.08,
    vignetteDarkness: 0.4,
    noiseIntensity: 0.015,
  };

  /* ─── lifecycle ─── */

  setup(ctx: SimulationContext) {
    this.ctx = ctx;
    this.canvas = ctx.renderer.domElement;

    ctx.scene.background = new THREE.Color(0x000000);
    ctx.camera.position.set(0, 0, 18);
    ctx.camera.lookAt(0, 0, 0);
    ctx.camera.near = 0.1;
    ctx.camera.far = 100;
    ctx.camera.updateProjectionMatrix();

    this.initCompute();
    this.initRenderTargets(ctx.renderer);
    this.initMaterials();
    this.initDisplay(ctx.scene);
    this.initPostProcessing(ctx);
    this.setupPointerHandlers();
    this.setupGUI(ctx);

    this.addRandomSplats(5);
  }

  update(time: number, delta: number) {
    const dt = Math.min(delta, 1 / 30);
    const renderer = this.ctx.renderer;

    // Handle pointer input
    if (this.pointerDown && this.pointerMoved) {
      const dx = this.pointerUV.x - this.pointerPrevUV.x;
      const dy = this.pointerUV.y - this.pointerPrevUV.y;
      const force = this.params.splatForce;

      // Splat velocity
      this.splatTarget(renderer, this.velocity, this.pointerUV.x, this.pointerUV.y,
        dx * force, dy * force, 0);

      // Splat dye with cycling color
      const hue = (time * 0.1) % 1.0;
      const [r, g, b] = this.hslToRgb(hue, this.params.colorSaturation, 0.5);
      this.splatTarget(renderer, this.dye, this.pointerUV.x, this.pointerUV.y,
        r * 0.3, g * 0.3, b * 0.3);

      this.pointerMoved = false;
    }

    // Auto-splats to keep things moving
    this.autoSplatTimer -= dt;
    if (this.autoSplatTimer <= 0) {
      this.addRandomSplats(1);
      this.autoSplatTimer = 1.5 + Math.random() * 2.0;
    }

    // ── Fluid simulation steps ──

    // 1. Curl + vorticity confinement
    this.curlMat.uniforms.uVelocity.value = this.velocity.read.texture;
    this.renderPass(renderer, this.curlMat, this.curlRT);

    this.vorticityMat.uniforms.uVelocity.value = this.velocity.read.texture;
    this.vorticityMat.uniforms.uCurl.value = this.curlRT.texture;
    this.vorticityMat.uniforms.uStrength.value = this.params.curlStrength;
    this.vorticityMat.uniforms.uDt.value = dt;
    this.renderPass(renderer, this.vorticityMat, this.velocity.write);
    this.velocity.swap();

    // 2. Advect velocity
    this.advectMat.uniforms.uVelocity.value = this.velocity.read.texture;
    this.advectMat.uniforms.uSource.value = this.velocity.read.texture;
    this.advectMat.uniforms.uDt.value = dt;
    this.advectMat.uniforms.uDissipation.value = this.params.velocityDissipation;
    this.renderPass(renderer, this.advectMat, this.velocity.write);
    this.velocity.swap();

    // 3. Compute divergence
    this.divergenceMat.uniforms.uVelocity.value = this.velocity.read.texture;
    this.renderPass(renderer, this.divergenceMat, this.divergenceRT);

    // 4. Clear pressure (partial dissipation for better convergence)
    this.clearMat.uniforms.uTexture.value = this.pressure.read.texture;
    this.clearMat.uniforms.uDissipation.value = PRESSURE_CLEAR_DISSIPATION;
    this.renderPass(renderer, this.clearMat, this.pressure.write);
    this.pressure.swap();

    // 5. Pressure solve (Jacobi iterations)
    for (let i = 0; i < this.params.pressureIterations; i++) {
      this.pressureMat.uniforms.uPressure.value = this.pressure.read.texture;
      this.pressureMat.uniforms.uDivergence.value = this.divergenceRT.texture;
      this.renderPass(renderer, this.pressureMat, this.pressure.write);
      this.pressure.swap();
    }

    // 6. Gradient subtract (make velocity divergence-free)
    this.gradientSubMat.uniforms.uPressure.value = this.pressure.read.texture;
    this.gradientSubMat.uniforms.uVelocity.value = this.velocity.read.texture;
    this.renderPass(renderer, this.gradientSubMat, this.velocity.write);
    this.velocity.swap();

    // 7. Advect dye
    this.advectMat.uniforms.uVelocity.value = this.velocity.read.texture;
    this.advectMat.uniforms.uSource.value = this.dye.read.texture;
    this.advectMat.uniforms.uDt.value = dt;
    this.advectMat.uniforms.uDissipation.value = this.params.dyeDissipation;
    this.renderPass(renderer, this.advectMat, this.dye.write);
    this.dye.swap();

    // Update display texture
    this.displayMat.uniforms.tDye.value = this.dye.read.texture;
  }

  render() {
    this.pp.composer.render();
  }

  onResize(w: number, h: number) {
    this.pp.composer.setSize(w, h);
  }

  resetCamera(ctx: SimulationContext) {
    ctx.camera.position.set(0, 0, 18);
    ctx.camera.lookAt(0, 0, 0);
  }

  reset() {
    const renderer = this.ctx.renderer;
    for (const fbo of [this.velocity, this.pressure, this.dye]) {
      renderer.setRenderTarget(fbo.read);
      renderer.clear();
      renderer.setRenderTarget(fbo.write);
      renderer.clear();
    }
    renderer.setRenderTarget(this.divergenceRT);
    renderer.clear();
    renderer.setRenderTarget(this.curlRT);
    renderer.clear();
    renderer.setRenderTarget(null);

    this.addRandomSplats(5);
  }

  dispose() {
    this.velocity.dispose();
    this.pressure.dispose();
    this.dye.dispose();
    this.divergenceRT.dispose();
    this.curlRT.dispose();

    this.splatMat.dispose();
    this.advectMat.dispose();
    this.divergenceMat.dispose();
    this.pressureMat.dispose();
    this.gradientSubMat.dispose();
    this.curlMat.dispose();
    this.vorticityMat.dispose();
    this.clearMat.dispose();
    this.displayMat.dispose();
    this.displayGeo.dispose();
    this.pp.composer.dispose();

    this.canvas.removeEventListener('pointerdown', this.boundPointerDown);
    this.canvas.removeEventListener('pointermove', this.boundPointerMove);
    this.canvas.removeEventListener('pointerup', this.boundPointerUp);
    window.removeEventListener('pointerup', this.boundPointerUp);
  }

  /* ─── compute helpers ─── */

  private renderPass(
    renderer: THREE.WebGLRenderer,
    material: THREE.ShaderMaterial,
    target: THREE.WebGLRenderTarget,
  ) {
    this.computeQuad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(this.computeScene, this.computeCamera);
    renderer.setRenderTarget(null);
  }

  private splatTarget(
    renderer: THREE.WebGLRenderer,
    fbo: DoubleFBO,
    x: number, y: number,
    cr: number, cg: number, cb: number,
  ) {
    this.splatMat.uniforms.uTarget.value = fbo.read.texture;
    this.splatMat.uniforms.uPoint.value.set(x, y);
    this.splatMat.uniforms.uSplatColor.value.set(cr, cg, cb);
    this.splatMat.uniforms.uRadius.value = this.params.splatRadius;
    this.renderPass(renderer, this.splatMat, fbo.write);
    fbo.swap();
  }

  private addRandomSplats(count: number) {
    const renderer = this.ctx.renderer;
    for (let i = 0; i < count; i++) {
      const x = 0.15 + Math.random() * 0.7;
      const y = 0.15 + Math.random() * 0.7;
      const angle = Math.random() * Math.PI * 2;
      const speed = 200 + Math.random() * 400;
      const dx = Math.cos(angle) * speed;
      const dy = Math.sin(angle) * speed;

      // Velocity
      this.splatTarget(renderer, this.velocity, x, y, dx, dy, 0);

      // Colored dye
      const hue = Math.random();
      const [r, g, b] = this.hslToRgb(hue, this.params.colorSaturation, 0.5);
      this.splatTarget(renderer, this.dye, x, y, r * 0.3, g * 0.3, b * 0.3);
    }
  }

  /* ─── init ─── */

  private initCompute() {
    this.computeScene = new THREE.Scene();
    this.computeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geo = new THREE.PlaneGeometry(2, 2);
    this.computeQuad = new THREE.Mesh(geo);
    this.computeScene.add(this.computeQuad);
  }

  private initRenderTargets(renderer: THREE.WebGLRenderer) {
    this.velocity = new DoubleFBO(SIM_SIZE);
    this.pressure = new DoubleFBO(SIM_SIZE);
    this.dye = new DoubleFBO(SIM_SIZE);

    const opts: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
    };
    this.divergenceRT = new THREE.WebGLRenderTarget(SIM_SIZE, SIM_SIZE, opts);
    this.curlRT = new THREE.WebGLRenderTarget(SIM_SIZE, SIM_SIZE, opts);

    // Clear all targets
    for (const fbo of [this.velocity, this.pressure, this.dye]) {
      renderer.setRenderTarget(fbo.read);
      renderer.clear();
      renderer.setRenderTarget(fbo.write);
      renderer.clear();
    }
    renderer.setRenderTarget(null);
  }

  private initMaterials() {
    const texelSize = new THREE.Vector2(1 / SIM_SIZE, 1 / SIM_SIZE);

    const mat = (frag: string, uniforms: Record<string, { value: unknown }>) =>
      new THREE.ShaderMaterial({ vertexShader: computeVert, fragmentShader: frag, uniforms });

    this.splatMat = mat(splatFrag, {
      uTarget: { value: null },
      uPoint: { value: new THREE.Vector2() },
      uSplatColor: { value: new THREE.Vector3() },
      uRadius: { value: this.params.splatRadius },
    });

    this.advectMat = mat(advectFrag, {
      uVelocity: { value: null },
      uSource: { value: null },
      uTexelSize: { value: texelSize.clone() },
      uDt: { value: 0 },
      uDissipation: { value: 1 },
    });

    this.divergenceMat = mat(divergenceFrag, {
      uVelocity: { value: null },
      uTexelSize: { value: texelSize.clone() },
    });

    this.pressureMat = mat(pressureFrag, {
      uPressure: { value: null },
      uDivergence: { value: null },
      uTexelSize: { value: texelSize.clone() },
    });

    this.gradientSubMat = mat(gradientSubFrag, {
      uPressure: { value: null },
      uVelocity: { value: null },
      uTexelSize: { value: texelSize.clone() },
    });

    this.curlMat = mat(curlFrag, {
      uVelocity: { value: null },
      uTexelSize: { value: texelSize.clone() },
    });

    this.vorticityMat = mat(vorticityFrag, {
      uVelocity: { value: null },
      uCurl: { value: null },
      uTexelSize: { value: texelSize.clone() },
      uStrength: { value: this.params.curlStrength },
      uDt: { value: 0 },
    });

    this.clearMat = mat(clearFrag, {
      uTexture: { value: null },
      uDissipation: { value: 0.8 },
    });
  }

  private initDisplay(scene: THREE.Scene) {
    this.displayGeo = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE);
    this.displayMat = new THREE.ShaderMaterial({
      uniforms: {
        tDye: { value: null },
        uBrightness: { value: this.params.brightness },
        uBackground: { value: new THREE.Color(this.params.backgroundColor) },
      },
      vertexShader: displayVert,
      fragmentShader: displayFrag,
    });
    this.displayMesh = new THREE.Mesh(this.displayGeo, this.displayMat);
    scene.add(this.displayMesh);
  }

  private initPostProcessing(ctx: SimulationContext) {
    this.pp = createPostProcessing(ctx.renderer, ctx.scene, ctx.camera, {
      bloomStrength: this.params.bloomStrength,
      bloomThreshold: this.params.bloomThreshold,
      bloomSmoothing: this.params.bloomSmoothing,
      chromaticAberration: this.params.chromaticAberration,
      vignetteDarkness: this.params.vignetteDarkness,
      noiseIntensity: this.params.noiseIntensity,
    });
  }

  /* ─── pointer handling ─── */

  private setupPointerHandlers() {
    this.boundPointerDown = (e: PointerEvent) => {
      this.pointerDown = true;
      this.pointerFirstMove = true;
      this.updatePointerUV(e);
    };

    this.boundPointerMove = (e: PointerEvent) => {
      if (!this.pointerDown) return;
      this.pointerPrevUV.copy(this.pointerUV);
      this.updatePointerUV(e);
      if (this.pointerFirstMove) {
        this.pointerPrevUV.copy(this.pointerUV);
        this.pointerFirstMove = false;
      }
      this.pointerMoved = true;
    };

    this.boundPointerUp = () => {
      this.pointerDown = false;
    };

    this.canvas.addEventListener('pointerdown', this.boundPointerDown);
    this.canvas.addEventListener('pointermove', this.boundPointerMove);
    this.canvas.addEventListener('pointerup', this.boundPointerUp);
    window.addEventListener('pointerup', this.boundPointerUp);
  }

  private updatePointerUV(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.ctx.camera);
    const hits = this.raycaster.intersectObject(this.displayMesh);
    if (hits.length > 0 && hits[0].uv) {
      this.pointerUV.set(hits[0].uv.x, hits[0].uv.y);
    }
  }

  /* ─── GUI ─── */

  private applyParams() {
    const p = this.params;
    this.displayMat.uniforms.uBrightness.value = p.brightness;
    (this.displayMat.uniforms.uBackground.value as THREE.Color).set(p.backgroundColor);

    this.pp.applyParams({
      bloomStrength: p.bloomStrength,
      bloomThreshold: p.bloomThreshold,
      bloomSmoothing: p.bloomSmoothing,
      chromaticAberration: p.chromaticAberration,
      vignetteDarkness: p.vignetteDarkness,
      noiseIntensity: p.noiseIntensity,
    });
  }

  private setupGUI(ctx: SimulationContext) {
    const { l } = ctx;

    addPresetControl(ctx.gui, this.params, PRESETS, () => this.applyParams(), l);

    const phys = ctx.gui.addFolder(l('Physics'));
    phys.add(this.params, 'velocityDissipation', 0.9, 1.0, 0.001).name(l('Vel. Dissipation'));
    phys.add(this.params, 'dyeDissipation', 0.9, 1.0, 0.001).name(l('Dye Dissipation'));
    phys.add(this.params, 'curlStrength', 0, 80, 1).name(l('Vorticity'));
    phys.add(this.params, 'pressureIterations', 5, 60, 1).name(l('Pressure Iters'));

    const brush = ctx.gui.addFolder(l('Brush'));
    brush.add(this.params, 'splatRadius', 0.001, 0.02, 0.0005).name(l('Radius'));
    brush.add(this.params, 'splatForce', 1000, 15000, 100).name(l('Force'));
    brush.add(this.params, 'colorSaturation', 0, 1, 0.05).name(l('Saturation'));

    const look = ctx.gui.addFolder(l('Appearance'));
    look.addColor(this.params, 'backgroundColor').name(l('Background')).onChange((v: string) => {
      (this.displayMat.uniforms.uBackground.value as THREE.Color).set(v);
    });
    look.add(this.params, 'brightness', 0.1, 3.0, 0.05).name(l('Brightness')).onChange((v: number) => {
      this.displayMat.uniforms.uBrightness.value = v;
    });

    const pp = ctx.gui.addFolder(l('Post Processing'));
    pp.add(this.params, 'bloomStrength', 0, 2, 0.05).name(l('Bloom Strength')).onChange((v: number) => {
      this.pp.bloomEffect.intensity = v;
    });
    pp.add(this.params, 'bloomSmoothing', 0, 1, 0.05).name(l('Bloom Smoothing')).onChange((v: number) => {
      this.pp.bloomEffect.luminanceMaterial.smoothing = v;
    });
    pp.add(this.params, 'bloomThreshold', 0, 1, 0.05).name(l('Bloom Threshold')).onChange((v: number) => {
      this.pp.bloomEffect.luminanceMaterial.threshold = v;
    });
    pp.add(this.params, 'chromaticAberration', 0, 0.5, 0.01).name(l('Chromatic Aberration')).onChange((v: number) => {
      this.pp.chromaticAberration.offset.set(v, v);
    });
    pp.add(this.params, 'vignetteDarkness', 0, 1, 0.05).name(l('Vignette')).onChange((v: number) => {
      this.pp.vignetteEffect.darkness = v;
    });
    pp.add(this.params, 'noiseIntensity', 0, 0.15, 0.005).name(l('Film Grain')).onChange((v: number) => {
      this.pp.noiseEffect.blendMode.opacity.value = v;
    });
  }

  /* ─── utilities ─── */

  private hslToRgb(h: number, s: number, l: number): [number, number, number] {
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
      const k = (n + h * 12) % 12;
      return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return [f(0), f(8), f(4)];
  }
}
