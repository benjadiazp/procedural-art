import { test, expect } from '@playwright/test';
import { samplePixels, canvasSnapshot } from './helpers/pixel-sampler';

const SIMULATIONS = [
  { name: 'Boids', index: 0, warmup: 500, snapGap: 500 },
  { name: 'Reaction-Diffusion', index: 1, warmup: 3000, snapGap: 2000 },
  { name: 'Physarum', index: 2, warmup: 3000, snapGap: 1000 },
  { name: 'Curl Noise', index: 3, warmup: 500, snapGap: 500 },
] as const;

/** At least some sampled pixels are non-black */
function hasVisibleContent(samples: number[][]): boolean {
  return samples.some(([r, g, b]) => r + g + b > 30);
}

/** At least 2 of 25 grid points changed meaningfully between snapshots */
function pixelsChanged(a: number[][], b: number[][]): boolean {
  let diffCount = 0;
  for (let i = 0; i < a.length; i++) {
    const dr = Math.abs(a[i][0] - b[i][0]);
    const dg = Math.abs(a[i][1] - b[i][1]);
    const db = Math.abs(a[i][2] - b[i][2]);
    if (dr + dg + db > 10) diffCount++;
  }
  return diffCount >= 2;
}

async function loadSimulation(page: import('@playwright/test').Page, index: number) {
  await page.goto('/?test');
  await page.waitForSelector('#canvas');

  if (index > 0) {
    await page.click(`#simulation-list li:nth-child(${index + 1})`);
    await page.waitForFunction(
      () => !document.getElementById('transition-overlay')!.classList.contains('active'),
    );
    // Extra buffer after transition animation completes
    await page.waitForTimeout(200);
  }
}

for (const sim of SIMULATIONS) {
  test.describe(sim.name, () => {
    test('renders visible content', async ({ page }) => {
      await loadSimulation(page, sim.index);
      await page.waitForTimeout(sim.warmup);

      const samples = await samplePixels(page);
      expect(hasVisibleContent(samples)).toBe(true);
    });

    test('is animating', async ({ page }) => {
      await loadSimulation(page, sim.index);
      await page.waitForTimeout(sim.warmup);

      // Use full canvas snapshots — catches even subtle changes
      const snap1 = await canvasSnapshot(page);
      await page.waitForTimeout(sim.snapGap);
      const snap2 = await canvasSnapshot(page);

      expect(snap1).not.toBe(snap2);
    });

    test('responds to camera movement', async ({ page }) => {
      await loadSimulation(page, sim.index);
      await page.waitForTimeout(sim.warmup);

      const before = await samplePixels(page);

      // Drag across canvas to orbit the camera
      const canvas = page.locator('#canvas');
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();

      const cx = box!.x + box!.width / 2;
      const cy = box!.y + box!.height / 2;

      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + 150, cy + 100, { steps: 10 });
      await page.mouse.up();

      // Wait for damping + render
      await page.waitForTimeout(400);
      const after = await samplePixels(page);

      expect(pixelsChanged(before, after)).toBe(true);
    });
  });
}
