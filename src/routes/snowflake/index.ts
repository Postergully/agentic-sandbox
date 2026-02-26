import { Router } from 'express';
import authRoutes from './auth';
import statementRoutes from './statements';

const router = Router();

// Mount auth routes at /oauth
router.use('/oauth', authRoutes);

// Mount statement routes at /statements
router.use('/statements', statementRoutes);

// Health check for Snowflake endpoint
router.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    connector: 'snowflake',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

export default router;
