import { readFileSync } from 'node:fs';

import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const generated = JSON.parse(
  readFileSync(new URL('./schema/generated-outputs.json', import.meta.url), 'utf8'),
).outputs.map((entry) => entry.path);

/**
 * Readability and dead-code rules that Prettier cannot express.
 *
 * Formatting owns layout; this configuration owns structure (braces, one
 * statement per line, unused bindings). Rules that would require semantic
 * rewrites are left to the refactor phases, not silently enabled here.
 */
export default [
  {
    ignores: [
      'archive/**',
      'build/**',
      'dist-next/**',
      'dist-multiplayer/**',
      'node_modules/**',
      'reports/**',
      'release/**',
      'client/public/**',
      '.emcache/**',
      ...generated,
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,mts,cts,js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      curly: ['error', 'all'],
      'max-statements-per-line': ['error', { max: 1 }],
      'no-multi-assign': 'error',
      'no-sequences': 'error',
      'no-unneeded-ternary': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-empty': 'off',
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-control-regex': 'off',
      'no-irregular-whitespace': [
        'error',
        { skipStrings: true, skipComments: true, skipRegExps: true, skipTemplates: true },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    files: ['**/*.ts', '**/*.mts', '**/*.cts'],
    rules: {
      'no-undef': 'off',
      'no-redeclare': 'off',
    },
  },
];
