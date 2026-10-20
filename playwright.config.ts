import { defineConfig } from '@playwright/test';
const apiPort = process.env.MOONJELLY_API_PORT ?? '4310', webPort = process.env.MOONJELLY_WEB_PORT ?? '5173';
export default defineConfig({
  testDir: './tests/ui', timeout: 60000, workers: 1,
  outputDir: '.artifacts/browser', reporter: [['list'], ['html', { open: 'never', outputFolder: '.artifacts/playwright-report' }]],
  use: { baseURL: `http://127.0.0.1:${webPort}`, viewport: { width: 1440, height: 1000 }, video: 'on', trace: 'retain-on-failure' },
  webServer: [
    { command: 'pnpm dev', url: `http://127.0.0.1:${apiPort}/api/health`, env: { MOONJELLY_DATA: '.artifacts/ui-data' }, reuseExistingServer: false },
    { command: 'pnpm web', url: `http://127.0.0.1:${webPort}`, reuseExistingServer: false }
  ]
});
