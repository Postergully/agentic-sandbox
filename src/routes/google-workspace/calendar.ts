import { Router, Request, Response } from 'express';
import googleWorkspaceService from '../../services/googleWorkspaceService';

const router = Router();

// GET /calendar/v3/calendars/:calendarId/events - List events
router.get('/calendars/:calendarId/events', (req: Request, res: Response) => {
  const maxResults = parseInt(req.query.maxResults as string) || 25;
  const result = googleWorkspaceService.listEvents(req.params.calendarId, maxResults);

  res.json({
    kind: 'calendar#events',
    summary: req.params.calendarId === 'primary' ? 'Mock User Calendar' : req.params.calendarId,
    timeZone: 'America/Los_Angeles',
    items: result.items,
  });
});

// GET /calendar/v3/calendars/:calendarId/events/:eventId - Get event
router.get('/calendars/:calendarId/events/:eventId', (req: Request, res: Response) => {
  const event = googleWorkspaceService.getEvent(req.params.calendarId, req.params.eventId);

  if (!event) {
    res.status(404).json({
      error: {
        code: 404,
        message: 'Not Found',
        errors: [{ domain: 'global', reason: 'notFound', message: 'Not Found' }],
      },
    });
    return;
  }

  res.json({ kind: 'calendar#event', ...event });
});

// POST /calendar/v3/calendars/:calendarId/events - Create event
router.post('/calendars/:calendarId/events', (req: Request, res: Response) => {
  const event = googleWorkspaceService.createEvent(req.params.calendarId, req.body);
  res.status(201).json({ kind: 'calendar#event', ...event });
});

export default router;
