// Three kinds of JavaScript here: the scripts the page loads, which get the
// browser globals, and two that run in Node — the build config at build time
// and the checks under scripts/ that guard the repo against itself.
//
// The tests are a fourth: they run under Node but drive a jsdom document, so
// they need the browser globals the modules they exercise expect, and the test
// runner's config is Node like the rest of the tooling.

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
    files: ['vite.config.js', 'vitest.config.mjs', 'scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
    rules: js.configs.recommended.rules,
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
    },
    rules: js.configs.recommended.rules,
  },
];
