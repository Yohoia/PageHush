import { devices, defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

export default defineConfig({
  ...baseConfig,
  testIgnore: undefined,
  testMatch: /smoke\.spec\.ts/,
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
});
