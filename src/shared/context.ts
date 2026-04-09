import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Simulation, SimulationClickEvent } from '../simulation';

/** Configure OrbitControls for 2D pan+zoom only (no rotation) */
export function configure2DControls(controls: OrbitControls): void {
  controls.enableRotate = false;
  controls.screenSpacePanning = true;
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
}

/** Create a pointerdown handler that dispatches click events to the active simulation */
export function createClickHandler(
  canvas: HTMLCanvasElement,
  getCamera: () => THREE.PerspectiveCamera,
  getActiveSim: () => Simulation | null,
): (e: PointerEvent) => void {
  const raycaster = new THREE.Raycaster();
  return (e: PointerEvent) => {
    const sim = getActiveSim();
    if (!sim?.onClick) return;
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, getCamera());
    const event: SimulationClickEvent = { ndc, pointer: e, raycaster };
    sim.onClick(event);
  };
}
