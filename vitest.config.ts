import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // Resolves the `@/*` path alias declared in tsconfig.json.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    environment: 'node',
    // Tests never touch a real database, real Supabase or a real SMS provider.
    env: {
      NODE_ENV: 'test',
    },
  },
});