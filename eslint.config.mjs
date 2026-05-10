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
    },
  },
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'],
  },
];

export default config;
