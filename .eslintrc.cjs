/**
 * ESLint Configuration
 * Unified linting for TypeScript across all workspaces
 */
module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: ['./apps/*/tsconfig.json', './packages/*/tsconfig.json', './services/*/tsconfig.json'],
  },
  plugins: ['@typescript-eslint', 'import'],
  ignorePatterns: [
    'dist/',
    'build/',
    'node_modules/',
    '*.config.*',
    'scripts/',
    'vitest.workspace.ts',
  ],
  rules: {
    // TypeScript specific
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    // Relaxed to 'warn' for incremental adoption on an existing codebase.
    // These rules require significant refactoring to satisfy fully.
    '@typescript-eslint/no-floating-promises': 'warn',
    '@typescript-eslint/await-thenable': 'error',
    '@typescript-eslint/no-misused-promises': 'warn',
    '@typescript-eslint/prefer-nullish-coalescing': 'warn',
    '@typescript-eslint/prefer-optional-chain': 'error',
    '@typescript-eslint/strict-boolean-expressions': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'warn',
    '@typescript-eslint/no-unsafe-argument': 'warn',
    '@typescript-eslint/no-unsafe-member-access': 'warn',
    '@typescript-eslint/no-unsafe-return': 'warn',
    '@typescript-eslint/require-await': 'warn',
    '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
    '@typescript-eslint/restrict-template-expressions': 'warn',
    '@typescript-eslint/no-redundant-type-constituents': 'warn',
    '@typescript-eslint/no-unsafe-call': 'warn',
    '@typescript-eslint/no-base-to-string': 'warn',
    '@typescript-eslint/prefer-optional-chain': 'warn',
    'no-constant-condition': 'warn',
    'no-control-regex': 'warn',
    '@typescript-eslint/no-namespace': 'warn',

    // General
    'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    'no-debugger': 'error',
    'no-duplicate-imports': 'warn',
    'no-unused-expressions': 'off',
    '@typescript-eslint/no-unused-expressions': ['error', { allowShortCircuit: true }],
    'no-useless-escape': 'warn',
    'prefer-const': 'warn',

    // Import organization
    'import/order': ['error', {
      groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
      'newlines-between': 'always',
      alphabetize: { order: 'asc', caseInsensitive: true },
    }],
    'import/no-duplicates': 'error',
    'import/no-unresolved': 'off', // TypeScript handles this
  },
  overrides: [
    // Frontend React files
    {
      files: ['apps/desktop/src/**/*.{ts,tsx}'],
      extends: [
        'plugin:react-hooks/recommended',
        'plugin:react/recommended',
      ],
      settings: {
        react: {
          version: 'detect',
        },
      },
      rules: {
        'react/react-in-jsx-scope': 'off', // React 18+ doesn't need this
        'react/prop-types': 'off', // Using TypeScript
      },
    },
    // Test files
    {
      files: ['**/*.test.ts', '**/*.test.tsx', '**/__tests__/**'],
      env: {
        node: true,
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-floating-promises': 'off',
        'no-console': 'off',
      },
    },
    // Config files
    {
      files: ['*.config.{ts,js,cjs}'],
      rules: {
        'no-console': 'off',
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
  ],
};

