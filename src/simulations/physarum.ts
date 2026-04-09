import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { Simulation, SimulationContext, SimulationClickEvent } from '../simulation';
import type { GPUVariable } from '../shared/types';
import { addPresetControl } from '../shared/preset';
import agentShader from './shaders/physarum/agent.frag.glsl?raw';
import trailShader from './shaders/physarum/trail.frag.glsl?raw';
import depositVert from './shaders/physarum/deposit.vert.glsl?raw';
import depositFrag from './shaders/physarum/deposit.frag.glsl?raw';
import displayVert from './shaders/physarum/display.vert.glsl?raw';
import displayFrag from './shaders/physarum/display.frag.glsl?raw';

const SIM_SIZE = 512;
const MAX_AGENTS = SIM_SIZE * SIM_SIZE;
const PLANE_SIZE = 200;

// ────────────────────────────── Presets ──────────────────────────────

type Params = PhysarumSimulation['params'];
type PresetValues = Partial<Omit<Params, 'preset'>>;

const PRESETS: Record<string, PresetValues> = {
  'Default': {
    agentCount: 200_000,
    sensorAngle: 0.5, sensorDist: 9, turnSpeed: 0.3, moveSpeed: 1.0,
    depositAmount: 1.0, decayRate: 0.9, diffuseWeight: 0.5,
    brushRadius: 0.03, exposure: 0.2,
    color1: '#000000', color2: '#0a2a1a', color3: '#30b050', color4: '#e0ffe0',
    brightness: 1.5,
    bloomStrength: 0.5, bloomRadius: 0.4, bloomThreshold: 0.3,
  },
  'Tendrils': {
    agentCount: 150_000,
    sensorAngle: 0.25, sensorDist: 25, turnSpeed: 0.1, moveSpeed: 2.0,
    depositAmount: 0.8, decayRate: 0.95, diffuseWeight: 0.3,
    brushRadius: 0.03, exposure: 0.15,
    color1: '#050010', color2: '#2a0a4a', color3: '#9040d0', color4: '#e0c0ff',
    brightness: 1.6,
    bloomStrength: 0.6, bloomRadius: 0.5, bloomThreshold: 0.25,
  },
  'Dense Net': {
    agentCount: 250_000,
    sensorAngle: 0.8, sensorDist: 5, turnSpeed: 0.5, moveSpeed: 0.8,
    depositAmount: 2.0, decayRate: 0.85, diffuseWeight: 0.7,
    brushRadius: 0.02, exposure: 0.1,
    color1: '#000000', color2: '#3a2000', color3: '#d09020', color4: '#fff0c0',
    brightness: 1.4,
    bloomStrength: 0.4, bloomRadius: 0.3, bloomThreshold: 0.4,
  },
  'Spirals': {
    agentCount: 200_000,
    sensorAngle: 1.5, sensorDist: 15, turnSpeed: 1.0, moveSpeed: 1.5,
    depositAmount: 0.5, decayRate: 0.92, diffuseWeight: 0.4,
    brushRadius: 0.03, exposure: 0.25,
    color1: '#050000', color2: '#4a0a0a', color3: '#d03020', color4: '#ffc080',
    brightness: 1.5,
    bloomStrength: 0.5, bloomRadius: 0.5, bloomThreshold: 0.3,
  },
  'Veins': {
    agentCount: 180_000,
    sensorAngle: 0.4, sensorDist: 18, turnSpeed: 0.15, moveSpeed: 1.0,
    depositAmount: 1.5, decayRate: 0.93, diffuseWeight: 0.5,
    brushRadius: 0.03, exposure: 0.15,
    color1: '#000005', color2: '#0a1a3a', color3: '#2080c0', color4: '#c0e0ff',
    brightness: 1.5,
    bloomStrength: 0.5, bloomRadius: 0.4, bloomThreshold: 0.3,
  },
  'Smoke': {
    agentCount: 200_000,
    sensorAngle: 0.6, sensorDist: 7, turnSpeed: 0.4, moveSpeed: 1.0,
    depositAmount: 3.0, decayRate: 0.82, diffuseWeight: 0.8,
    brushRadius: 0.04, exposure: 0.08,
    color1: '#000000', color2: '#1a1a1a', color3: '#808080', color4: '#ffffff',
    brightness: 1.3,
    bloomStrength: 0.8, bloomRadius: 0.6, bloomThreshold: 0.2,
  },
};

