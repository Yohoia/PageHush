import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'remote-management.real.spec.ts',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5193', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: {
    command: 'node --import tsx tests/e2e/support/isolated-web-server.ts',
    url: 'http://127.0.0.1:5193/v1/health',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
