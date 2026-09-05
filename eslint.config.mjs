import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import prettierConfig from 'eslint-config-prettier/flat';
import prettierPlugin from 'eslint-plugin-prettier/recommended';

const config = [
  ...nextCoreWebVitals,
  prettierPlugin,
  prettierConfig,
  {
    rules: {
      'prettier/prettier': ['error', { usePrettierrc: true }],
      'no-console': 'error',
    },
  },
  {
    // Files where console.* is intentional or unavoidable.
    files: [
      'lib/log/**',
      'instrumentation*.ts',
      'instrumentation-client.ts',
      'sentry.*.config.ts',
      '**/*.test.ts',
      '**/*.test.tsx',
      '*.config.{ts,js,mjs}',
      'scripts/**',
      'features/accounts/Accounts.tsx',
    ],
    rules: { 'no-console': 'off' },
  },
  {
    // Hard navigations past the crypto gate: a client-side route transition
    // keeps the old session state, so the gate would not re-evaluate.
    files: [
      'features/crypto/SetupWizard.tsx',
      'features/crypto/LockButton.tsx',
      'features/settings/ResetEncryptionCard.tsx',
    ],
    rules: { '@next/next/no-location-assign-relative-destination': 'off' },
  },
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', '.claude/**'],
  },
];

export default config;
