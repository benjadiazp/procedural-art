import { test, expect } from '@playwright/test';
import { samplePixels } from './helpers/pixel-sampler';

const SIMULATIONS = [
  { name: 'Boids', index: 0, warmup: 500 },
  { name: 'Reaction-Diffusion', index: 1, warmup: 3000 },
  { name: 'Physarum', index: 2, warmup: 3000 },
  { name: 'Curl Noise', index: 3, warmup: 500 },
] as const;

function hasVisibleContent(samples: number[][]): boolean {
  return samples.some(([r, g, b]) => r + g + b > 30);
}

async function loadSimulation(page: import('@playwright/test').Page, index: number) {
  await page.goto('/?test');
  await page.waitForSelector('#canvas');

  if (index > 0) {
    await page.click(`#simulation-list li:nth-child(${index + 1})`);
    await page.waitForFunction(
      () => !document.getElementById('transition-overlay')!.classList.contains('active'),
    );
    await page.waitForTimeout(200);
  }
}

for (const sim of SIMULATIONS) {
  test(`${sim.name} renders visible content`, async ({ page }) => {
    await loadSimulation(page, sim.index);
    await page.waitForTimeout(sim.warmup);

    const samples = await samplePixels(page);
    expect(hasVisibleContent(samples)).toBe(true);
  });
}
