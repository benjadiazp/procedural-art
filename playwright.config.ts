import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:5173',
    launchOptions: {
      args: ['--use-gl=swiftshader', '--no-sandbox'],
    },
  },
  webServer: {
    command: 'bun dev --port 5173',
    port: 5173,
    reuseExistingServer: !process.env.CI,
  },
});
