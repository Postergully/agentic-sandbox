#!/usr/bin/env npx ts-node
/**
 * End-to-End Test: Google Workspace Mock Server Routes
 *
 * Tests the in-memory mock endpoints for Drive, Calendar, and Gmail.
 * Requires the server to be running: npm run dev
 *
 * Run with: npx ts-node scripts/test-google-workspace-mock-e2e.ts
 */

import axios, { AxiosInstance } from 'axios';

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api/google';

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

const results: TestResult[] = [];

async function runTest(name: string, testFn: () => Promise<void>): Promise<boolean> {
  const start = Date.now();
  process.stdout.write(`  ${name}... `);
  try {
    await testFn();
    const duration = Date.now() - start;
    results.push({ name, passed: true, duration });
    console.log(`PASSED (${duration}ms)`);
    return true;
  } catch (error) {
    const duration = Date.now() - start;
    const msg = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, duration, error: msg });
    console.log(`FAILED: ${msg}`);
    return false;
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  Google Workspace Mock Server E2E Tests          ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`  Base URL: ${BASE_URL}`);
  console.log(`  Time:     ${new Date().toISOString()}\n`);

  const api: AxiosInstance = axios.create({ baseURL: BASE_URL, timeout: 5000 });

  // ── Health ──────────────────────────────────────────────────
  console.log('── Health ──');
  await runTest('Health check returns healthy', async () => {
    const res = await api.get('/health');
    assert(res.data.status === 'healthy', `Expected healthy, got ${res.data.status}`);
    assert(res.data.connector === 'google-workspace', `Wrong connector: ${res.data.connector}`);
  });

  // ── OAuth2 ─────────────────────────────────────────────────
  console.log('\n── OAuth2 ──');
  let accessToken = '';

  await runTest('POST /oauth2/v4/token returns access token', async () => {
    const res = await api.post('/oauth2/v4/token', {
      grant_type: 'authorization_code',
      code: 'mock-code',
      client_id: 'test-client',
      client_secret: 'test-secret',
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(!!res.data.access_token, 'Missing access_token');
    assert(res.data.token_type === 'Bearer', 'Wrong token_type');
    assert(typeof res.data.expires_in === 'number', 'Missing expires_in');
    accessToken = res.data.access_token;
  });

  await runTest('POST /oauth2/v4/token rejects missing grant_type', async () => {
    try {
      await api.post('/oauth2/v4/token', { code: 'x' });
      throw new Error('Should have returned 400');
    } catch (err: any) {
      assert(err.response?.status === 400, `Expected 400, got ${err.response?.status}`);
    }
  });

  // ── Drive ──────────────────────────────────────────────────
  console.log('\n── Drive ──');
  let fileId = '';

  await runTest('GET /drive/v3/files lists files', async () => {
    const res = await api.get('/drive/v3/files', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    assert(res.data.kind === 'drive#fileList', 'Wrong kind');
    assert(Array.isArray(res.data.files), 'files is not array');
    assert(res.data.files.length > 0, 'No files returned');
    fileId = res.data.files[0].id;
  });

  await runTest('GET /drive/v3/files/:id returns file', async () => {
    const res = await api.get(`/drive/v3/files/${fileId}`);
    assert(res.data.kind === 'drive#file', 'Wrong kind');
    assert(res.data.id === fileId, 'ID mismatch');
  });

  await runTest('GET /drive/v3/files/:id returns 404 for unknown', async () => {
    try {
      await api.get('/drive/v3/files/nonexistent-id');
      throw new Error('Should have returned 404');
    } catch (err: any) {
      assert(err.response?.status === 404, `Expected 404, got ${err.response?.status}`);
    }
  });

  await runTest('POST /drive/v3/files creates file', async () => {
    const res = await api.post('/drive/v3/files', {
      name: 'E2E Test File.txt',
      mimeType: 'text/plain',
    });
    assert(res.status === 201, `Expected 201, got ${res.status}`);
    assert(res.data.name === 'E2E Test File.txt', 'Name mismatch');
    assert(!!res.data.id, 'Missing id');
  });

  // ── Calendar ───────────────────────────────────────────────
  console.log('\n── Calendar ──');
  let eventId = '';

  await runTest('GET /calendar/v3/calendars/primary/events lists events', async () => {
    const res = await api.get('/calendar/v3/calendars/primary/events');
    assert(res.data.kind === 'calendar#events', 'Wrong kind');
    assert(Array.isArray(res.data.items), 'items is not array');
    assert(res.data.items.length > 0, 'No events returned');
    eventId = res.data.items[0].id;
  });

  await runTest('GET /calendar/v3/calendars/primary/events/:id returns event', async () => {
    const res = await api.get(`/calendar/v3/calendars/primary/events/${eventId}`);
    assert(res.data.kind === 'calendar#event', 'Wrong kind');
    assert(res.data.id === eventId, 'ID mismatch');
  });

  await runTest('POST /calendar/v3/calendars/primary/events creates event', async () => {
    const res = await api.post('/calendar/v3/calendars/primary/events', {
      summary: 'E2E Test Event',
      start: { dateTime: '2026-03-01T10:00:00Z', timeZone: 'UTC' },
      end: { dateTime: '2026-03-01T11:00:00Z', timeZone: 'UTC' },
    });
    assert(res.status === 201, `Expected 201, got ${res.status}`);
    assert(res.data.summary === 'E2E Test Event', 'Summary mismatch');
  });

  // ── Gmail ──────────────────────────────────────────────────
  console.log('\n── Gmail ──');
  let messageId = '';

  await runTest('GET /gmail/v1/users/me/messages lists messages', async () => {
    const res = await api.get('/gmail/v1/users/me/messages');
    assert(Array.isArray(res.data.messages), 'messages is not array');
    assert(res.data.messages.length > 0, 'No messages returned');
    assert(typeof res.data.resultSizeEstimate === 'number', 'Missing resultSizeEstimate');
    messageId = res.data.messages[0].id;
  });

  await runTest('GET /gmail/v1/users/me/messages/:id returns message', async () => {
    const res = await api.get(`/gmail/v1/users/me/messages/${messageId}`);
    assert(res.data.id === messageId, 'ID mismatch');
    assert(Array.isArray(res.data.labelIds), 'Missing labelIds');
    assert(!!res.data.payload, 'Missing payload');
  });

  await runTest('GET /gmail/v1/users/me/messages/:id returns 404 for unknown', async () => {
    try {
      await api.get('/gmail/v1/users/me/messages/nonexistent-id');
      throw new Error('Should have returned 404');
    } catch (err: any) {
      assert(err.response?.status === 404, `Expected 404, got ${err.response?.status}`);
    }
  });

  await runTest('GET /gmail/v1/users/me/labels lists labels', async () => {
    const res = await api.get('/gmail/v1/users/me/labels');
    assert(Array.isArray(res.data.labels), 'labels is not array');
    assert(res.data.labels.length > 0, 'No labels returned');
    const inbox = res.data.labels.find((l: any) => l.id === 'INBOX');
    assert(!!inbox, 'INBOX label not found');
  });

  // ── Summary ────────────────────────────────────────────────
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log(`║  Results: ${passed} passed, ${failed} failed, ${results.length} total`);
  console.log('╚══════════════════════════════════════════════════╝');

  if (failed > 0) {
    console.log('\n  Failed tests:');
    results.filter(r => !r.passed).forEach(r => console.log(`    ✗ ${r.name}: ${r.error}`));
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
