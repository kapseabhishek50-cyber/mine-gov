import { z } from 'zod';
import { HttpError } from './httpError.js';

export function parseBody(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(400, 'Please check the form fields.', result.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })));
  return result.data;
}

export const idSchema = z.string().min(1, 'A record is required.');
export const evidenceSchema = z.array(z.object({ name: z.string(), url: z.string().optional(), uploadedAt: z.string().optional() })).optional();
