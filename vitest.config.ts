import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    include: ['tests/**/*.test.ts'],
  },
});
