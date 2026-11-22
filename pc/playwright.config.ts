import { defineConfig, devices } from '@playwright/test'

// La API se simula en el navegador (e2e/mockApi.ts): no depende de producción ni de credenciales.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4317', trace: 'retain-on-failure', locale: 'es-GT', timezoneId: 'America/Guatemala' },
  projects: [
    { name: 'celular', use: { ...devices['Pixel 7'] } },
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'pnpm exec vite --port 4317 --strictPort',
    url: 'http://localhost:4317',
    reuseExistingServer: false,
    env: { VITE_API_URL: '/api' },
  },
})
