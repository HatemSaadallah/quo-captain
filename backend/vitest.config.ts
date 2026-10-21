import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    testTimeout: 600_000,
    hookTimeout: 600_000,
  },
});
