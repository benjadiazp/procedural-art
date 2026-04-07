import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import GUI from 'lil-gui';

export interface Simulation {
  /** Display name shown in the sidebar */
  name: string;

  /** If true, disable orbit rotation and only allow panning/zooming (for 2D visualizations) */
  is2D?: boolean;

  /** Called once to set up the scene. Return the scene and camera. */
  setup(ctx: SimulationContext): void;

  /** Called every frame with the elapsed time in seconds */
  update(time: number, delta: number): void;

  /** Called when the user clicks on the canvas. Receives the intersection point if any. */
  onClick?(event: SimulationClickEvent): void;

  /** Reset the camera to its default position for this simulation */
  resetCamera?(ctx: SimulationContext): void;

  /** Reset the simulation state without tearing down the scene */
  reset?(): void;

  /** Custom render (e.g. post-processing composer) — if defined, replaces default renderer.render() */
  render?(): void;

  /** Called on window resize so the simulation can resize internal buffers */
  onResize?(width: number, height: number): void;

  /** Called when the simulation is unloaded */
  dispose(): void;
}

export interface SimulationContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls?: OrbitControls;
  gui: GUI;
}

export interface SimulationClickEvent {
  /** Normalized device coordinates (-1 to 1) */
  ndc: THREE.Vector2;
  /** The raw pointer event */
  pointer: PointerEvent;
  /** Raycaster pre-configured from the click position */
  raycaster: THREE.Raycaster;
}
