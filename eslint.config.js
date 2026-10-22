import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

/**
 * The core-purity rule below is the architectural invariant from AGENTS.md §3 expressed as a gate.
 * scripts/check-core-purity.mjs enforces the same thing independently — two mechanisms, because
 * this boundary is what keeps src/core deterministic and therefore testable to 100%.
 */
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'node_modules/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },

  {
    files: ['src/**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },

  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['three', 'three/*', 'react', 'react-dom', 'react/*', '@react-three/*'],
              message:
                'src/core is framework-free (AGENTS.md §3). Rendering belongs in src/app; core holds pure logic only.',
            },
            {
              group: ['../app/**', '../testing/**', '**/app/**', '**/testing/**'],
              message:
                'src/core may not depend on the render shell. Dependencies point inwards only.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        ...[
          'window',
          'document',
          'navigator',
          'localStorage',
          'sessionStorage',
          'performance',
          'fetch',
          'requestAnimationFrame',
          'process',
          'globalThis',
        ].map((name) => ({
          name,
          message:
            'src/core must be deterministic and DOM-free (AGENTS.md §3). Time enters as an explicit dtMs parameter.',
        })),
      ],
    },
  },

  {
    files: ['scripts/**/*.mjs', '.claude/hooks/**/*.mjs', '*.config.{js,ts}'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },
);
