import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { findFitmentsForVehicle } from '../services/fitment.js';

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

const idParamSchema = z.object({ id: z.uuid() });

/**
 * GET /vehicles/:id/fitments
 *
 * Phase 4 (PLAN.md §10) — the vehicle → parts direction: "what fits my
 * Canter?" See `findFitmentsForVehicle`. `ambiguous: true` means more than
 * one distinct part is asserted for this vehicle and nothing in the stored
 * data distinguishes them — the caller must show every candidate, not pick
 * one (PLAN.md §7).
 */
vehiclesRouter.get('/:id/fitments', async (req, res, next) => {
  try {
    const { id } = idParamSchema.parse(req.params);

    const vehicle = await prisma.vehicle.findUnique({ where: { id } });
    if (vehicle === null) {
      res.status(404).json({ error: 'vehicle not found' });
      return;
    }

    const result = await findFitmentsForVehicle(id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
