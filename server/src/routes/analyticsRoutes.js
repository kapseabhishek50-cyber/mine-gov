import { Router } from 'express';
import { getDashboardSummary, getDashboardTrends, getRiskOverview } from '../services/analyticsService.js';
import { getReport } from '../services/reportService.js';
import { requestedMineId } from '../utils/access.js';
import { searchRecords } from '../services/searchService.js';
import { aiService } from '../services/aiService.js';
import { HttpError } from '../utils/httpError.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { syncAlerts } from '../services/alertEngine.js';

const router = Router();
const mineScope = (req) => requestedMineId(req.user, req.query.mineId);

router.get('/dashboard/summary', asyncHandler(async (req, res) => { await syncAlerts(); res.json(await getDashboardSummary(mineScope(req))); }));
router.get('/dashboard/trends', asyncHandler(async (req, res) => res.json(await getDashboardTrends(mineScope(req)))));
router.get('/dashboard/risk', asyncHandler(async (req, res) => res.json(await getRiskOverview(mineScope(req)))));
router.get('/risk', asyncHandler(async (req, res) => res.json(await getRiskOverview(mineScope(req)))));
router.get('/reports/management/summary', asyncHandler(async (req, res) => res.json({ generatedAt: new Date().toISOString(), summary: await getDashboardSummary(mineScope(req)), mines: await getRiskOverview(mineScope(req)) })));
router.get('/reports/:type', asyncHandler(async (req, res) => {
  const mineId = mineScope(req);
  const filters = { ...req.query, mineId: mineId || req.query.mineId };
  res.json({ rows: await getReport(req.params.type, filters) });
}));
router.post('/ai/chat', asyncHandler(async (req, res) => {
  const question = String(req.body?.question || '').trim();
  if (question.length < 3 || question.length > 1000) throw new HttpError(400, 'Ask a question between 3 and 1000 characters.');
  const result = await aiService.answer(question, req.user);
  res.json({ ...result, generatedAt: new Date().toISOString() });
}));
router.post('/ai/summary', asyncHandler(async (req, res) => res.json(await aiService.answer('Generate a monthly compliance summary and prioritize the most important risks.', req.user))));
router.get('/search', asyncHandler(async (req, res) => res.json(await searchRecords(req.query.q, mineScope(req)))));

export default router;
