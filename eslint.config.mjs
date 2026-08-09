// Three kinds of JavaScript here: the scripts the page loads, which get the
// browser globals, and two that run in Node — vite.config.js at build time and
// the checks under scripts/ that guard the repo against itself.

import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  {
    files: ['src/scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
    },
    rules: js.configs.recommended.rules,
  },
  {
    files: ['vite.config.js', 'scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
    rules: js.configs.recommended.rules,
  },
];
