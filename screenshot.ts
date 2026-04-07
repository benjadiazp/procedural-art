import puppeteer from 'puppeteer';

const PORT = parseInt(process.env.PORT || '5173', 10);
const WAIT_MS = parseInt(process.env.WAIT_MS || '5000', 10);
const outDir = '/tmp/screenshots';

async function main() {
  const target = process.argv[2] || 'all'; // 'boids', 'rd', or 'all'

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(`http://localhost:${PORT}/?test`, {
    waitUntil: 'networkidle0',
    timeout: 15000,
  });

  // Close the panel so it doesn't cover the canvas
  await page.evaluate(() => {
    document.getElementById('panel')?.classList.remove('open');
    document.getElementById('menu-toggle')?.classList.remove('hidden');
  });

  const { execSync } = await import('child_process');
  execSync(`mkdir -p ${outDir}`);

  async function screenshot(name: string) {
    await new Promise(r => setTimeout(r, WAIT_MS));
    const path = `${outDir}/${name}.png`;
    await page.screenshot({ path });
    console.log(`Saved: ${path}`);
  }

  if (target === 'boids' || target === 'all') {
    // Boids is the first simulation, already loaded
    await screenshot('boids_default');

    // Cycle through boids presets
    const boidsPresets = ['Murmuration', 'Chaos', 'Fireflies', 'Nebula'];
    for (const preset of boidsPresets) {
      await page.evaluate((p) => {
        const ctrl = (window as any).__guiControllers;
        // Find preset dropdown and change it
        const selects = document.querySelectorAll('.lil-gui select');
        for (const sel of selects) {
          const s = sel as HTMLSelectElement;
          for (const opt of s.options) {
            if (opt.value === p) {
              s.value = p;
              s.dispatchEvent(new Event('change'));
              break;
            }
          }
        }
      }, preset);
      await screenshot(`boids_${preset.toLowerCase()}`);
    }
  }

  if (target === 'rd' || target === 'all') {
    // Switch to Reaction-Diffusion
    await page.evaluate(() => {
      const items = document.querySelectorAll('#simulation-list li');
      for (const li of items) {
        if (li.textContent?.includes('Reaction-Diffusion')) {
          (li as HTMLElement).click();
          break;
        }
      }
    });
    await screenshot('rd_coral');

    const rdPresets = ['Mitosis', 'Worms', 'Maze', 'Solitons', 'Bubbles'];
    for (const preset of rdPresets) {
      await page.evaluate((p) => {
        const selects = document.querySelectorAll('.lil-gui select');
        for (const sel of selects) {
          const s = sel as HTMLSelectElement;
          for (const opt of s.options) {
            if (opt.value === p) {
              s.value = p;
              s.dispatchEvent(new Event('change'));
              break;
            }
          }
        }
      }, preset);
      await screenshot(`rd_${preset.toLowerCase()}`);
    }
  }

  await browser.close();
  console.log(`\nAll screenshots in: ${outDir}/`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
