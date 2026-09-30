import jwt from 'jsonwebtoken';
import { get } from '../config/database.js';
import { HttpError } from '../utils/httpError.js';

const secret = () => process.env.JWT_SECRET || 'minegov-ai-development-secret-change-before-deploy';

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, secret(), { expiresIn: '12h', issuer: 'minegov-ai' });
}

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new HttpError(401, 'Sign in to continue.');
    const payload = jwt.verify(token, secret(), { issuer: 'minegov-ai' });
    const user = await get('users', payload.sub);
    if (!user || user.active === false) throw new HttpError(401, 'Your session is no longer valid. Please sign in again.');
    req.user = user;
    next();
  } catch (error) {
    next(error instanceof HttpError ? error : new HttpError(401, 'Your session has expired. Please sign in again.'));
  }
}

export const allowRoles = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) return next(new HttpError(403, 'You do not have permission to perform this action.'));
  next();
};
