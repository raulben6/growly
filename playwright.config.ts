import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  // Un solo worker: evita que dos workers golpeen rutas aún sin compilar (cold-start de Turbopack) a la vez.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  expect: { timeout: 10_000 },
  use: { baseURL: 'http://localhost:3000', navigationTimeout: 30_000 },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
