import { defineConfig } from 'vitest/config';

/**
 * The active Server suite is Vitest. The files below still use node:test and
 * are legacy duplicates of coverage that now lives in the Vitest suites. Vitest
 * reports them as "No test suite found", so keep them (and generated .test-dist
 * output) out of the default run. They can still be run explicitly with
 * `npx tsx --test <file>` when needed.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/.test-dist/**',
      'tests/contestRoutes.test.ts',
      'tests/interview.test.ts',
      'tests/leaderboard.test.ts',
      'tests/plagiarism.test.ts',
      'tests/rateLimiter.test.ts',
    ],
  },
});
