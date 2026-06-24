import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'server-only': path.resolve(__dirname, 'vitest-server-only.js'),
      'next/font/google': path.resolve(__dirname, 'vitest-next-font.js'),
    },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', '.claude/**'],
    setupFiles: ['./vitest-setup.ts'],
    server: {
      deps: {
        // @naeemba/next-starter/server is ESM and imports 'next/headers' without
        // a .js extension — inlining it through Vite resolves the CJS interop.
        inline: ['@naeemba/next-starter'],
      },
    },
    coverage: {
      provider: 'v8',
      include: ['lib/journal/**/*.ts'],
      exclude: ['lib/journal/**/*.test.ts', 'lib/journal/__fixtures__/**'],
      thresholds: { lines: 95, functions: 95, branches: 90 },
    },
  },
});
