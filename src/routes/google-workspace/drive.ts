import { Router, Request, Response } from 'express';
import googleWorkspaceService from '../../services/googleWorkspaceService';

const router = Router();

// GET /drive/v3/files - List files
router.get('/files', (req: Request, res: Response) => {
  const q = req.query.q as string | undefined;
  const pageSize = parseInt(req.query.pageSize as string) || 25;

  const result = googleWorkspaceService.listFiles(q, pageSize);

  res.json({
    kind: 'drive#fileList',
    incompleteSearch: false,
    files: result.files,
    nextPageToken: result.nextPageToken,
  });
});

// GET /drive/v3/files/:id - Get file metadata
router.get('/files/:id', (req: Request, res: Response) => {
  const file = googleWorkspaceService.getFile(req.params.id);

  if (!file) {
    res.status(404).json({
      error: {
        code: 404,
        message: 'File not found.',
        errors: [{ domain: 'global', reason: 'notFound', message: 'File not found.' }],
      },
    });
    return;
  }

  res.json({ kind: 'drive#file', ...file });
});

// POST /drive/v3/files - Create file (metadata only)
router.post('/files', (req: Request, res: Response) => {
  const file = googleWorkspaceService.createFile(req.body);
  res.status(201).json({ kind: 'drive#file', ...file });
});

export default router;
