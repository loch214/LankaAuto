import express from 'express';
import { partsRouter } from './routes/parts.js';
import { errorHandler } from './middleware/error-handler.js';

/**
 * The Express app, built but not listening — split out from `server.ts` so
 * tests can `import { app }` and drive it with supertest directly, with no
 * real port bound and no risk of two test runs colliding on one.
 *
 * No auth here. PLAN.md §7/§8 puts staff-only tools behind JWT role
 * middleware, but that is Phase 6 — everything mounted here is the
 * customer-facing, read-only surface, deliberately first.
 */
export function createApp() {
  const app = express();

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/parts', partsRouter);

  app.use(errorHandler);

  return app;
}
