import express from 'express';
import cors from 'cors';
import { partsRouter } from './routes/parts.js';
import { categoriesRouter } from './routes/categories.js';
import { brandsRouter } from './routes/brands.js';
import { vehiclesRouter } from './routes/vehicles.js';
import { authRouter } from './routes/auth.js';
import { chatRouter } from './routes/chat.js';
import { usersRouter } from './routes/users.js';
import { reportsRouter } from './routes/reports.js';
import { errorHandler } from './middleware/error-handler.js';

/**
 * The Express app, built but not listening — split out from `server.ts` so
 * tests can `import { app }` and drive it with supertest directly, with no
 * real port bound and no risk of two test runs colliding on one.
 *
 * Staff routes are gated by `requireAuth`/`requireRole` (see
 * middleware/require-auth.ts), not by anything in this file — auth is
 * per-route, not a blanket prefix, so the customer-facing routes stay
 * exactly as open as before.
 */
export function createApp() {
  const app = express();
  app.use(express.json());

  // Open CORS, even now that JWT-gated staff routes exist: auth here is a
  // bearer token in an `Authorization` header, not a cookie, so it is never
  // a "credential" in the CORS sense — a cross-origin site can't attach a
  // token it was never given. The thing CORS credentials mode protects
  // against (ambient cookie auth) doesn't apply to this API.
  app.use(cors());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/parts', partsRouter);
  app.use('/categories', categoriesRouter);
  app.use('/brands', brandsRouter);
  app.use('/vehicles', vehiclesRouter);
  app.use('/auth', authRouter);
  app.use('/chat', chatRouter);
  app.use('/users', usersRouter);
  app.use('/reports', reportsRouter);

  app.use(errorHandler);

  return app;
}
