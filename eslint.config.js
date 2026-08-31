import js from '@eslint/js';
import globals from 'globals';

const sharedRules = {
  'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

  eqeqeq: ['error', 'smart'],
  curly: ['error', 'multi-line'],
  'prefer-template': 'error',
  'object-shorthand': 'error',
  'prefer-arrow-callback': 'error',
  'no-else-return': 'error',
  'no-lonely-if': 'error',
  'no-console': ['warn', { allow: ['error'] }],
  'no-alert': 'error',
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-useless-concat': 'error',
};

export default [
  {
    ignores: ['node_modules/**'],
  },
  js.configs.recommended,
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
    },
    rules: sharedRules,
  },
  {
    files: ['test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.es2021,
      },
    },
    rules: sharedRules,
  },
];