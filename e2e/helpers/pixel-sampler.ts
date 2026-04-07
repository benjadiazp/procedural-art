import type { Page } from '@playwright/test';

/**
 * Samples a 5x5 grid of pixels from the WebGL canvas.
 * Returns 25 RGBA tuples as number[][].
 */
export async function samplePixels(page: Page): Promise<number[][]> {
  return page.evaluate(() => {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) throw new Error('No WebGL context');

    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;

    const coords: [number, number][] = [];
    for (let gy = 0; gy < 5; gy++) {
      for (let gx = 0; gx < 5; gx++) {
        coords.push([
          Math.floor(((gx + 0.5) / 5) * w),
          Math.floor(((gy + 0.5) / 5) * h),
        ]);
      }
    }

    const results: number[][] = [];
    const buf = new Uint8Array(4);
    for (const [px, py] of coords) {
      gl.readPixels(px, h - py - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      results.push([buf[0], buf[1], buf[2], buf[3]]);
    }
    return results;
  });
}