import js from '@eslint/js';
import globals from 'globals';
import { defineConfig, globalIgnores } from 'eslint/config';

// Flat config for the Node server (ESLint 10), mirroring the client setup.
// Lints application source, tests, and config files with ESM parsing and
// Node globals; test files additionally get Vitest's globals.
export default defineConfig([
  // Generated / dependency output — never linted, but app source and tests are.
  globalIgnores(['node_modules', 'logs', 'coverage', 'dist']),
  {
    files: ['**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
  },
  {
    // Vitest exposes describe/it/expect/vi etc.; scope those to test files only.
    files: ['test/**/*.js', '**/*.test.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.vitest },
    },
  },
]);
