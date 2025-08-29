import { db } from '../db';
import { auditLogsTable } from '../db/schema';
import { type CreateAuditLogInput, type AuditLog } from '../schema';
import { desc, eq, gte, lte, and, SQL } from 'drizzle-orm';

export const createAuditLog = async (input: CreateAuditLogInput): Promise<AuditLog> => {
  try {
    const result = await db.insert(auditLogsTable)
      .values({
        username: input.username,
        action: input.action,
        details: input.details,
        timestamp: new Date() // Always use current timestamp for audit logs
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Audit log creation failed:', error);
    throw error;
  }
};

export const getAuditLogs = async (limit: number = 100, offset: number = 0): Promise<AuditLog[]> => {
  try {
    const results = await db.select()
      .from(auditLogsTable)
      .orderBy(desc(auditLogsTable.timestamp))
      .limit(limit)
      .offset(offset)
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to fetch audit logs:', error);
    throw error;
  }
};

export const getAuditLogsByUser = async (username: string, limit: number = 100): Promise<AuditLog[]> => {
  try {
    const results = await db.select()
      .from(auditLogsTable)
      .where(eq(auditLogsTable.username, username))
      .orderBy(desc(auditLogsTable.timestamp))
      .limit(limit)
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to fetch audit logs by user:', error);
    throw error;
  }
};

export const getAuditLogsByAction = async (action: string, limit: number = 100): Promise<AuditLog[]> => {
  try {
    const results = await db.select()
      .from(auditLogsTable)
      .where(eq(auditLogsTable.action, action))
      .orderBy(desc(auditLogsTable.timestamp))
      .limit(limit)
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to fetch audit logs by action:', error);
    throw error;
  }
};

export const getAuditLogsByDateRange = async (startDate: Date, endDate: Date): Promise<AuditLog[]> => {
  try {
    const conditions: SQL<unknown>[] = [];
    
    conditions.push(gte(auditLogsTable.timestamp, startDate));
    conditions.push(lte(auditLogsTable.timestamp, endDate));

    const results = await db.select()
      .from(auditLogsTable)
      .where(and(...conditions))
      .orderBy(desc(auditLogsTable.timestamp))
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to fetch audit logs by date range:', error);
    throw error;
  }
};