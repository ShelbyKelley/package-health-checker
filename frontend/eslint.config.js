import js from '@eslint/js'
import reactX from '@eslint-react/eslint-plugin'
import { globalIgnores, defineConfig } from 'eslint/config'
import eslintConfigPrettier from 'eslint-config-prettier'
import { flatConfigs as importXFlatConfigs } from 'eslint-plugin-import-x'
import jsxA11yX from 'eslint-plugin-jsx-a11y-x'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefreshPlugin from 'eslint-plugin-react-refresh'
import globals from 'globals'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefreshPlugin.configs.vite,
      reactX.configs.recommended,
      jsxA11yX.configs.recommended,
      importXFlatConfigs.recommended,
      eslintConfigPrettier,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: {
      'import-x/resolver': {
        node: {
          extensions: ['.js', '.jsx'],
        },
      },
    },
    rules: {
      'no-console': 'warn',
      'import-x/order': [
        'warn',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
          ],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },
])
