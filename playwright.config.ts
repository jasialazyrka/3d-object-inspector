import { defineConfig, devices } from '@playwright/test';

const PORT = 4175;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: { baseURL, trace: 'on-first-retry' },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          // Headless CI has no GPU; SwiftShader gives a real, if slow, WebGL implementation.
          // Without this the canvas silently fails to render and every 3D assertion goes red.
          args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
        },
      },
    },
  ],
  // Dev server, not a production preview: the test seam (src/testing/seam.ts) is deliberately
  // stripped from production builds, and E2E asserts behaviour through that seam.
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
