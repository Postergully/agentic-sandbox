import { v4 as uuidv4 } from 'uuid';

// In-memory mock data for Google Workspace APIs

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  createdTime: string;
  modifiedTime: string;
  parents: string[];
  webViewLink: string;
  owners: Array<{ displayName: string; emailAddress: string }>;
  trashed: boolean;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  description: string;
  location: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  status: string;
  creator: { email: string; displayName: string };
  attendees: Array<{ email: string; responseStatus: string }>;
  created: string;
  updated: string;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
    mimeType: string;
    body: { size: number; data?: string };
  };
  internalDate: string;
  sizeEstimate: number;
}

class GoogleWorkspaceService {
  private driveFiles: DriveFile[] = [
    {
      id: uuidv4(),
      name: 'Q4 Revenue Report.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: '245760',
      createdTime: '2026-01-15T10:30:00Z',
      modifiedTime: '2026-02-20T14:15:00Z',
      parents: ['root'],
      webViewLink: 'https://docs.google.com/spreadsheets/d/abc123',
      owners: [{ displayName: 'Alice Johnson', emailAddress: 'alice@example.com' }],
      trashed: false,
    },
    {
      id: uuidv4(),
      name: 'Product Roadmap 2026.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: '102400',
      createdTime: '2026-02-01T09:00:00Z',
      modifiedTime: '2026-02-25T11:30:00Z',
      parents: ['root'],
      webViewLink: 'https://docs.google.com/document/d/def456',
      owners: [{ displayName: 'Bob Smith', emailAddress: 'bob@example.com' }],
      trashed: false,
    },
    {
      id: uuidv4(),
      name: 'Team Photos',
      mimeType: 'application/vnd.google-apps.folder',
      size: '0',
      createdTime: '2025-11-20T08:00:00Z',
      modifiedTime: '2026-01-10T16:45:00Z',
      parents: ['root'],
      webViewLink: 'https://drive.google.com/drive/folders/ghi789',
      owners: [{ displayName: 'Alice Johnson', emailAddress: 'alice@example.com' }],
      trashed: false,
    },
    {
      id: uuidv4(),
      name: 'Architecture Diagram.png',
      mimeType: 'image/png',
      size: '524288',
      createdTime: '2026-02-10T13:00:00Z',
      modifiedTime: '2026-02-10T13:00:00Z',
      parents: ['root'],
      webViewLink: 'https://drive.google.com/file/d/jkl012',
      owners: [{ displayName: 'Charlie Dev', emailAddress: 'charlie@example.com' }],
      trashed: false,
    },
  ];

  private calendarEvents: CalendarEvent[] = [
    {
      id: uuidv4(),
      summary: 'Sprint Planning',
      description: 'Plan upcoming sprint tasks and priorities',
      location: 'Conference Room A',
      start: { dateTime: '2026-02-27T09:00:00-08:00', timeZone: 'America/Los_Angeles' },
      end: { dateTime: '2026-02-27T10:00:00-08:00', timeZone: 'America/Los_Angeles' },
      status: 'confirmed',
      creator: { email: 'alice@example.com', displayName: 'Alice Johnson' },
      attendees: [
        { email: 'bob@example.com', responseStatus: 'accepted' },
        { email: 'charlie@example.com', responseStatus: 'tentative' },
      ],
      created: '2026-02-20T10:00:00Z',
      updated: '2026-02-25T08:30:00Z',
    },
    {
      id: uuidv4(),
      summary: '1:1 with Manager',
      description: 'Weekly check-in',
      location: '',
      start: { dateTime: '2026-02-27T14:00:00-08:00', timeZone: 'America/Los_Angeles' },
      end: { dateTime: '2026-02-27T14:30:00-08:00', timeZone: 'America/Los_Angeles' },
      status: 'confirmed',
      creator: { email: 'manager@example.com', displayName: 'Dana Manager' },
      attendees: [{ email: 'alice@example.com', responseStatus: 'accepted' }],
      created: '2026-01-05T09:00:00Z',
      updated: '2026-02-24T11:00:00Z',
    },
    {
      id: uuidv4(),
      summary: 'Product Demo',
      description: 'Demo new features to stakeholders',
      location: 'Zoom',
      start: { dateTime: '2026-02-28T11:00:00-08:00', timeZone: 'America/Los_Angeles' },
      end: { dateTime: '2026-02-28T12:00:00-08:00', timeZone: 'America/Los_Angeles' },
      status: 'confirmed',
      creator: { email: 'bob@example.com', displayName: 'Bob Smith' },
      attendees: [
        { email: 'alice@example.com', responseStatus: 'accepted' },
        { email: 'charlie@example.com', responseStatus: 'accepted' },
        { email: 'stakeholder@example.com', responseStatus: 'needsAction' },
      ],
      created: '2026-02-18T14:00:00Z',
      updated: '2026-02-25T09:00:00Z',
    },
  ];

