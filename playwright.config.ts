import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/ui', timeout: 60000, workers: 1,
  outputDir: '.artifacts/browser', reporter: [['list'], ['html', { open: 'never', outputFolder: '.artifacts/playwright-report' }]],
  use: { baseURL: 'http://127.0.0.1:5173', viewport: { width: 1440, height: 1000 }, video: 'on', trace: 'retain-on-failure' },
  webServer: [
    { command: 'pnpm dev', url: 'http://127.0.0.1:4310/api/health', env: { MOONJELLY_DATA: '.artifacts/ui-data' }, reuseExistingServer: false },
    { command: 'pnpm web', url: 'http://127.0.0.1:5173', reuseExistingServer: false }
  ]
});
