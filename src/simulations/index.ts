import type { Simulation } from '../simulation';
import { BoidsSimulation } from './boids';
import { ReactionDiffusionSimulation } from './reaction-diffusion';
import { PhysarumSimulation } from './physarum';
import { CurlNoiseSimulation } from './curl-noise';
import { FluidSimulation } from './fluid';

/** Register all simulations here. The first one is loaded by default. */
export const simulations: Simulation[] = [
  new BoidsSimulation(),
  new ReactionDiffusionSimulation(),
  new PhysarumSimulation(),
  new CurlNoiseSimulation(),
  new FluidSimulation(),
];
