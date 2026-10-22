import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    // Phase 0 shipped a complete harness with an empty src/. verify.mjs reports the unit gate as
    // SKIP in that state rather than inventing a pass.
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/**/*.d.ts'],
      reporter: ['text', 'json-summary'],
      // Thresholds are NOT configured here. Vitest's single global threshold cannot express this
      // project's architecture: src/core is verified by unit tests to 100%, while src/app and
      // src/testing are verified through Playwright (AGENTS.md §7), so a global unit-coverage
      // figure over all three is meaningless — and no implementation could ever satisfy it.
      //
      // Vitest's per-glob thresholds were tried first and do not exclude matched files from the
      // global figure in v5, so the policy is enforced explicitly by the gate instead:
      //   scripts/check-coverage-policy.mjs  (npm run gate:coverage-policy)
      //
      // That gate is also stricter than a global number: it fails on any NEW directory under src/
      // that has no declared policy, so untested code cannot arrive unnoticed.
    },
  },
});
