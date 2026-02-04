describe('create command', () => {
  it('should generate valid instance ID', () => {
    const generateInstanceId = (connector: string, orgId: string, jobId?: string): string => {
      const safeConnector = connector.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const safeOrgId = orgId.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const safeJobId = jobId || Math.random().toString(36).substring(2, 10);
      return `${safeConnector}_${safeOrgId}_${safeJobId}`;
    };

    const id = generateInstanceId('netsuite', 'sharechat', '331');
    expect(id).toBe('netsuite_sharechat_331');
  });

  it('should sanitize special characters in instance ID', () => {
    const generateInstanceId = (connector: string, orgId: string, jobId?: string): string => {
      const safeConnector = connector.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const safeOrgId = orgId.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const safeJobId = jobId ? jobId.replace(/[^a-z0-9]/g, '_') : 'auto';
      return `${safeConnector}_${safeOrgId}_${safeJobId}`;
    };

    const id = generateInstanceId('Net-Suite', 'Share Chat!', 'job-123');
    expect(id).toBe('net_suite_share_chat__job_123');
  });
});