  private gmailMessages: GmailMessage[] = [
    {
      id: uuidv4(),
      threadId: 'thread-001',
      labelIds: ['INBOX', 'IMPORTANT'],
      snippet: 'Please review the attached Q4 revenue report before our meeting tomorrow.',
      payload: {
        headers: [
          { name: 'From', value: 'alice@example.com' },
          { name: 'To', value: 'team@example.com' },
          { name: 'Subject', value: 'Q4 Revenue Report - Review Needed' },
          { name: 'Date', value: 'Wed, 25 Feb 2026 10:30:00 -0800' },
        ],
        mimeType: 'text/plain',
        body: { size: 256, data: 'UGxlYXNlIHJldmlldyB0aGUgYXR0YWNoZWQgUTQgcmV2ZW51ZSByZXBvcnQu' },
      },
      internalDate: '1740500000000',
      sizeEstimate: 4096,
    },
    {
      id: uuidv4(),
      threadId: 'thread-002',
      labelIds: ['INBOX'],
      snippet: 'Hey team, the sprint planning meeting has been moved to 9 AM tomorrow.',
      payload: {
        headers: [
          { name: 'From', value: 'bob@example.com' },
          { name: 'To', value: 'team@example.com' },
          { name: 'Subject', value: 'Sprint Planning - Time Change' },
          { name: 'Date', value: 'Tue, 24 Feb 2026 16:00:00 -0800' },
        ],
        mimeType: 'text/plain',
        body: { size: 128 },
      },
      internalDate: '1740430000000',
      sizeEstimate: 2048,
    },
    {
      id: uuidv4(),
      threadId: 'thread-003',
      labelIds: ['INBOX', 'STARRED'],
      snippet: 'The deployment pipeline is now green. All services are running normally.',
      payload: {
        headers: [
          { name: 'From', value: 'ci-bot@example.com' },
          { name: 'To', value: 'devops@example.com' },
          { name: 'Subject', value: 'Deployment Status: SUCCESS' },
          { name: 'Date', value: 'Wed, 25 Feb 2026 08:00:00 -0800' },
        ],
        mimeType: 'text/plain',
        body: { size: 96 },
      },
      internalDate: '1740490000000',
      sizeEstimate: 1536,
    },
  ];

  // Drive operations
  listFiles(query?: string, pageSize = 25): { files: DriveFile[]; nextPageToken?: string } {
    let files = this.driveFiles.filter(f => !f.trashed);
    if (query) {
      const lower = query.toLowerCase();
      files = files.filter(f => f.name.toLowerCase().includes(lower));
    }
    return { files: files.slice(0, pageSize) };
  }

  getFile(id: string): DriveFile | undefined {
    return this.driveFiles.find(f => f.id === id);
  }

  createFile(data: Partial<DriveFile>): DriveFile {
    const file: DriveFile = {
      id: uuidv4(),
      name: data.name || 'Untitled',
      mimeType: data.mimeType || 'application/octet-stream',
      size: data.size || '0',
      createdTime: new Date().toISOString(),
      modifiedTime: new Date().toISOString(),
      parents: data.parents || ['root'],
      webViewLink: `https://drive.google.com/file/d/${uuidv4()}`,
      owners: [{ displayName: 'Mock User', emailAddress: 'user@example.com' }],
      trashed: false,
    };
    this.driveFiles.push(file);
    return file;
  }

  // Calendar operations
  listEvents(calendarId: string, maxResults = 25): { items: CalendarEvent[] } {
    // calendarId is accepted but all events come from the same pool in mock
    void calendarId;
    return { items: this.calendarEvents.slice(0, maxResults) };
  }

  getEvent(calendarId: string, eventId: string): CalendarEvent | undefined {
    void calendarId;
    return this.calendarEvents.find(e => e.id === eventId);
  }

  createEvent(calendarId: string, data: Partial<CalendarEvent>): CalendarEvent {
    void calendarId;
    const event: CalendarEvent = {
      id: uuidv4(),
      summary: data.summary || 'New Event',
      description: data.description || '',
      location: data.location || '',
      start: data.start || { dateTime: new Date().toISOString(), timeZone: 'UTC' },
      end: data.end || { dateTime: new Date(Date.now() + 3600000).toISOString(), timeZone: 'UTC' },
      status: 'confirmed',
      creator: { email: 'user@example.com', displayName: 'Mock User' },
      attendees: data.attendees || [],
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };
    this.calendarEvents.push(event);
    return event;
  }

  // Gmail operations
  listMessages(labelIds?: string[], maxResults = 25): { messages: Array<{ id: string; threadId: string }> } {
    let messages = this.gmailMessages;
    if (labelIds && labelIds.length > 0) {
      messages = messages.filter(m => labelIds.some(l => m.labelIds.includes(l)));
    }
    return {
      messages: messages.slice(0, maxResults).map(m => ({ id: m.id, threadId: m.threadId })),
    };
  }

  getMessage(id: string): GmailMessage | undefined {
    return this.gmailMessages.find(m => m.id === id);
  }

  getLabels(): Array<{ id: string; name: string; type: string }> {
    return [
      { id: 'INBOX', name: 'INBOX', type: 'system' },
      { id: 'SENT', name: 'SENT', type: 'system' },
      { id: 'DRAFT', name: 'DRAFT', type: 'system' },
      { id: 'IMPORTANT', name: 'IMPORTANT', type: 'system' },
      { id: 'STARRED', name: 'STARRED', type: 'system' },
      { id: 'TRASH', name: 'TRASH', type: 'system' },
    ];
  }
}

export default new GoogleWorkspaceService();