// ────────────────────────────── Simulation ──────────────────────────────

export class PhysarumSimulation implements Simulation {
  name = 'Physarum';

  // GPU compute (agents + trail)
  private gpuCompute!: GPUComputationRenderer;
  private agentVar!: GPUVariable;
  private trailVar!: GPUVariable;

  // Deposit rendering (agents → trail deposits via additive point rendering)
  private depositRT!: THREE.WebGLRenderTarget;
  private depositScene!: THREE.Scene;
  private depositCamera!: THREE.OrthographicCamera;
  private depositMat!: THREE.ShaderMaterial;
  private depositGeo!: THREE.BufferGeometry;

  // Display
  private displayMesh!: THREE.Mesh;
  private displayMat!: THREE.ShaderMaterial;
  private displayGeo!: THREE.PlaneGeometry;

  // Post-processing
  private composer!: EffectComposer;
  private bloomPass!: UnrealBloomPass;

  private ctx!: SimulationContext;
  private clearColor = new THREE.Color();

  private brushUV = new THREE.Vector2(-1, -1);
  private brushPending = false;

  private params = {
    preset: 'Default',
    agentCount: 200_000,
    sensorAngle: 0.5,
    sensorDist: 9,
    turnSpeed: 0.3,
    moveSpeed: 1.0,
    depositAmount: 1.0,
    decayRate: 0.9,
    diffuseWeight: 0.5,
    brushRadius: 0.03,
    exposure: 0.2,
    color1: '#000000',
    color2: '#0a2a1a',
    color3: '#30b050',
    color4: '#e0ffe0',
    brightness: 1.5,
    bloomStrength: 0.5,
    bloomRadius: 0.4,
    bloomThreshold: 0.3,
  };

  /* ─── lifecycle ─── */

  setup(ctx: SimulationContext) {
    this.ctx = ctx;

    ctx.scene.background = new THREE.Color(0x000000);

    ctx.camera.position.set(0, 0, 18);
    ctx.camera.lookAt(0, 0, 0);
    ctx.camera.near = 0.1;
    ctx.camera.far = 500;
    ctx.camera.updateProjectionMatrix();

    // 2D pan + zoom only (infinite tiling canvas)
    if (ctx.controls) {
      ctx.controls.enableRotate = false;
      ctx.controls.screenSpacePanning = true;
      ctx.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
      ctx.controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
      ctx.controls.minDistance = 2;
      ctx.controls.maxDistance = 300;
    }

    this.initGPUCompute(ctx.renderer);
    this.initDeposit();
    this.initDisplay(ctx.scene);
    this.initPostProcessing(ctx);
    this.setupGUI(ctx);
  }

  update(_time: number, _delta: number) {
    const renderer = this.ctx.renderer;

    // 1. Render agent deposits to deposit texture
    const agentTex = this.gpuCompute.getCurrentRenderTarget(this.agentVar).texture;
    this.depositMat.uniforms.tAgents.value = agentTex;

    renderer.getClearColor(this.clearColor);
    const oldAlpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(this.depositRT);
    renderer.clear();
    renderer.render(this.depositScene, this.depositCamera);
    renderer.setRenderTarget(null);
    renderer.setClearColor(this.clearColor, oldAlpha);

    // 2. Pass deposit texture to trail shader
    this.trailVar.material.uniforms.tDeposit.value = this.depositRT.texture;

    // 3. Handle brush
    const tu = this.trailVar.material.uniforms;
    if (this.brushPending) {
      tu.uBrush.value.set(this.brushUV.x, this.brushUV.y, this.params.brushRadius, 1.0);
      this.brushPending = false;
    } else {
      tu.uBrush.value.w = 0.0;
    }

    // 4. Run GPU compute (agents sense + move, trail blur + decay + deposit)
    this.agentVar.material.uniforms.uTime.value = _time;
    this.gpuCompute.compute();

    // 5. Update display texture
    this.displayMat.uniforms.tTrail.value =
      this.gpuCompute.getCurrentRenderTarget(this.trailVar).texture;
  }

