const path = require('node:path');

const buildEslintCommand = (filenames) =>
  `eslint --fix ${filenames
    .map((f) => path.relative(process.cwd(), f))
    .join(' ')}`;

// Type-checks the whole project through the package script, so the compiler
// path lives in one place (package.json).
const typescriptTypeCheckCommand = () => 'pnpm type-check';

const buildPrettierCommand = (filenames) =>
  `prettier --write ${filenames
    .map((f) => path.relative(process.cwd(), f))
    .join(' ')}`;

// const jestUnitTestsCommand = [
//   'jest --bail --findRelatedTests --passWithNoTests',
// ];

const lintStagedConfig = {
  '*.{ts,tsx}': [typescriptTypeCheckCommand],
  '*.{js,jsx,ts,tsx}': [buildEslintCommand],
  '**/*.{ts,js,tsx,jsx,css,json}': [buildPrettierCommand],
  // '**/*.{tsx,ts}': jestUnitTestsCommand,
};

module.exports = lintStagedConfig;
