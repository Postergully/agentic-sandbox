import { Router } from 'express';
import authRoutes from './auth';
import driveRoutes from './drive';
import calendarRoutes from './calendar';
import gmailRoutes from './gmail';

const router = Router();

// Mount Google OAuth2 routes
router.use('/oauth2/v4', authRoutes);

// Mount Google Drive API routes
router.use('/drive/v3', driveRoutes);

// Mount Google Calendar API routes
router.use('/calendar/v3', calendarRoutes);

// Mount Gmail API routes
router.use('/gmail/v1', gmailRoutes);

// Health check for Google Workspace endpoint
router.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    connector: 'google-workspace',
    version: '1.0.0',
    services: ['drive', 'calendar', 'gmail'],
    timestamp: new Date().toISOString(),
  });
});

export default router;
