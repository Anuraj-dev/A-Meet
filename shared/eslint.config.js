import { defineConfig, globalIgnores } from 'eslint/config';
import { baseEslintConfigs } from '../eslint.config.base.mjs';

export default defineConfig([
  globalIgnores(['node_modules', 'dist']),
  {
    files: ['**/*.ts'],
    extends: [baseEslintConfigs.javascript, baseEslintConfigs.typescript],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
  },
]);
