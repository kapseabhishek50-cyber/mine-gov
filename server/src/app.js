import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireAuth } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import authRoutes from './routes/authRoutes.js';
import governanceRoutes from './routes/governanceRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import uploadRoutes, { uploadDirectoryPath } from './routes/uploadRoutes.js';
import { databaseMode, list } from './config/database.js';
import { HttpError } from './utils/httpError.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
// Frame embedding is allowed outside production (so hosted previews and embedded
// dashboards work); production keeps the stricter same-origin default unless
// ALLOW_IFRAME_EMBED=true is explicitly set for an approved embedding host.
const allowIframeEmbed = process.env.ALLOW_IFRAME_EMBED === 'true' || process.env.NODE_ENV !== 'production';
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
  frameguard: allowIframeEmbed ? false : { action: 'sameorigin' },
}));
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()) : process.env.NODE_ENV === 'production' ? false : true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many sign-in attempts. Try again in a few minutes.' } });
app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'MineGov AI API', database: databaseMode(), timestamp: new Date().toISOString() }));
app.use('/api/auth/login', authLimiter);
app.use('/api/auth', authRoutes);
app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 500, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use('/api', requireAuth);
app.use('/api/uploads', uploadRoutes);
app.get('/api/uploads/files/:filename', (req, res, next) => {
  const file = path.basename(req.params.filename);
  const fullPath = path.join(uploadDirectoryPath, file);
  res.sendFile(fullPath, (error) => error && next(new HttpError(404, 'Evidence file not found.')));
});
app.use('/api', governanceRoutes);
app.use('/api', analyticsRoutes);
app.get('/api/meta', async (req, res, next) => {
  try {
    const [mines, alerts] = await Promise.all([list('mines'), list('alerts')]);
    const allAccess = ['ADMIN', 'MANAGEMENT'].includes(req.user.role);
    const unreadAlerts = alerts.filter((alert) => !alert.read && (allAccess || String(alert.mineId) === String(req.user.mineId))).length;
    res.json({ database: databaseMode(), mineCount: allAccess ? mines.length : mines.filter((mine) => String(mine.id) === String(req.user.mineId)).length, unreadAlerts });
  } catch (error) { next(error); }
});
app.use('/api', notFound);

// Serve the built single-page frontend when `npm run build` has produced dist/.
// This lets one service host both the API and the web app (same-origin /api calls).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(process.env.WEB_ROOT || path.join(__dirname, '../../dist'));
const webIndex = path.join(webRoot, 'index.html');
const hasWebBuild = fs.existsSync(webIndex);
if (hasWebBuild) {
  app.use(express.static(webRoot, { index: false, maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));
  app.get(/^\/(?!api\/).*/, (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (!req.accepts('html')) return next();
    res.sendFile(webIndex);
  });
} else {
  app.get('/', (req, res) => res.json({ service: 'MineGov AI API', hint: 'Run `npm run build` to serve the web app from this service, or use the Vite dev server.' }));
}

app.use(errorHandler);

export default app;
