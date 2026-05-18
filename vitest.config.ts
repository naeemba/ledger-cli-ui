import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['lib/journal/**/*.ts'],
      exclude: ['lib/journal/**/*.test.ts', 'lib/journal/__fixtures__/**'],
      thresholds: { lines: 95, functions: 95, branches: 90 },
    },
  },
});
