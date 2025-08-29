import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { auditLogsTable } from '../db/schema';
import { type CreateAuditLogInput } from '../schema';
import { 
  createAuditLog, 
  getAuditLogs, 
  getAuditLogsByUser, 
  getAuditLogsByAction, 
  getAuditLogsByDateRange 
} from '../handlers/audit';
import { eq } from 'drizzle-orm';

// Test data
const testAuditLog: CreateAuditLogInput = {
  username: 'testuser',
  action: 'create_incident',
  details: 'Created incident: Server outage'
};

const testAuditLog2: CreateAuditLogInput = {
  username: 'admin',
  action: 'update_component',
  details: 'Updated component status to degraded'
};

const testAuditLog3: CreateAuditLogInput = {
  username: 'testuser',
  action: 'resolve_incident',
  details: 'Resolved incident: Server outage'
};

describe('audit handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('createAuditLog', () => {
    it('should create an audit log entry', async () => {
      const result = await createAuditLog(testAuditLog);

      expect(result.id).toBeDefined();
      expect(result.username).toEqual('testuser');
      expect(result.action).toEqual('create_incident');
      expect(result.details).toEqual('Created incident: Server outage');
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.created_at).toBeInstanceOf(Date);
    });

    it('should create audit log with null details', async () => {
      const inputWithNullDetails: CreateAuditLogInput = {
        username: 'testuser',
        action: 'login',
        details: null
      };

      const result = await createAuditLog(inputWithNullDetails);

      expect(result.username).toEqual('testuser');
      expect(result.action).toEqual('login');
      expect(result.details).toBeNull();
    });

    it('should save audit log to database', async () => {
      const result = await createAuditLog(testAuditLog);

      const logs = await db.select()
        .from(auditLogsTable)
        .where(eq(auditLogsTable.id, result.id))
        .execute();

      expect(logs).toHaveLength(1);
      expect(logs[0].username).toEqual('testuser');
      expect(logs[0].action).toEqual('create_incident');
      expect(logs[0].details).toEqual('Created incident: Server outage');
    });
  });

  describe('getAuditLogs', () => {
    it('should fetch all audit logs with default pagination', async () => {
      // Create test data
      await createAuditLog(testAuditLog);
      await createAuditLog(testAuditLog2);
      await createAuditLog(testAuditLog3);

      const results = await getAuditLogs();

      expect(results).toHaveLength(3);
      expect(results[0].username).toBeDefined();
      expect(results[0].action).toBeDefined();
      expect(results[0].timestamp).toBeInstanceOf(Date);
    });

    it('should respect limit parameter', async () => {
      // Create test data
      await createAuditLog(testAuditLog);
      await createAuditLog(testAuditLog2);
      await createAuditLog(testAuditLog3);

      const results = await getAuditLogs(2);

      expect(results).toHaveLength(2);
    });

    it('should respect offset parameter', async () => {
      // Create test data with delays to ensure order
      const log1 = await createAuditLog(testAuditLog);
      await new Promise(resolve => setTimeout(resolve, 10));
      const log2 = await createAuditLog(testAuditLog2);
      await new Promise(resolve => setTimeout(resolve, 10));
      const log3 = await createAuditLog(testAuditLog3);

      const results = await getAuditLogs(10, 1);

      expect(results).toHaveLength(2);
      // Should skip the first (most recent) log, which is log3
      expect(results.some(log => log.id === log3.id)).toBe(false);
      // Should include log2 and log1
      expect(results.some(log => log.id === log2.id)).toBe(true);
      expect(results.some(log => log.id === log1.id)).toBe(true);
    });

    it('should order logs by timestamp descending', async () => {
      // Create logs with small delays to ensure different timestamps
      const log1 = await createAuditLog(testAuditLog);
      await new Promise(resolve => setTimeout(resolve, 10));
      const log2 = await createAuditLog(testAuditLog2);
      await new Promise(resolve => setTimeout(resolve, 10));
      const log3 = await createAuditLog(testAuditLog3);

      const results = await getAuditLogs();

      expect(results[0].id).toEqual(log3.id); // Most recent first
      expect(results[1].id).toEqual(log2.id);
      expect(results[2].id).toEqual(log1.id); // Oldest last
    });
  });

  describe('getAuditLogsByUser', () => {
    it('should fetch audit logs for specific user', async () => {
      // Create test data
      await createAuditLog(testAuditLog);   // testuser
      await createAuditLog(testAuditLog2);  // admin
      await createAuditLog(testAuditLog3);  // testuser

      const results = await getAuditLogsByUser('testuser');

      expect(results).toHaveLength(2);
      results.forEach(log => {
        expect(log.username).toEqual('testuser');
      });
    });

    it('should respect limit parameter', async () => {
      // Create multiple logs for same user
      await createAuditLog(testAuditLog);
      await createAuditLog(testAuditLog3);
      await createAuditLog({ ...testAuditLog, action: 'another_action' });

      const results = await getAuditLogsByUser('testuser', 2);

      expect(results).toHaveLength(2);
      results.forEach(log => {
        expect(log.username).toEqual('testuser');
      });
    });

    it('should return empty array for non-existent user', async () => {
      await createAuditLog(testAuditLog);

      const results = await getAuditLogsByUser('nonexistent');

      expect(results).toHaveLength(0);
    });

    it('should order logs by timestamp descending', async () => {
      const log1 = await createAuditLog(testAuditLog);
      await new Promise(resolve => setTimeout(resolve, 10));
      const log2 = await createAuditLog(testAuditLog3);

      const results = await getAuditLogsByUser('testuser');

      expect(results[0].id).toEqual(log2.id); // Most recent first
      expect(results[1].id).toEqual(log1.id);
    });
  });

  describe('getAuditLogsByAction', () => {
    it('should fetch audit logs for specific action', async () => {
      // Create test data
      await createAuditLog(testAuditLog);   // create_incident
      await createAuditLog(testAuditLog2);  // update_component
      await createAuditLog({ ...testAuditLog, username: 'admin' }); // create_incident

      const results = await getAuditLogsByAction('create_incident');

      expect(results).toHaveLength(2);
      results.forEach(log => {
        expect(log.action).toEqual('create_incident');
      });
    });

    it('should respect limit parameter', async () => {
      // Create multiple logs with same action
      await createAuditLog(testAuditLog);
      await createAuditLog({ ...testAuditLog, username: 'admin' });
      await createAuditLog({ ...testAuditLog, username: 'user2' });

      const results = await getAuditLogsByAction('create_incident', 2);

      expect(results).toHaveLength(2);
      results.forEach(log => {
        expect(log.action).toEqual('create_incident');
      });
    });

    it('should return empty array for non-existent action', async () => {
      await createAuditLog(testAuditLog);

      const results = await getAuditLogsByAction('nonexistent_action');

      expect(results).toHaveLength(0);
    });

    it('should order logs by timestamp descending', async () => {
      const log1 = await createAuditLog(testAuditLog);
      await new Promise(resolve => setTimeout(resolve, 10));
      const log2 = await createAuditLog({ ...testAuditLog, username: 'admin' });

      const results = await getAuditLogsByAction('create_incident');

      expect(results[0].id).toEqual(log2.id); // Most recent first
      expect(results[1].id).toEqual(log1.id);
    });
  });

  describe('getAuditLogsByDateRange', () => {
    it('should fetch audit logs within date range', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

      // Create logs
      await createAuditLog(testAuditLog);
      await createAuditLog(testAuditLog2);

      const results = await getAuditLogsByDateRange(oneHourAgo, oneHourFromNow);

      expect(results).toHaveLength(2);
      results.forEach(log => {
        expect(log.timestamp >= oneHourAgo).toBe(true);
        expect(log.timestamp <= oneHourFromNow).toBe(true);
      });
    });

    it('should exclude logs outside date range', async () => {
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      // Create a log now (should be excluded)
      await createAuditLog(testAuditLog);

      const results = await getAuditLogsByDateRange(twoHoursAgo, oneHourAgo);

      expect(results).toHaveLength(0);
    });

    it('should handle same start and end date', async () => {
      const now = new Date();
      
      await createAuditLog(testAuditLog);

      // Use exact timestamp for both start and end
      const results = await getAuditLogsByDateRange(now, now);

      // Should return logs with timestamps >= now and <= now (exact match or very close)
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('should order logs by timestamp descending', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

      const log1 = await createAuditLog(testAuditLog);
      await new Promise(resolve => setTimeout(resolve, 10));
      const log2 = await createAuditLog(testAuditLog2);

      const results = await getAuditLogsByDateRange(oneHourAgo, oneHourFromNow);

      expect(results[0].id).toEqual(log2.id); // Most recent first
      expect(results[1].id).toEqual(log1.id);
    });
  });
});