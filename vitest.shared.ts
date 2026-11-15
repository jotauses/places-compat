import { defineConfig } from 'vitest/config';

export default defineConfig({
  oxc: { jsx: { runtime: 'classic', development: false } },
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
    globals: true,
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      reporter: ['text'],
      thresholds: { lines: 90, branches: 90 },
    },
  },
});
