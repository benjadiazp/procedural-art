import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import GUI from 'lil-gui';
import type { Simulation, SimulationContext, SimulationClickEvent } from './simulation';
import { simulations } from './simulations';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const listEl = document.getElementById('simulation-list')!;
const panel = document.getElementById('panel')!;
const menuToggle = document.getElementById('menu-toggle')!;
const panelClose = document.getElementById('panel-close')!;
const guiContainer = document.getElementById('gui-container')!;
const transitionOverlay = document.getElementById('transition-overlay')!;
const hintsEl = document.getElementById('hints')!;

// ── Simulation accent colors ──

const SIM_COLORS: Record<string, string> = {
  'Boids': '#f28c28',
  'Reaction-Diffusion': '#e05a30',
  'Curl Noise': '#f2a828',
  'Fluid': '#e03060',
};

// ── Interaction hints ──

const isTouch = matchMedia('(pointer: coarse)').matches;

const SIM_HINTS: Record<string, string> = {
  'Boids': isTouch
    ? 'Drag to orbit  \u00b7  Pinch to zoom'
    : 'Orbit: drag  \u00b7  Zoom: scroll  \u00b7  Fullscreen: F',
  'Reaction-Diffusion': isTouch
    ? 'Tap to seed  \u00b7  Drag to pan  \u00b7  Pinch to zoom'
    : 'Click to seed  \u00b7  Pan: drag  \u00b7  Zoom: scroll  \u00b7  Fullscreen: F',
  'Curl Noise': isTouch
    ? 'Drag to orbit  \u00b7  Pinch to zoom'
    : 'Orbit: drag  \u00b7  Zoom: scroll  \u00b7  Fullscreen: F',
  'Fluid': isTouch
    ? 'Drag to inject dye  \u00b7  Pinch to zoom'
    : 'Drag to inject dye  \u00b7  Zoom: scroll  \u00b7  Fullscreen: F',
};

let hintTimeout: ReturnType<typeof setTimeout> | null = null;

function showHints(simName: string) {
  const text = SIM_HINTS[simName];
  if (!text) return;
  hintsEl.textContent = text;
  hintsEl.classList.add('visible');
  if (hintTimeout) clearTimeout(hintTimeout);
  hintTimeout = setTimeout(() => {
    hintsEl.classList.remove('visible');
  }, 4000);
}

// ── Floating panel toggle ──

function togglePanel() {
  panel.classList.toggle('open');
  menuToggle.classList.toggle('hidden');
}

menuToggle.addEventListener('click', togglePanel);
panelClose.addEventListener('click', togglePanel);

// Start with panel open
panel.classList.add('open');
menuToggle.classList.add('hidden');

// ── Renderer ──

const isTest = new URLSearchParams(location.search).has('test');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: isTest });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(canvas.clientWidth, canvas.clientHeight);

// ── Scene + Camera ──

let scene = new THREE.Scene();
let camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
let controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

// ── GUI ──

let gui = new GUI({ container: guiContainer });
gui.title('Parameters');

// ── State ──

let activeSim: Simulation | null = null;
const clock = new THREE.Clock();
let isTransitioning = false;

// ── Generative Favicon ──

let faviconTimeout: ReturnType<typeof setTimeout> | null = null;

function scheduleFaviconUpdate() {
  if (faviconTimeout) clearTimeout(faviconTimeout);
  faviconTimeout = setTimeout(() => {
    requestAnimationFrame(() => {
      // Render one frame then capture
      if (activeSim?.render) {
        activeSim.render();
      } else {
        renderer.render(scene, camera);
      }

      const size = 32;
      const tmpCanvas = document.createElement('canvas');
      tmpCanvas.width = size;
      tmpCanvas.height = size;
      const ctx2d = tmpCanvas.getContext('2d')!;
      ctx2d.drawImage(canvas, 0, 0, size, size);

      let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = tmpCanvas.toDataURL('image/png');
    });
  }, 2000);
}

// ── Load Simulation ──

async function loadSimulation(sim: Simulation, skipTransition = false) {
  if (isTransitioning) return;

  // Update sidebar active state immediately
  listEl.querySelectorAll('li').forEach((li, i) => {
    li.classList.toggle('active', simulations[i] === sim);
  });

  if (!skipTransition && activeSim) {
    isTransitioning = true;
    transitionOverlay.classList.add('active');
    await new Promise(r => setTimeout(r, 300));
  }

  // Tear down previous
  if (activeSim) {
    activeSim.dispose();
  }
  gui.destroy();
  gui = new GUI({ container: guiContainer });
  gui.title('Parameters');

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
  controls.dispose();
  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;

  if (sim.is2D) {
    controls.enableRotate = false;
    controls.screenSpacePanning = true;
    controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
  }

  const ctx: SimulationContext = { scene, camera, renderer, controls, gui };
  sim.setup(ctx);
  activeSim = sim;

  // Actions folder
  const actions = gui.addFolder('Actions');
  actions.add({ resetCamera() { sim.resetCamera?.(ctx); controls.target.set(0, 0, 0); } }, 'resetCamera').name('Reset Camera');
  actions.add({ resetSimulation() { sim.reset?.(); } }, 'resetSimulation').name('Reset Simulation');

  // Show hints
  showHints(sim.name);

  // Update favicon
  scheduleFaviconUpdate();

  if (!skipTransition && isTransitioning) {
    transitionOverlay.classList.remove('active');
    await new Promise(r => setTimeout(r, 300));
    isTransitioning = false;
  }
}

// ── Build Sidebar List ──

simulations.forEach((sim) => {
  const li = document.createElement('li');
  li.textContent = sim.name;
  li.style.setProperty('--sim-color', SIM_COLORS[sim.name] ?? '#6e8efb');
  li.addEventListener('click', () => { loadSimulation(sim); });
  listEl.appendChild(li);
});

// ── Click Handling ──

const raycaster = new THREE.Raycaster();
canvas.addEventListener('pointerdown', (e) => {
  if (!activeSim?.onClick) return;
  const rect = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1,
  );
  raycaster.setFromCamera(ndc, camera);
  const event: SimulationClickEvent = { ndc, pointer: e, raycaster };
  activeSim.onClick(event);
});

// ── Resize ──

function onResize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  activeSim?.onResize?.(w, h);
}
window.addEventListener('resize', onResize);

// ── Fullscreen ──

document.addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }
});

// ── Render Loop ──

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  const elapsed = clock.getElapsedTime();
  controls.update();
  if (activeSim) {
    activeSim.update(elapsed, delta);
  }
  if (activeSim?.render) {
    activeSim.render();
  } else {
    renderer.render(scene, camera);
  }
}

// ── Boot ──

if (simulations.length > 0) {
  loadSimulation(simulations[0], true);
}
animate();
