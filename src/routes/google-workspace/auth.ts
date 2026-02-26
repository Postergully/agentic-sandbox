import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// POST /oauth2/v4/token - Google OAuth2 token endpoint
router.post('/token', (req: Request, res: Response) => {
  const { grant_type, code, refresh_token, client_id, client_secret } = req.body;

  // Accept any credentials for mock
  if (!grant_type) {
    res.status(400).json({
      error: 'invalid_request',
      error_description: 'Missing grant_type parameter',
    });
    return;
  }

  if (grant_type === 'authorization_code' && !code) {
    res.status(400).json({
      error: 'invalid_grant',
      error_description: 'Missing authorization code',
    });
    return;
  }

  if (grant_type === 'refresh_token' && !refresh_token) {
    res.status(400).json({
      error: 'invalid_grant',
      error_description: 'Missing refresh_token',
    });
    return;
  }

  void client_id;
  void client_secret;

  res.json({
    access_token: `ya29.mock-${uuidv4()}`,
    token_type: 'Bearer',
    expires_in: 3600,
    refresh_token: `1//mock-refresh-${uuidv4()}`,
    scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.readonly',
  });
});

// GET /oauth2/v4/authorize - Authorization endpoint (mock)
router.get('/authorize', (_req: Request, res: Response) => {
  const code = `mock-auth-code-${uuidv4()}`;
  const redirectUri = (_req.query.redirect_uri as string) || 'http://localhost:3000/callback';
  res.redirect(`${redirectUri}?code=${code}&state=${_req.query.state || ''}`);
});

export default router;
