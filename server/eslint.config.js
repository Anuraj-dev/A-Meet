import globals from 'globals';
import { defineConfig, globalIgnores } from 'eslint/config';
import { baseEslintConfigs } from '../eslint.config.base.mjs';

// Flat config for the Node server (ESLint 10), mirroring the client setup.
// Lints application source, tests, and config files with ESM parsing and
// Node globals; test files additionally get Vitest's globals.
export default defineConfig([
  // Generated / dependency output — never linted, but app source and tests are.
  globalIgnores(['node_modules', 'logs', 'coverage', 'dist']),
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
    rules: {
      // The incremental JS→TS migration still has explicit boundary `any`s.
      // Keep syntax-aware TS linting green without making type-hardening part
      // of every migration slice; the remaining recommended rules stay active.
      '@typescript-eslint/no-explicit-any': 'off',
      // Declaration merging legitimately uses a marker interface extending one type.
      '@typescript-eslint/no-empty-object-type': [
        'error',
        { allowInterfaces: 'with-single-extends' },
      ],
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
