import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Prisma auto-loads DATABASE_URL from .env itself, which is why tests
    // worked without this before — but nothing else does that for env vars
    // only our own code reads (JWT_SECRET). Load .env the same way
    // `server.ts` does, so tests see the same environment the running app
    // does.
    setupFiles: ['./vitest.setup.ts'],
  },
});
