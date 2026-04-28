import { Router } from 'express';
import multer from 'multer';
import { storagePut, storageGetSignedUrl } from './storage';
import type { Request, Response } from 'express';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * Upload audio file to cloud storage
 * POST /api/upload
 * Body: multipart/form-data with 'file' field
 * Response: { fileKey: string, url: string }
 */
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = (req as any).file;
    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Generate unique file key
    const timestamp = Date.now();
    const filename = file.originalname || `audio-${timestamp}.webm`;
    const fileKey = `recordings/${timestamp}-${filename}`;

    // Upload to S3
    const { key, url } = await storagePut(fileKey, file.buffer, file.mimetype);

    res.json({ fileKey: key, url });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

/**
 * Get presigned URL for audio playback
 * GET /api/audio-url?key=<fileKey>
 * Response: { url: string }
 */
router.get('/audio-url', async (req: Request, res: Response) => {
  try {
    const fileKey = req.query.key as string;
    if (!fileKey) {
      return res.status(400).json({ error: 'File key is required' });
    }
    const url = await storageGetSignedUrl(fileKey);
    res.json({ url });
  } catch (error) {
    console.error('Audio URL error:', error);
    res.status(500).json({ error: 'Failed to generate audio URL' });
  }
});

export default router;
