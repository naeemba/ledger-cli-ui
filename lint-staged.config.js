const path = require('node:path');

const buildEslintCommand = (filenames) =>
  `next lint --fix --file ${filenames
    .map((f) => path.relative(process.cwd(), f))
    .join(' --file ')}`;

const typescriptTypeCheckCommand = (filenames) =>
  `tsc --noEmit --project ${path.relative(
    process.cwd(),
    path.resolve(__dirname, 'tsconfig.json')
  )}`;

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
