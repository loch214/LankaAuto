import express from 'express';
import cors from 'cors';
import { partsRouter } from './routes/parts.js';
import { categoriesRouter } from './routes/categories.js';
import { brandsRouter } from './routes/brands.js';
import { vehiclesRouter } from './routes/vehicles.js';
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

  // Open CORS: this is a public, unauthenticated, read-only catalogue API —
  // there is no session or credential a cross-origin request could steal.
  // Revisit when the staff routes (Phase 6, JWT-gated) land, since those
  // will need the real frontend origin, not a wildcard.
  app.use(cors());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/parts', partsRouter);
  app.use('/categories', categoriesRouter);
  app.use('/brands', brandsRouter);
  app.use('/vehicles', vehiclesRouter);

  app.use(errorHandler);

  return app;
}
