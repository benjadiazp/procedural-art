import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import GUI from 'lil-gui';
import type { Simulation, SimulationContext, SimulationClickEvent } from './simulation';
import { simulations } from './simulations';
import { configure2DControls, createClickHandler } from './shared/context';

export type { Simulation, SimulationContext, SimulationClickEvent };

export interface MountOptions {
  /** Name of the simulation to load (case-insensitive). Defaults to the first registered simulation. */
  simulation?: string;
  /** Show lil-gui parameter controls overlaid on the canvas. Default: false */
  showControls?: boolean;
  /** WebGL antialias. Default: true */
  antialias?: boolean;
  /** Optional label translations. Keys are the English label text; values are the translated text. */
  labels?: Record<string, string>;
}

export interface MountResult {
  /** Tear down the visualizer and remove all DOM elements from the container */
  destroy: () => void;
  /** Switch to a different simulation by name (case-insensitive) */
  setSimulation: (name: string) => void;
  /** List all available simulation names */
  getSimulationNames: () => string[];
}

let stylesInjected = false;

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .pa-embed-root {
      position: relative;
      overflow: hidden;
    }
    .pa-embed-root canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
    .pa-gui-wrap {
      position: absolute;
      top: 8px;
      right: 8px;
      z-index: 10;
    }
    .pa-gui-wrap .lil-gui {
      --background-color: rgba(10, 10, 10, 0.7);
      --text-color: #a09888;
      --title-background-color: transparent;
      --title-text-color: #5c5548;
      --widget-color: rgba(255, 255, 255, 0.05);
      --hover-color: rgba(255, 140, 50, 0.08);
      --focus-color: rgba(255, 140, 50, 0.12);
      --number-color: #f28c28;
      --string-color: #b8c97a;
      --font-family: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;
      --font-size: 10px;
      --input-font-size: 10px;
      --widget-border-radius: 6px;
      --widget-height: 24px;
    }
    .pa-gui-hidden {
      position: absolute;
      left: -9999px;
      visibility: hidden;
    }
  `;
  document.head.appendChild(style);
}

export function mount(container: HTMLElement, options: MountOptions = {}): MountResult {
  const { simulation: simName, showControls = false, antialias = true, labels } = options;
  const l = (key: string) => labels?.[key] ?? key;

  injectStyles();
  container.classList.add('pa-embed-root');

  // Canvas
  const canvas = document.createElement('canvas');
  container.appendChild(canvas);

  // GUI container (always created so simulations can add controls; hidden if showControls is false)
  const guiWrap = document.createElement('div');
  guiWrap.className = showControls ? 'pa-gui-wrap' : 'pa-gui-hidden';
  container.appendChild(guiWrap);

  // Renderer
  const renderer = new THREE.WebGLRenderer({ canvas, antialias });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(container.clientWidth, container.clientHeight);

  // Scene + Camera + Controls
  let scene = new THREE.Scene();
  let camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1000);
  let controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;

  // GUI
  let gui = new GUI({ container: guiWrap });
  gui.title('Parameters');

  // State
  let activeSim: Simulation | null = null;
  const timer = new THREE.Timer();
  timer.connect(document);
  let disposed = false;
  let animId: number | null = null;

  function loadSim(sim: Simulation) {
    if (activeSim) activeSim.dispose();
    gui.destroy();
    gui = new GUI({ container: guiWrap });
    gui.title(l('Parameters'));

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1000);
    controls.dispose();
    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;

    if (sim.is2D) {
      configure2DControls(controls);
    }

    const ctx: SimulationContext = { scene, camera, renderer, controls, gui, l };
    sim.setup(ctx);
    activeSim = sim;
  }

  // Click handling
  const onPointerDown = createClickHandler(canvas, () => camera, () => activeSim);
  canvas.addEventListener('pointerdown', onPointerDown);

  // Resize via ResizeObserver (no window listener needed)
  const ro = new ResizeObserver(() => {
    if (disposed) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    activeSim?.onResize?.(w, h);
  });
  ro.observe(container);

  // Animation loop
  function animate() {
    if (disposed) return;
    animId = requestAnimationFrame(animate);
    timer.update();
    const delta = timer.getDelta();
    const elapsed = timer.getElapsed();
    controls.update();
    if (activeSim) activeSim.update(elapsed, delta);
    if (activeSim?.render) {
      activeSim.render();
    } else {
      renderer.render(scene, camera);
    }
  }

  // Boot
  const targetSim = simName
    ? simulations.find(s => s.name.toLowerCase() === simName.toLowerCase())
    : simulations[0];
  if (targetSim) loadSim(targetSim);
  animate();

  return {
    destroy() {
      disposed = true;
      if (animId != null) cancelAnimationFrame(animId);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      activeSim?.dispose();
      timer.dispose();
      gui.destroy();
      controls.dispose();
      renderer.dispose();
      container.classList.remove('pa-embed-root');
      container.innerHTML = '';
    },
    setSimulation(name: string) {
      const sim = simulations.find(s => s.name.toLowerCase() === name.toLowerCase());
      if (sim) loadSim(sim);
    },
    getSimulationNames() {
      return simulations.map(s => s.name);
    },
  };
}
