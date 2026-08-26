import { defineConfig } from 'vitest/config';

/**
 * One root config; moon runs `vitest run` per project so each library's tests execute in
 * isolation and are cached independently.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/index.ts'],
    },
  },
});
