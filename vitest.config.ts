import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    // Phase 0 ships a complete harness with an empty src/. verify.mjs reports the unit gate as
    // SKIP in that state rather than inventing a pass.
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/**/*.d.ts'],
      reporter: ['text', 'json-summary'],
      // src/core is pure, deterministic and framework-free, so there is no excuse for an untested
      // branch in it. The lower global figure covers the React shell, where behaviour is asserted
      // through E2E instead.
      thresholds: {
        lines: 85,
        branches: 85,
        functions: 85,
        statements: 85,
        'src/core/**/*.ts': {
          lines: 100,
          branches: 100,
          functions: 100,
          statements: 100,
        },
      },
    },
  },
});
