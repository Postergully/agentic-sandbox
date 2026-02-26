import { Router, Request, Response } from 'express';
import googleWorkspaceService from '../../services/googleWorkspaceService';

const router = Router();

// GET /gmail/v1/users/me/messages - List messages
router.get('/users/me/messages', (req: Request, res: Response) => {
  const maxResults = parseInt(req.query.maxResults as string) || 25;
  const labelIds = req.query.labelIds
    ? (Array.isArray(req.query.labelIds) ? req.query.labelIds as string[] : [req.query.labelIds as string])
    : undefined;

  const result = googleWorkspaceService.listMessages(labelIds, maxResults);

  res.json({
    messages: result.messages,
    resultSizeEstimate: result.messages.length,
  });
});

// GET /gmail/v1/users/me/messages/:id - Get message
router.get('/users/me/messages/:id', (req: Request, res: Response) => {
  const message = googleWorkspaceService.getMessage(req.params.id);

  if (!message) {
    res.status(404).json({
      error: {
        code: 404,
        message: 'Not Found',
        errors: [{ domain: 'global', reason: 'notFound', message: 'Requested entity was not found.' }],
      },
    });
    return;
  }

  res.json(message);
});

// GET /gmail/v1/users/me/labels - List labels
router.get('/users/me/labels', (_req: Request, res: Response) => {
  res.json({
    labels: googleWorkspaceService.getLabels(),
  });
});

export default router;
