import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  maintenanceWindowsTable,
  maintenanceUpdatesTable,
  maintenanceAffectedComponentsTable,
  componentGroupsTable,
  componentsTable,
  auditLogsTable
} from '../db/schema';
import { 
  type CreateMaintenanceWindowInput,
  type UpdateMaintenanceWindowInput,
  type CreateMaintenanceUpdateInput,
  type UpdateMaintenanceUpdateInput
} from '../schema';
import {
  createMaintenanceWindow,
  getActiveMaintenanceWindows,
  getUpcomingMaintenanceWindows,
  getAllMaintenanceWindows,
  getMaintenanceWindowById,
  updateMaintenanceWindow,
  deleteMaintenanceWindow,
  createMaintenanceUpdate,
  getMaintenanceUpdates,
  updateMaintenanceUpdate,
  deleteMaintenanceUpdate,
  getRecentCompletedMaintenance
} from '../handlers/maintenance';
import { eq } from 'drizzle-orm';

describe('Maintenance Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Helper function to create test data
  async function createTestData() {
    // Create component group
    const groupResult = await db.insert(componentGroupsTable)
      .values({
        name: 'Test Group',
        display_order: 1
      })
      .returning()
      .execute();

    // Create components
    const componentResult = await db.insert(componentsTable)
      .values([
        {
          name: 'Test Component 1',
          status: 'operational',
          display_order: 1,
          group_id: groupResult[0].id
        },
        {
          name: 'Test Component 2',
          status: 'operational',
          display_order: 2,
          group_id: groupResult[0].id
        }
      ])
      .returning()
      .execute();

    return {
      group: groupResult[0],
      components: componentResult
    };
  }

  describe('createMaintenanceWindow', () => {
    it('should create a maintenance window with affected components', async () => {
      const testData = await createTestData();
      
      const input: CreateMaintenanceWindowInput = {
        title: 'Scheduled Database Maintenance',
        description: 'Upgrading database servers',
        start_time: new Date('2024-01-15T02:00:00Z'),
        end_time: new Date('2024-01-15T04:00:00Z'),
        status: 'scheduled',
        affected_component_ids: [testData.components[0].id, testData.components[1].id]
      };

      const result = await createMaintenanceWindow(input);

      expect(result.title).toEqual('Scheduled Database Maintenance');
      expect(result.description).toEqual('Upgrading database servers');
      expect(result.status).toEqual('scheduled');
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.affected_components).toHaveLength(2);
      expect(result.updates).toHaveLength(0);

      // Verify affected components
      const componentNames = result.affected_components.map(c => c.name);
      expect(componentNames).toContain('Test Component 1');
      expect(componentNames).toContain('Test Component 2');
    });

    it('should create maintenance window without affected components', async () => {
      const input: CreateMaintenanceWindowInput = {
        title: 'General Maintenance',
        description: null,
        start_time: new Date('2024-01-20T01:00:00Z'),
        end_time: new Date('2024-01-20T03:00:00Z'),
        status: 'scheduled',
        affected_component_ids: []
      };

      const result = await createMaintenanceWindow(input);

      expect(result.title).toEqual('General Maintenance');
      expect(result.description).toBeNull();
      expect(result.affected_components).toHaveLength(0);
    });

    it('should throw error for non-existent component', async () => {
      const input: CreateMaintenanceWindowInput = {
        title: 'Test Maintenance',
        description: null,
        start_time: new Date('2024-01-15T02:00:00Z'),
        end_time: new Date('2024-01-15T04:00:00Z'),
        status: 'scheduled',
        affected_component_ids: [999] // Non-existent component
      };

      await expect(createMaintenanceWindow(input)).rejects.toThrow(/does not exist/i);
    });

    it('should save to database correctly', async () => {
      const testData = await createTestData();
      
      const input: CreateMaintenanceWindowInput = {
        title: 'Test Maintenance',
        description: 'Test description',
        start_time: new Date('2024-01-15T02:00:00Z'),
        end_time: new Date('2024-01-15T04:00:00Z'),
        status: 'scheduled',
        affected_component_ids: [testData.components[0].id]
      };

      const result = await createMaintenanceWindow(input);

      // Verify in database
      const dbMaintenance = await db.select()
        .from(maintenanceWindowsTable)
        .where(eq(maintenanceWindowsTable.id, result.id))
        .execute();

      expect(dbMaintenance).toHaveLength(1);
      expect(dbMaintenance[0].title).toEqual('Test Maintenance');

      // Verify affected components link
      const affectedComponents = await db.select()
        .from(maintenanceAffectedComponentsTable)
        .where(eq(maintenanceAffectedComponentsTable.maintenance_id, result.id))
        .execute();

      expect(affectedComponents).toHaveLength(1);
      expect(affectedComponents[0].component_id).toEqual(testData.components[0].id);
    });

    it('should log audit trail', async () => {
      const testData = await createTestData();
      
      const input: CreateMaintenanceWindowInput = {
        title: 'Audit Test',
        description: null,
        start_time: new Date('2024-01-15T02:00:00Z'),
        end_time: new Date('2024-01-15T04:00:00Z'),
        status: 'scheduled',
        affected_component_ids: []
      };

      await createMaintenanceWindow(input);

      // Check audit log
      const auditLogs = await db.select()
        .from(auditLogsTable)
        .where(eq(auditLogsTable.action, 'CREATE_MAINTENANCE_WINDOW'))
        .execute();

      expect(auditLogs.length).toBeGreaterThan(0);
      expect(auditLogs[0].details).toContain('Audit Test');
    });
  });

  describe('getActiveMaintenanceWindows', () => {
    it('should return maintenance windows in progress', async () => {
      const testData = await createTestData();
      
      // Create active maintenance (in_progress and current time between start/end)
      const now = new Date();
      const startTime = new Date(now.getTime() - 3600000); // 1 hour ago
      const endTime = new Date(now.getTime() + 3600000); // 1 hour from now
      
      const input: CreateMaintenanceWindowInput = {
        title: 'Active Maintenance',
        description: 'Currently active',
        start_time: startTime,
        end_time: endTime,
        status: 'in_progress',
        affected_component_ids: [testData.components[0].id]
      };

      await createMaintenanceWindow(input);

      const activeWindows = await getActiveMaintenanceWindows();

      expect(activeWindows).toHaveLength(1);
      expect(activeWindows[0].title).toEqual('Active Maintenance');
      expect(activeWindows[0].status).toEqual('in_progress');
    });

    it('should not return scheduled or completed maintenance', async () => {
      const testData = await createTestData();
      
      // Create scheduled maintenance
      const futureStart = new Date(Date.now() + 86400000); // Tomorrow
      const futureEnd = new Date(Date.now() + 90000000); // Tomorrow + 1 hour
      
      const scheduledInput: CreateMaintenanceWindowInput = {
        title: 'Scheduled Maintenance',
        description: 'Future maintenance',
        start_time: futureStart,
        end_time: futureEnd,
        status: 'scheduled',
        affected_component_ids: []
      };

      await createMaintenanceWindow(scheduledInput);

      const activeWindows = await getActiveMaintenanceWindows();

      expect(activeWindows).toHaveLength(0);
    });
  });

  describe('getUpcomingMaintenanceWindows', () => {
    it('should return scheduled maintenance windows', async () => {
      const testData = await createTestData();
      
      // Create upcoming maintenance
      const futureStart = new Date(Date.now() + 86400000); // Tomorrow
      const futureEnd = new Date(Date.now() + 90000000); // Tomorrow + 1 hour
      
      const input: CreateMaintenanceWindowInput = {
        title: 'Upcoming Maintenance',
        description: 'Future maintenance',
        start_time: futureStart,
        end_time: futureEnd,
        status: 'scheduled',
        affected_component_ids: [testData.components[0].id]
      };

      await createMaintenanceWindow(input);

      const upcomingWindows = await getUpcomingMaintenanceWindows();

      expect(upcomingWindows).toHaveLength(1);
      expect(upcomingWindows[0].title).toEqual('Upcoming Maintenance');
      expect(upcomingWindows[0].status).toEqual('scheduled');
    });

    it('should not return past or active maintenance', async () => {
      const testData = await createTestData();
      
      // Create past maintenance
      const pastStart = new Date(Date.now() - 86400000); // Yesterday
      const pastEnd = new Date(Date.now() - 82800000); // Yesterday + 1 hour
      
      const pastInput: CreateMaintenanceWindowInput = {
        title: 'Past Maintenance',
        description: 'Past maintenance',
        start_time: pastStart,
        end_time: pastEnd,
        status: 'completed',
        affected_component_ids: []
      };

      await createMaintenanceWindow(pastInput);

      const upcomingWindows = await getUpcomingMaintenanceWindows();

      expect(upcomingWindows).toHaveLength(0);
    });
  });

  describe('getMaintenanceWindowById', () => {
    it('should return maintenance window with full details', async () => {
      const testData = await createTestData();
      
      const input: CreateMaintenanceWindowInput = {
        title: 'Detailed Maintenance',
        description: 'With full details',
        start_time: new Date('2024-01-15T02:00:00Z'),
        end_time: new Date('2024-01-15T04:00:00Z'),
        status: 'scheduled',
        affected_component_ids: [testData.components[0].id]
      };

      const created = await createMaintenanceWindow(input);

      // Add an update
      await createMaintenanceUpdate({
        message: 'Maintenance starting soon',
        maintenance_id: created.id
      });

      const result = await getMaintenanceWindowById(created.id);

      expect(result).toBeDefined();
      expect(result!.title).toEqual('Detailed Maintenance');
      expect(result!.affected_components).toHaveLength(1);
      expect(result!.updates).toHaveLength(1);
      expect(result!.updates[0].message).toEqual('Maintenance starting soon');
    });

    it('should return null for non-existent maintenance window', async () => {
      const result = await getMaintenanceWindowById(999);
      expect(result).toBeNull();
    });
  });

  describe('updateMaintenanceWindow', () => {
    it('should update maintenance window fields', async () => {
      const testData = await createTestData();
      
      const input: CreateMaintenanceWindowInput = {
        title: 'Original Title',
        description: 'Original description',
        start_time: new Date('2024-01-15T02:00:00Z'),
        end_time: new Date('2024-01-15T04:00:00Z'),
        status: 'scheduled',
        affected_component_ids: []
      };

      const created = await createMaintenanceWindow(input);

      const updateInput: UpdateMaintenanceWindowInput = {
        id: created.id,
        title: 'Updated Title',
        status: 'in_progress'
      };

      const result = await updateMaintenanceWindow(updateInput);

      expect(result.title).toEqual('Updated Title');
      expect(result.status).toEqual('in_progress');
      expect(result.description).toEqual('Original description'); // Should remain unchanged
    });

    it('should throw error for non-existent maintenance window', async () => {
      const updateInput: UpdateMaintenanceWindowInput = {
        id: 999,
        title: 'Updated Title'
      };

      await expect(updateMaintenanceWindow(updateInput)).rejects.toThrow(/does not exist/i);
    });
  });

  describe('deleteMaintenanceWindow', () => {
    it('should delete maintenance window and related data', async () => {
      const testData = await createTestData();
      
      const input: CreateMaintenanceWindowInput = {
        title: 'To Delete',
        description: null,
        start_time: new Date('2024-01-15T02:00:00Z'),
        end_time: new Date('2024-01-15T04:00:00Z'),
        status: 'scheduled',
        affected_component_ids: [testData.components[0].id]
      };

      const created = await createMaintenanceWindow(input);

      // Add an update
      await createMaintenanceUpdate({
        message: 'Test update',
        maintenance_id: created.id
      });

      await deleteMaintenanceWindow(created.id);

      // Verify deletion
      const result = await getMaintenanceWindowById(created.id);
      expect(result).toBeNull();

      // Verify updates are also deleted (cascade)
      const updates = await db.select()
        .from(maintenanceUpdatesTable)
        .where(eq(maintenanceUpdatesTable.maintenance_id, created.id))
        .execute();

      expect(updates).toHaveLength(0);
    });

    it('should throw error for non-existent maintenance window', async () => {
      await expect(deleteMaintenanceWindow(999)).rejects.toThrow(/does not exist/i);
    });
  });

  describe('createMaintenanceUpdate', () => {
    it('should create maintenance update', async () => {
      const testData = await createTestData();
      
      const maintenanceInput: CreateMaintenanceWindowInput = {
        title: 'Test Maintenance',
        description: null,
        start_time: new Date('2024-01-15T02:00:00Z'),
        end_time: new Date('2024-01-15T04:00:00Z'),
        status: 'scheduled',
        affected_component_ids: []
      };

      const maintenance = await createMaintenanceWindow(maintenanceInput);

      const updateInput: CreateMaintenanceUpdateInput = {
        message: 'Maintenance is starting',
        maintenance_id: maintenance.id
      };

      const result = await createMaintenanceUpdate(updateInput);

      expect(result.message).toEqual('Maintenance is starting');
      expect(result.maintenance_id).toEqual(maintenance.id);
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.id).toBeDefined();
    });

    it('should create update with custom timestamp', async () => {
      const testData = await createTestData();
      
      const maintenance = await createMaintenanceWindow({
        title: 'Test Maintenance',
        description: null,
        start_time: new Date('2024-01-15T02:00:00Z'),
        end_time: new Date('2024-01-15T04:00:00Z'),
        status: 'scheduled',
        affected_component_ids: []
      });

      const customTimestamp = new Date('2024-01-15T01:30:00Z');
      const updateInput: CreateMaintenanceUpdateInput = {
        message: 'Pre-maintenance update',
        timestamp: customTimestamp,
        maintenance_id: maintenance.id
      };

      const result = await createMaintenanceUpdate(updateInput);

      expect(result.timestamp).toEqual(customTimestamp);
    });

    it('should throw error for non-existent maintenance window', async () => {
      const updateInput: CreateMaintenanceUpdateInput = {
        message: 'Test message',
        maintenance_id: 999
      };

      await expect(createMaintenanceUpdate(updateInput)).rejects.toThrow(/does not exist/i);
    });
  });

  describe('getMaintenanceUpdates', () => {
    it('should return updates ordered by timestamp descending', async () => {
      const testData = await createTestData();
      
      const maintenance = await createMaintenanceWindow({
        title: 'Test Maintenance',
        description: null,
        start_time: new Date('2024-01-15T02:00:00Z'),
        end_time: new Date('2024-01-15T04:00:00Z'),
        status: 'scheduled',
        affected_component_ids: []
      });

      // Create updates with different timestamps
      const update1 = await createMaintenanceUpdate({
        message: 'First update',
        timestamp: new Date('2024-01-15T01:00:00Z'),
        maintenance_id: maintenance.id
      });

      const update2 = await createMaintenanceUpdate({
        message: 'Second update',
        timestamp: new Date('2024-01-15T02:00:00Z'),
        maintenance_id: maintenance.id
      });

      const updates = await getMaintenanceUpdates(maintenance.id);

      expect(updates).toHaveLength(2);
      expect(updates[0].message).toEqual('Second update'); // Newest first
      expect(updates[1].message).toEqual('First update');
    });
  });

  describe('updateMaintenanceUpdate', () => {
    it('should update maintenance update fields', async () => {
      const testData = await createTestData();
      
      const maintenance = await createMaintenanceWindow({
        title: 'Test Maintenance',
        description: null,
        start_time: new Date('2024-01-15T02:00:00Z'),
        end_time: new Date('2024-01-15T04:00:00Z'),
        status: 'scheduled',
        affected_component_ids: []
      });

      const update = await createMaintenanceUpdate({
        message: 'Original message',
        maintenance_id: maintenance.id
      });

      const updateInput: UpdateMaintenanceUpdateInput = {
        id: update.id,
        message: 'Updated message'
      };

      const result = await updateMaintenanceUpdate(updateInput);

      expect(result.message).toEqual('Updated message');
      expect(result.maintenance_id).toEqual(maintenance.id);
    });

    it('should throw error for non-existent update', async () => {
      const updateInput: UpdateMaintenanceUpdateInput = {
        id: 999,
        message: 'Updated message'
      };

      await expect(updateMaintenanceUpdate(updateInput)).rejects.toThrow(/does not exist/i);
    });
  });

  describe('deleteMaintenanceUpdate', () => {
    it('should delete maintenance update', async () => {
      const testData = await createTestData();
      
      const maintenance = await createMaintenanceWindow({
        title: 'Test Maintenance',
        description: null,
        start_time: new Date('2024-01-15T02:00:00Z'),
        end_time: new Date('2024-01-15T04:00:00Z'),
        status: 'scheduled',
        affected_component_ids: []
      });

      const update = await createMaintenanceUpdate({
        message: 'To delete',
        maintenance_id: maintenance.id
      });

      await deleteMaintenanceUpdate(update.id);

      // Verify deletion
      const updates = await getMaintenanceUpdates(maintenance.id);
      expect(updates).toHaveLength(0);
    });

    it('should throw error for non-existent update', async () => {
      await expect(deleteMaintenanceUpdate(999)).rejects.toThrow(/does not exist/i);
    });
  });

  describe('getRecentCompletedMaintenance', () => {
    it('should return completed maintenance from last N days', async () => {
      const testData = await createTestData();
      
      // Create completed maintenance within time range
      const recentEnd = new Date(Date.now() - 86400000); // 1 day ago
      const recentStart = new Date(recentEnd.getTime() - 3600000); // 1 hour before end
      
      const recentInput: CreateMaintenanceWindowInput = {
        title: 'Recent Completed',
        description: null,
        start_time: recentStart,
        end_time: recentEnd,
        status: 'completed',
        affected_component_ids: []
      };

      await createMaintenanceWindow(recentInput);

      // Create old completed maintenance outside time range
      const oldEnd = new Date(Date.now() - 20 * 86400000); // 20 days ago
      const oldStart = new Date(oldEnd.getTime() - 3600000);
      
      const oldInput: CreateMaintenanceWindowInput = {
        title: 'Old Completed',
        description: null,
        start_time: oldStart,
        end_time: oldEnd,
        status: 'completed',
        affected_component_ids: []
      };

      await createMaintenanceWindow(oldInput);

      const recentMaintenance = await getRecentCompletedMaintenance(15);

      expect(recentMaintenance).toHaveLength(1);
      expect(recentMaintenance[0].title).toEqual('Recent Completed');
    });

    it('should use default 15 days when no parameter provided', async () => {
      const result = await getRecentCompletedMaintenance();
      expect(result).toHaveLength(0); // No recent completed maintenance
    });
  });

  describe('getAllMaintenanceWindows', () => {
    it('should return all maintenance windows ordered by created_at desc', async () => {
      const testData = await createTestData();
      
      // Create multiple maintenance windows
      await createMaintenanceWindow({
        title: 'First Maintenance',
        description: null,
        start_time: new Date('2024-01-15T02:00:00Z'),
        end_time: new Date('2024-01-15T04:00:00Z'),
        status: 'scheduled',
        affected_component_ids: []
      });

      await createMaintenanceWindow({
        title: 'Second Maintenance',
        description: null,
        start_time: new Date('2024-01-16T02:00:00Z'),
        end_time: new Date('2024-01-16T04:00:00Z'),
        status: 'completed',
        affected_component_ids: []
      });

      const allMaintenance = await getAllMaintenanceWindows();

      expect(allMaintenance).toHaveLength(2);
      expect(allMaintenance[0].title).toEqual('Second Maintenance'); // Newest first
      expect(allMaintenance[1].title).toEqual('First Maintenance');
    });
  });
});