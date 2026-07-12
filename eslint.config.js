// ESLint v9 flat config. Rules and globals are a 1:1 translation of the
// legacy .eslintrc.json (deleted alongside this file). Keep them
// identical unless intentionally re-tuning the lint signal.

import globals from 'globals';

export default [
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2024,
      },
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-undef': 'error',
      'semi': ['error', 'always'],
      'quotes': ['error', 'single', { avoidEscape: true }],
    },
  },
];