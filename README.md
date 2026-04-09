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

### Peer dependencies

The library expects these packages to be installed in your project:

```bash
npm install three lil-gui postprocessing
```

### Basic usage

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

### Mount options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `simulation` | `string` | First registered | Name of the simulation to load (case-insensitive) |
| `showControls` | `boolean` | `false` | Show the lil-gui parameter panel overlaid on the canvas |
| `antialias` | `boolean` | `true` | Enable WebGL antialiasing |
| `labels` | `Record<string, string>` | `{}` | Label translations (see [Localization](#localization)) |

### Mount result

The object returned by `mount()` exposes these methods:

| Method | Description |
|--------|-------------|
| `destroy()` | Tear down the renderer, remove all DOM elements, and stop the animation loop |
| `setSimulation(name)` | Switch to a different simulation by name (case-insensitive) |
| `getSimulationNames()` | Returns an array of all available simulation names (English) |

### Localization

All UI labels (simulation names, preset names, parameter labels, folder names) can be translated via the `labels` option. Keys are the default English strings; values are your translations. Any key you don't translate falls back to English automatically.

Use the exported `i18nKeys` object to discover all available keys with full TypeScript autocompletion:

```ts
import { mount, i18nKeys } from '@benjadiazp/procedural-art';

const labels: Record<string, string> = {
  // Common
  [i18nKeys.common.parameters]: 'Parámetros',
  [i18nKeys.common.preset]: 'Predefinido',

  // Simulation names
  [i18nKeys.boids.name]: 'Boids',
  [i18nKeys.fluid.name]: 'Fluido',

  // Preset names
  [i18nKeys.boids.presets.murmuration]: 'Murmuración',
  [i18nKeys.boids.presets.fireflies]: 'Luciérnagas',

  // Folder names
  [i18nKeys.boids.folders.behavior]: 'Comportamiento',
  [i18nKeys.boids.folders.appearance]: 'Apariencia',

  // Parameter labels
  [i18nKeys.boids.labels.separation]: 'Separación',
  [i18nKeys.boids.labels.brightness]: 'Brillo',
};

mount(container, { simulation: 'Boids', showControls: true, labels });
```

The `i18nKeys` object is organized by simulation:

```
i18nKeys.common          — shared keys (Parameters, Preset)
i18nKeys.boids           — .name, .presets.*, .folders.*, .labels.*
i18nKeys.reactionDiffusion
i18nKeys.physarum
i18nKeys.curlNoise
i18nKeys.fluid
```

A `LabelKey` type is also exported as a union of every valid key string, useful for building typed translation files:

```ts
import type { LabelKey } from '@benjadiazp/procedural-art';

const translations: Partial<Record<LabelKey, string>> = {
  'Parameters': 'Parámetros',
  'Brightness': 'Brillo',
};
```

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