  onClick(event: SimulationClickEvent) {
    const intersects = event.raycaster.intersectObject(this.displayMesh);
    if (intersects.length > 0 && intersects[0].uv) {
      const u = intersects[0].uv.x;
      const v = intersects[0].uv.y;
      this.brushUV.set(u - Math.floor(u), v - Math.floor(v));
      this.brushPending = true;
    }
  }

  render() {
    this.composer.render();
  }

  onResize(w: number, h: number) {
    this.composer.setSize(w, h);
    this.bloomPass.resolution.set(w, h);
  }

  resetCamera(ctx: SimulationContext) {
    ctx.camera.position.set(0, 0, 18);
    ctx.camera.lookAt(0, 0, 0);
    if (ctx.controls) ctx.controls.target.set(0, 0, 0);
  }

  reset() {
    this.gpuCompute.dispose();
    this.initGPUCompute(this.ctx.renderer);
  }

  dispose() {
    this.gpuCompute.dispose();
    this.depositRT.dispose();
    this.depositMat.dispose();
    this.depositGeo.dispose();
    this.displayMat.dispose();
    this.displayGeo.dispose();
    this.composer.dispose();
  }

  /* ─── init helpers ─── */

  private initGPUCompute(renderer: THREE.WebGLRenderer) {
    this.gpuCompute = new GPUComputationRenderer(SIM_SIZE, SIM_SIZE, renderer);

    // Agent texture: R=posX, G=posY, B=heading
    const dtAgent = this.gpuCompute.createTexture();
    this.fillAgents(dtAgent);

    // Trail texture: R=pheromone intensity
    const dtTrail = this.gpuCompute.createTexture();
    // Start with empty trail
    const td = dtTrail.image.data as Float32Array;
    for (let i = 0; i < td.length; i += 4) {
      td[i] = 0;
      td[i + 1] = 0;
      td[i + 2] = 0;
      td[i + 3] = 1;
    }

    this.agentVar = this.gpuCompute.addVariable('textureAgents', agentShader, dtAgent);
    this.trailVar = this.gpuCompute.addVariable('textureTrail', trailShader, dtTrail);

    // Agents read both textures; trail reads only itself (deposits come via uniform)
    this.gpuCompute.setVariableDependencies(this.agentVar, [this.agentVar, this.trailVar]);
    this.gpuCompute.setVariableDependencies(this.trailVar, [this.trailVar]);

    // Wrap for seamless edges
    this.agentVar.wrapS = THREE.RepeatWrapping;
    this.agentVar.wrapT = THREE.RepeatWrapping;
    this.trailVar.wrapS = THREE.RepeatWrapping;
    this.trailVar.wrapT = THREE.RepeatWrapping;

    // Agent uniforms
    const au = this.agentVar.material.uniforms;
    au.uSensorAngle = { value: this.params.sensorAngle };
    au.uSensorDist = { value: this.params.sensorDist };
    au.uTurnSpeed = { value: this.params.turnSpeed };
    au.uMoveSpeed = { value: this.params.moveSpeed };
    au.uActiveCount = { value: this.params.agentCount };
    au.uTime = { value: 0 };

    // Trail uniforms
    const tu = this.trailVar.material.uniforms;
    tu.tDeposit = { value: null };
    tu.uDecay = { value: this.params.decayRate };
    tu.uDiffuseWeight = { value: this.params.diffuseWeight };
    tu.uBrush = { value: new THREE.Vector4(-1, -1, 0.03, 0) };

    const err = this.gpuCompute.init();
    if (err) console.error('GPUCompute init error:', err);
  }

