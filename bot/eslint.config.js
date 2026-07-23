import globals from 'globals';
import { defineConfig, globalIgnores } from 'eslint/config';
import { baseEslintConfigs } from '../eslint.config.base.mjs';

// Flat config for the Discord bot (ESLint 10), mirroring the server setup.
// Lints application source, tests, and config files with ESM parsing and Node
// globals; test files additionally get Vitest's globals.
export default defineConfig([
  globalIgnores(['node_modules', 'coverage', 'dist']),
  {
    files: ['**/*.js'],
    extends: [baseEslintConfigs.javascript],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
  },
  {
    files: ['**/*.ts'],
    extends: [baseEslintConfigs.javascript, baseEslintConfigs.typescript],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
  },
  {
    // Vitest exposes describe/it/expect/vi etc.; scope those to test files only.
    files: ['test/**/*.{js,ts}', '**/*.test.{js,ts}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.vitest },
    },
  },
]);
