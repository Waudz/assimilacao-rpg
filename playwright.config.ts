import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: process.env.PW_BASE_URL ?? 'http://127.0.0.1:4173/', trace: 'retain-on-failure' },
  projects: [
    { name: 'iphone-se', use: { ...devices['iPhone SE'], browserName: 'chromium', channel: process.env.PW_CHANNEL } },
    { name: 'pixel', use: { ...devices['Pixel 7'], channel: process.env.PW_CHANNEL } },
  ],
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 60000,
  },
});
