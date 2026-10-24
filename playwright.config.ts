import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  use: { baseURL: process.env.TEST_BASE_URL || 'http://localhost:8889' },
  timeout: 60000,
  expect: { timeout: 15000 },
  workers: 1,
  reporter: 'line',
});
