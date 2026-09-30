import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { login, logout, me } from '../controllers/authController.js';

const router = Router();
router.post('/login', asyncHandler(login));
router.post('/logout', requireAuth, logout);
router.get('/me', requireAuth, me);
export default router;
