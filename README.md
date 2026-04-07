# Procedural Art

GPU-accelerated procedural art simulations built with Three.js, TypeScript, and Vite.

## Simulations

- **Boids** — flocking behavior
- **Reaction-Diffusion** — Turing pattern formation
- **Physarum** — slime mold transport networks
- **Curl Noise** — divergence-free particle flow
- **Fluid** — Navier-Stokes fluid dynamics

## Usage as npm package

```bash
npm install @benjadiazp/procedural-art
```

Mount a simulation into any container element:

```ts
import { mount } from '@benjadiazp/procedural-art';

const result = mount(document.getElementById('canvas-container')!, {
  simulation: 'Boids',   // optional — defaults to the first simulation
  showControls: true,     // optional — show parameter GUI overlay
});

// List available simulations
console.log(result.getSimulationNames());
// => ['Boids', 'Reaction-Diffusion', 'Physarum', 'Curl Noise', 'Fluid']

// Switch simulation at runtime
result.setSimulation('Fluid');

// Clean up when done
result.destroy();
```

The container element must have explicit dimensions (width and height). The canvas will fill it and respond to resizes automatically.

## Getting Started

```bash
bun install
bun dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `bun dev` | Start dev server |
| `bun run build` | Typecheck + production build |
| `bun run build:lib` | Build library for npm |
| `bunx playwright test` | Run visual tests |

## License

MIT