  private fillAgents(tex: THREE.DataTexture) {
    const d = tex.image.data as Float32Array;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.random();                      // posX (0-1)
      d[i + 1] = Math.random();                  // posY (0-1)
      d[i + 2] = Math.random() * Math.PI * 2.0;  // heading (radians)
      d[i + 3] = 1.0;
    }
  }

  private initDeposit() {
    // Render target for agent deposits
    this.depositRT = new THREE.WebGLRenderTarget(SIM_SIZE, SIM_SIZE, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      type: THREE.FloatType,
    });

    // Orthographic camera mapping 0-1 agent positions to the viewport
    this.depositCamera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.1, 10);
    this.depositCamera.position.z = 5;
    this.depositCamera.updateProjectionMatrix();

    // Points geometry with reference attribute
    this.depositGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(MAX_AGENTS * 3);
    const ref = new Float32Array(MAX_AGENTS * 2);
    for (let i = 0; i < MAX_AGENTS; i++) {
      ref[i * 2] = i % SIM_SIZE;
      ref[i * 2 + 1] = Math.floor(i / SIM_SIZE);
    }
    this.depositGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.depositGeo.setAttribute('reference', new THREE.BufferAttribute(ref, 2));
    this.depositGeo.setDrawRange(0, this.params.agentCount);

    this.depositMat = new THREE.ShaderMaterial({
      uniforms: {
        tAgents: { value: null },
        uAgentTexRes: { value: new THREE.Vector2(SIM_SIZE, SIM_SIZE) },
        uDepositAmount: { value: this.params.depositAmount },
      },
      vertexShader: depositVert,
      fragmentShader: depositFrag,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });

    const points = new THREE.Points(this.depositGeo, this.depositMat);
    points.frustumCulled = false;

    this.depositScene = new THREE.Scene();
    this.depositScene.add(points);
  }

  private initDisplay(scene: THREE.Scene) {
    this.displayGeo = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE);
    this.displayMat = new THREE.ShaderMaterial({
      uniforms: {
        tTrail: { value: null },
        uExposure: { value: this.params.exposure },
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
    const w = ctx.renderer.domElement.clientWidth;
    const h = ctx.renderer.domElement.clientHeight;

    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType });
    this.composer = new EffectComposer(ctx.renderer, rt);
    this.composer.addPass(new RenderPass(ctx.scene, ctx.camera));

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      this.params.bloomStrength,
      this.params.bloomRadius,
      this.params.bloomThreshold,
    );
    this.composer.addPass(this.bloomPass);
  }

  /* ─── GUI ─── */

  private applyParams() {
    const p = this.params;
    const au = this.agentVar.material.uniforms;
    const tu = this.trailVar.material.uniforms;
    const du = this.displayMat.uniforms;

    au.uSensorAngle.value = p.sensorAngle;
    au.uSensorDist.value = p.sensorDist;
    au.uTurnSpeed.value = p.turnSpeed;
    au.uMoveSpeed.value = p.moveSpeed;
    au.uActiveCount.value = p.agentCount;

    tu.uDecay.value = p.decayRate;
    tu.uDiffuseWeight.value = p.diffuseWeight;

    this.depositMat.uniforms.uDepositAmount.value = p.depositAmount;
    this.depositGeo.setDrawRange(0, p.agentCount);

    du.uExposure.value = p.exposure;
    (du.uColor1.value as THREE.Color).set(p.color1);
    (du.uColor2.value as THREE.Color).set(p.color2);
    (du.uColor3.value as THREE.Color).set(p.color3);
    (du.uColor4.value as THREE.Color).set(p.color4);
    du.uBrightness.value = p.brightness;

    this.bloomPass.strength = p.bloomStrength;
    this.bloomPass.radius = p.bloomRadius;
    this.bloomPass.threshold = p.bloomThreshold;
  }

  private setupGUI(ctx: SimulationContext) {
    const { l } = ctx;
    const setAU = (name: string, v: number) => {
      this.agentVar.material.uniforms[name].value = v;
    };

    addPresetControl(ctx.gui, this.params, PRESETS, () => this.applyParams(), l);

    const agents = ctx.gui.addFolder(l('Agents'));
    agents.add(this.params, 'agentCount', 10_000, MAX_AGENTS, 10_000).name(l('Count')).onChange((v: number) => {
      setAU('uActiveCount', v);
      this.depositGeo.setDrawRange(0, v);
    });
    agents.add(this.params, 'sensorAngle', 0.05, Math.PI, 0.01).name(l('Sensor Angle')).onChange((v: number) => setAU('uSensorAngle', v));
    agents.add(this.params, 'sensorDist', 1, 50, 0.5).name(l('Sensor Distance')).onChange((v: number) => setAU('uSensorDist', v));
    agents.add(this.params, 'turnSpeed', 0.01, 2.0, 0.01).name(l('Turn Speed')).onChange((v: number) => setAU('uTurnSpeed', v));
    agents.add(this.params, 'moveSpeed', 0.1, 5, 0.1).name(l('Move Speed')).onChange((v: number) => setAU('uMoveSpeed', v));

    const trail = ctx.gui.addFolder(l('Trail'));
    trail.add(this.params, 'depositAmount', 0.01, 5, 0.01).name(l('Deposit')).onChange((v: number) => {
      this.depositMat.uniforms.uDepositAmount.value = v;
    });
    trail.add(this.params, 'decayRate', 0.5, 0.99, 0.01).name(l('Decay')).onChange((v: number) => {
      this.trailVar.material.uniforms.uDecay.value = v;
    });
    trail.add(this.params, 'diffuseWeight', 0, 1, 0.05).name(l('Diffuse')).onChange((v: number) => {
      this.trailVar.material.uniforms.uDiffuseWeight.value = v;
    });
    trail.add(this.params, 'brushRadius', 0.005, 0.1, 0.005).name(l('Brush Radius'));

    const look = ctx.gui.addFolder(l('Appearance'));
    look.add(this.params, 'exposure', 0.01, 1.0, 0.01).name(l('Exposure')).onChange((v: number) => {
      this.displayMat.uniforms.uExposure.value = v;
    });
    look.addColor(this.params, 'color1').name(l('Background')).onChange((v: string) => {
      (this.displayMat.uniforms.uColor1.value as THREE.Color).set(v);
    });
    look.addColor(this.params, 'color2').name(l('Low')).onChange((v: string) => {
      (this.displayMat.uniforms.uColor2.value as THREE.Color).set(v);
    });
    look.addColor(this.params, 'color3').name(l('Mid')).onChange((v: string) => {
      (this.displayMat.uniforms.uColor3.value as THREE.Color).set(v);
    });
    look.addColor(this.params, 'color4').name(l('High')).onChange((v: string) => {
      (this.displayMat.uniforms.uColor4.value as THREE.Color).set(v);
    });
    look.add(this.params, 'brightness', 0.1, 3, 0.05).name(l('Brightness')).onChange((v: number) => {
      this.displayMat.uniforms.uBrightness.value = v;
    });

    const pp = ctx.gui.addFolder(l('Post Processing'));
    pp.add(this.params, 'bloomStrength', 0, 2, 0.05).name(l('Bloom Strength')).onChange((v: number) => {
      this.bloomPass.strength = v;
    });
    pp.add(this.params, 'bloomRadius', 0, 1, 0.05).name(l('Bloom Radius')).onChange((v: number) => {
      this.bloomPass.radius = v;
    });
    pp.add(this.params, 'bloomThreshold', 0, 1, 0.05).name(l('Bloom Threshold')).onChange((v: number) => {
      this.bloomPass.threshold = v;
    });
  }
}
