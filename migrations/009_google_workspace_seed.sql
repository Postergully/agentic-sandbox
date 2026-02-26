-- Google Workspace connector registration
-- Uses in-memory mock data (no DB tables needed for MVP)

INSERT INTO connectors (id, name, type, description, status, config)
VALUES (
  'google_workspace',
  'Google Workspace',
  'productivity_suite',
  'Google Workspace mock server — Drive, Calendar, Gmail APIs for AI agent testing',
  'active',
  '{
    "baseUrl": "/api/google",
    "services": ["drive", "calendar", "gmail"],
    "authentication": {
      "type": "oauth2",
      "tokenEndpoint": "/api/google/oauth2/v4/token"
    }
  }'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  description = EXCLUDED.description,
  config = EXCLUDED.config;
