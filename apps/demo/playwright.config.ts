import { defineConfig, devices } from '@playwright/test'

// Use ports that don't collide with the standard dev ports (3000/3001/3002/8787)
// or with other apps the developer may already be running. Tests never reuse
// foreign servers — they always start fresh ones in this port range.
const DEMO_PORT = 4302
const DASHBOARD_PORT = 4301
const GATEWAY_PORT = 4787

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${DEMO_PORT}`,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    headless: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @agentronics/gateway exec tsx watch src/server.ts',
      url: `http://localhost:${GATEWAY_PORT}/v1/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        SEED_FIXTURE: 'true',
        PORT: String(GATEWAY_PORT),
        ALLOWED_ORIGINS: `http://localhost:${DEMO_PORT},http://localhost:${DASHBOARD_PORT}`,
      },
    },
    {
      command: `pnpm --filter @agentronics/demo exec vite --port ${DEMO_PORT} --strictPort`,
      url: `http://localhost:${DEMO_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        VITE_AGENTRONICS_KEY: 'agtx_pk_demo_e2e_publishable_001',
        VITE_AGENTRONICS_GATEWAY_URL: `http://localhost:${GATEWAY_PORT}`,
        VITE_AGENTRONICS_GATEWAY_TRACES: 'true',
      },
    },
    {
      command: `pnpm --filter @agentronics/dashboard exec next dev --port ${DASHBOARD_PORT}`,
      url: `http://localhost:${DASHBOARD_PORT}`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: { GATEWAY_URL: `http://localhost:${GATEWAY_PORT}` },
    },
  ],
})
