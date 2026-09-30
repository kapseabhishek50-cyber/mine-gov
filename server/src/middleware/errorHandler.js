import { ZodError } from 'zod';
import { HttpError } from '../utils/httpError.js';

export function notFound(req, res) {
  res.status(404).json({ error: 'Not found', message: `No route for ${req.method} ${req.path}` });
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error instanceof ZodError) return res.status(400).json({ error: 'Validation failed', details: error.issues });
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message, details: error.details });
  if (error.name === 'ValidationError' || error.name === 'CastError') return res.status(400).json({ error: error.message });
  console.error(error);
  res.status(error.status || 500).json({ error: error.status && error.status < 500 ? error.message : 'Something went wrong. Please try again.' });
}
