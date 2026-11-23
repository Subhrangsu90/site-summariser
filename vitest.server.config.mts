import { defineConfig } from 'vitest/config';

/**
 * Server tests run in plain Node (they use node:dns / node:net), separate from
 * `ng test`, which runs the Angular specs in a browser-like environment.
 */
export default defineConfig({
  test: {
    include: ['src/server/**/*.spec.ts'],
    environment: 'node',
  },
});
