import js from '@eslint/js'
import tseslint from 'typescript-eslint'

// Shared rule presets. Packages keep their own file globs, environments, and
// package-specific plugins so their lint behavior stays scoped as before.
export const baseEslintConfigs = {
  javascript: js.configs.recommended,
  typescript: tseslint.configs.recommended,
}
