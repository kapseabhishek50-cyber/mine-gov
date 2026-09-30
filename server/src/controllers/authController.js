import bcrypt from 'bcryptjs';
import { findOne } from '../config/database.js';
import { signToken } from '../middleware/auth.js';
import { HttpError } from '../utils/httpError.js';
import { parseBody } from '../utils/validate.js';
import { z } from 'zod';

const loginSchema = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(72) });
const safeUser = ({ passwordHash, password: _password, ...user }) => user;

export async function login(req, res) {
  const { email, password } = parseBody(loginSchema, req.body);
  const user = await findOne('users', (item) => item.email.toLowerCase() === email.toLowerCase());
  if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) throw new HttpError(401, 'Email or password is incorrect.');
  res.json({ token: signToken(user), user: safeUser(user) });
}
export function logout(_req, res) { res.json({ success: true }); }
export function me(req, res) { res.json({ user: safeUser(req.user) }); }
