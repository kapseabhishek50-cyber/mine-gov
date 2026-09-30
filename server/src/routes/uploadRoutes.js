import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDirectory = path.resolve(__dirname, '../../uploads');
fs.mkdirSync(uploadDirectory, { recursive: true });
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadDirectory),
  filename: (_req, file, callback) => callback(null, `${Date.now()}-${crypto.randomBytes(5).toString('hex')}${path.extname(file.originalname).toLowerCase()}`),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024, files: 8 }, fileFilter: (_req, file, callback) => {
  if (!allowedTypes.has(file.mimetype)) return callback(new HttpError(400, 'Upload a JPG, PNG, WebP, PDF, or document file.'));
  callback(null, true);
} });

router.post('/', upload.array('files', 8), asyncHandler(async (req, res) => {
  const files = (req.files || []).map((file) => ({ name: file.originalname, url: `/api/uploads/files/${file.filename}`, size: file.size, uploadedAt: new Date().toISOString() }));
  if (!files.length) throw new HttpError(400, 'Choose at least one file to upload.');
  res.status(201).json({ files });
}));

export const uploadDirectoryPath = uploadDirectory;
export default router;
