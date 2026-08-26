import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';
import { resolve } from 'node:path';

// The config lives beside the linter's own node_modules so that `typescript-eslint` resolves
// TypeScript 6 here, while the workspace compiles with TypeScript 7.
const ROOT = resolve(import.meta.dirname, '../..');

/**
 * Architecture is enforced here, not by convention.
 *
 *  - `boundaries/element-types` encodes the dependency rule: kernel <- domain <- application
 *    <- adapter <- app. Arrows never point outward-in.
 *  - The size limits this project was specified with: 500 lines per file, 100 lines per
 *    function, 3 parameters (use one object beyond that).
 */
const SIZE_RULES = {
  'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
  'max-lines-per-function': [
    'error',
    { max: 100, skipBlankLines: true, skipComments: true, IIFEs: true },
  ],
  'max-params': ['error', 3],
  'max-depth': ['error', 3],
  complexity: ['error', 12],
};

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.moon/cache/**',
      'libs/persistence/src/generated/**',
      '**/*.config.mjs',
      '**/*.config.ts',
      'tools/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: ROOT },
    },
    settings: {
      'boundaries/include': ['libs/**/*.ts', 'apps/**/*.ts', 'apps/**/*.tsx'],
      'boundaries/elements': [
        { type: 'kernel', pattern: 'libs/kernel/src/**/*' },
        { type: 'contract', pattern: 'libs/contracts/src/**/*' },
        { type: 'domain', pattern: 'libs/(loops|planning|integrations|signals)/src/**/*' },
        { type: 'application', pattern: 'libs/orchestration/src/**/*' },
        {
          type: 'adapter',
          pattern: 'libs/(persistence|reasoning|connectors-composio|connectors-local)/src/**/*',
        },
        { type: 'app', pattern: 'apps/**/*' },
      ],
    },
    plugins: { boundaries },
    rules: {
      ...SIZE_RULES,
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSEnumDeclaration',
          message: 'Use an `as const` object plus a union type instead of an enum.',
        },
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true },
      ],
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            { from: 'kernel', allow: ['kernel'] },
            { from: 'contract', allow: ['kernel', 'contract'] },
            { from: 'domain', allow: ['kernel', 'domain'] },
            { from: 'application', allow: ['kernel', 'contract', 'domain', 'application'] },
            { from: 'adapter', allow: ['kernel', 'contract', 'domain', 'application', 'adapter'] },
            {
              from: 'app',
              allow: ['kernel', 'contract', 'domain', 'application', 'adapter', 'app'],
            },
          ],
        },
      ],
      'boundaries/no-unknown-files': 'off',
    },
  },
  {
    /**
     * The shared kernel and the four domain contexts are pure: no I/O, no framework, no clock,
     * no randomness. Everything time-like arrives as an `Instant` from the caller.
     */
    files: ['libs/kernel/**/*.ts', 'libs/{loops,planning,integrations,signals}/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['node:*', 'fs', 'path', 'crypto'], message: 'A domain library is pure.' },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'Inject a Clock; the domain must be deterministic.' },
        { name: 'fetch', message: 'A domain library performs no I/O.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Inject an IdGenerator instead.' },
      ],
    },
  },
  {
    files: ['**/*.test.ts'],
    rules: {
      'max-lines-per-function': 'off',
      'max-lines': 'off',
      'no-restricted-imports': 'off',
      'no-restricted-globals': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },
  {
    files: ['apps/**/*.ts', 'apps/**/*.tsx'],
    rules: { 'no-console': 'off' },
  },
  {
    /**
     * Container wiring, not application code. A Nest module class is empty by design, and a
     * `useFactory` takes one argument per port it assembles — collapsing those into an object
     * would defeat the framework's own injection. The rules stay on everywhere else.
     */
    files: ['apps/api/src/**/*.module.ts'],
    rules: {
      'max-params': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
    },
  },
);
