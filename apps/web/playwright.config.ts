import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests', workers: 1, fullyParallel: false,
  outputDir: './output/playwright/test-results',
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4178', headless: true, trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 4178 --strictPort', url: 'http://127.0.0.1:4178', reuseExistingServer: false, timeout: 30000 },
})
