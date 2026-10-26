import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/server/services/**', 'src/server/auth/permissions.ts'],
      exclude: ['src/lib/cloudinary-loader.ts'],
      thresholds: { lines: 90, branches: 90, functions: 90, statements: 90 },
    },
  },
});
