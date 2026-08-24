import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

/**
 * Single place that turns a thrown error into an HTTP response.
 *
 * Zod's `.parse()` throws on bad input — routes call `next(err)` and let this
 * middleware translate that into a 400 with the field-level detail, rather
 * than each route hand-rolling its own try/catch response shape.
 *
 * Must be registered LAST, after every route — Express recognises an error
 * handler by its four-parameter arity, and only calls it when something
 * upstream calls `next(err)`.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'invalid request', issues: err.issues });
    return;
  }

  console.error(err);
  res.status(500).json({ error: 'internal server error' });
};
