import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

export const vehiclesRouter = Router();

/**
 * GET /vehicles
 *
 * Every vehicle row, ordered by make then model. Small enough (32 rows on
 * the seeded GMB data) to return in full rather than paginate — the browse
 * UI uses this to build the make/model filter dropdowns, deriving distinct
 * makes and each make's models client-side rather than needing two more
 * endpoints for that.
 */
vehiclesRouter.get('/', async (_req, res, next) => {
  try {
    const vehicles = await prisma.vehicle.findMany({
      orderBy: [{ make: 'asc' }, { model: 'asc' }],
    });
    res.json({ vehicles });
  } catch (err) {
    next(err);
  }
});
