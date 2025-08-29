import { db } from '../db';
import { 
  maintenanceWindowsTable,
  maintenanceUpdatesTable,
  maintenanceAffectedComponentsTable,
  componentsTable,
  auditLogsTable
} from '../db/schema';
import { 
  type CreateMaintenanceWindowInput, 
  type UpdateMaintenanceWindowInput, 
  type MaintenanceWithDetails,
  type CreateMaintenanceUpdateInput,
  type UpdateMaintenanceUpdateInput,
  type MaintenanceUpdate
} from '../schema';
import { eq, and, gte, lte, desc, gt, lt } from 'drizzle-orm';

// Maintenance Window handlers
export async function createMaintenanceWindow(input: CreateMaintenanceWindowInput): Promise<MaintenanceWithDetails> {
  try {
    // First, verify all affected components exist
    if (input.affected_component_ids.length > 0) {
      const existingComponents = await db.select()
        .from(componentsTable)
        .where(eq(componentsTable.id, input.affected_component_ids[0]))
        .execute();

      for (const componentId of input.affected_component_ids) {
        const component = await db.select()
          .from(componentsTable)
          .where(eq(componentsTable.id, componentId))
          .execute();
        
        if (component.length === 0) {
          throw new Error(`Component with id ${componentId} does not exist`);
        }
      }
    }

    // Insert maintenance window
    const result = await db.insert(maintenanceWindowsTable)
      .values({
        title: input.title,
        description: input.description,
        start_time: input.start_time,
        end_time: input.end_time,
        status: input.status
      })
      .returning()
      .execute();

    const maintenanceWindow = result[0];

    // Insert affected components relationships
    if (input.affected_component_ids.length > 0) {
      const affectedComponentsData = input.affected_component_ids.map(componentId => ({
        maintenance_id: maintenanceWindow.id,
        component_id: componentId
      }));

      await db.insert(maintenanceAffectedComponentsTable)
        .values(affectedComponentsData)
        .execute();
    }

    // Log audit trail
    await db.insert(auditLogsTable)
      .values({
        username: 'system', // In real app, get from context
        action: 'CREATE_MAINTENANCE_WINDOW',
        details: `Created maintenance window: ${input.title}`
      })
      .execute();

    // Return full maintenance window with details
    return await getMaintenanceWindowById(maintenanceWindow.id) as MaintenanceWithDetails;
  } catch (error) {
    console.error('Maintenance window creation failed:', error);
    throw error;
  }
}

export async function getActiveMaintenanceWindows(): Promise<MaintenanceWithDetails[]> {
  try {
    const now = new Date();
    
    const query = db.select()
      .from(maintenanceWindowsTable)
      .where(
        and(
          eq(maintenanceWindowsTable.status, 'in_progress'),
          lte(maintenanceWindowsTable.start_time, now),
          gte(maintenanceWindowsTable.end_time, now)
        )
      )
      .orderBy(desc(maintenanceWindowsTable.start_time));

    const maintenanceWindows = await query.execute();

    // Fetch details for each maintenance window
    const detailedWindows = await Promise.all(
      maintenanceWindows.map(async (window) => {
        return await getMaintenanceWindowById(window.id) as MaintenanceWithDetails;
      })
    );

    return detailedWindows;
  } catch (error) {
    console.error('Failed to fetch active maintenance windows:', error);
    throw error;
  }
}

export async function getUpcomingMaintenanceWindows(): Promise<MaintenanceWithDetails[]> {
  try {
    const now = new Date();
    
    const query = db.select()
      .from(maintenanceWindowsTable)
      .where(
        and(
          eq(maintenanceWindowsTable.status, 'scheduled'),
          gt(maintenanceWindowsTable.start_time, now)
        )
      )
      .orderBy(maintenanceWindowsTable.start_time);

    const maintenanceWindows = await query.execute();

    // Fetch details for each maintenance window
    const detailedWindows = await Promise.all(
      maintenanceWindows.map(async (window) => {
        return await getMaintenanceWindowById(window.id) as MaintenanceWithDetails;
      })
    );

    return detailedWindows;
  } catch (error) {
    console.error('Failed to fetch upcoming maintenance windows:', error);
    throw error;
  }
}

export async function getAllMaintenanceWindows(): Promise<MaintenanceWithDetails[]> {
  try {
    const query = db.select()
      .from(maintenanceWindowsTable)
      .orderBy(desc(maintenanceWindowsTable.created_at));

    const maintenanceWindows = await query.execute();

    // Fetch details for each maintenance window
    const detailedWindows = await Promise.all(
      maintenanceWindows.map(async (window) => {
        return await getMaintenanceWindowById(window.id) as MaintenanceWithDetails;
      })
    );

    return detailedWindows;
  } catch (error) {
    console.error('Failed to fetch all maintenance windows:', error);
    throw error;
  }
}

export async function getMaintenanceWindowById(id: number): Promise<MaintenanceWithDetails | null> {
  try {
    // Get maintenance window
    const maintenanceResult = await db.select()
      .from(maintenanceWindowsTable)
      .where(eq(maintenanceWindowsTable.id, id))
      .execute();

    if (maintenanceResult.length === 0) {
      return null;
    }

    const maintenanceWindow = maintenanceResult[0];

    // Get updates
    const updates = await db.select()
      .from(maintenanceUpdatesTable)
      .where(eq(maintenanceUpdatesTable.maintenance_id, id))
      .orderBy(desc(maintenanceUpdatesTable.timestamp))
      .execute();

    // Get affected components
    const affectedComponentsResult = await db.select({
      id: componentsTable.id,
      name: componentsTable.name,
      status: componentsTable.status,
      display_order: componentsTable.display_order,
      group_id: componentsTable.group_id,
      created_at: componentsTable.created_at,
      updated_at: componentsTable.updated_at
    })
      .from(maintenanceAffectedComponentsTable)
      .innerJoin(componentsTable, eq(maintenanceAffectedComponentsTable.component_id, componentsTable.id))
      .where(eq(maintenanceAffectedComponentsTable.maintenance_id, id))
      .execute();

    return {
      ...maintenanceWindow,
      updates,
      affected_components: affectedComponentsResult
    };
  } catch (error) {
    console.error('Failed to fetch maintenance window by id:', error);
    throw error;
  }
}

export async function updateMaintenanceWindow(input: UpdateMaintenanceWindowInput): Promise<MaintenanceWithDetails> {
  try {
    // Check if maintenance window exists
    const existingWindow = await db.select()
      .from(maintenanceWindowsTable)
      .where(eq(maintenanceWindowsTable.id, input.id))
      .execute();

    if (existingWindow.length === 0) {
      throw new Error(`Maintenance window with id ${input.id} does not exist`);
    }

    // Build update object with only provided fields
    const updateData: any = {
      updated_at: new Date()
    };

    if (input.title !== undefined) updateData.title = input.title;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.start_time !== undefined) updateData.start_time = input.start_time;
    if (input.end_time !== undefined) updateData.end_time = input.end_time;
    if (input.status !== undefined) updateData.status = input.status;

    // Update maintenance window
    await db.update(maintenanceWindowsTable)
      .set(updateData)
      .where(eq(maintenanceWindowsTable.id, input.id))
      .execute();

    // Log audit trail
    await db.insert(auditLogsTable)
      .values({
        username: 'system',
        action: 'UPDATE_MAINTENANCE_WINDOW',
        details: `Updated maintenance window id ${input.id}`
      })
      .execute();

    // Return updated maintenance window with details
    return await getMaintenanceWindowById(input.id) as MaintenanceWithDetails;
  } catch (error) {
    console.error('Maintenance window update failed:', error);
    throw error;
  }
}

export async function deleteMaintenanceWindow(id: number): Promise<void> {
  try {
    // Check if maintenance window exists
    const existingWindow = await db.select()
      .from(maintenanceWindowsTable)
      .where(eq(maintenanceWindowsTable.id, id))
      .execute();

    if (existingWindow.length === 0) {
      throw new Error(`Maintenance window with id ${id} does not exist`);
    }

    // Delete maintenance window (cascades will handle related records)
    await db.delete(maintenanceWindowsTable)
      .where(eq(maintenanceWindowsTable.id, id))
      .execute();

    // Log audit trail
    await db.insert(auditLogsTable)
      .values({
        username: 'system',
        action: 'DELETE_MAINTENANCE_WINDOW',
        details: `Deleted maintenance window id ${id}`
      })
      .execute();
  } catch (error) {
    console.error('Maintenance window deletion failed:', error);
    throw error;
  }
}

// Maintenance Update handlers
export async function createMaintenanceUpdate(input: CreateMaintenanceUpdateInput): Promise<MaintenanceUpdate> {
  try {
    // Check if maintenance window exists
    const existingWindow = await db.select()
      .from(maintenanceWindowsTable)
      .where(eq(maintenanceWindowsTable.id, input.maintenance_id))
      .execute();

    if (existingWindow.length === 0) {
      throw new Error(`Maintenance window with id ${input.maintenance_id} does not exist`);
    }

    // Insert maintenance update
    const result = await db.insert(maintenanceUpdatesTable)
      .values({
        message: input.message,
        timestamp: input.timestamp || new Date(),
        maintenance_id: input.maintenance_id
      })
      .returning()
      .execute();

    // Log audit trail
    await db.insert(auditLogsTable)
      .values({
        username: 'system',
        action: 'CREATE_MAINTENANCE_UPDATE',
        details: `Created update for maintenance window ${input.maintenance_id}`
      })
      .execute();

    return result[0];
  } catch (error) {
    console.error('Maintenance update creation failed:', error);
    throw error;
  }
}

export async function getMaintenanceUpdates(maintenanceId: number): Promise<MaintenanceUpdate[]> {
  try {
    const updates = await db.select()
      .from(maintenanceUpdatesTable)
      .where(eq(maintenanceUpdatesTable.maintenance_id, maintenanceId))
      .orderBy(desc(maintenanceUpdatesTable.timestamp))
      .execute();

    return updates;
  } catch (error) {
    console.error('Failed to fetch maintenance updates:', error);
    throw error;
  }
}

export async function updateMaintenanceUpdate(input: UpdateMaintenanceUpdateInput): Promise<MaintenanceUpdate> {
  try {
    // Check if maintenance update exists
    const existingUpdate = await db.select()
      .from(maintenanceUpdatesTable)
      .where(eq(maintenanceUpdatesTable.id, input.id))
      .execute();

    if (existingUpdate.length === 0) {
      throw new Error(`Maintenance update with id ${input.id} does not exist`);
    }

    // Build update object with only provided fields
    const updateData: any = {
      updated_at: new Date()
    };

    if (input.message !== undefined) updateData.message = input.message;
    if (input.timestamp !== undefined) updateData.timestamp = input.timestamp;

    // Update maintenance update
    await db.update(maintenanceUpdatesTable)
      .set(updateData)
      .where(eq(maintenanceUpdatesTable.id, input.id))
      .execute();

    // Log audit trail
    await db.insert(auditLogsTable)
      .values({
        username: 'system',
        action: 'UPDATE_MAINTENANCE_UPDATE',
        details: `Updated maintenance update id ${input.id}`
      })
      .execute();

    // Return updated maintenance update
    const result = await db.select()
      .from(maintenanceUpdatesTable)
      .where(eq(maintenanceUpdatesTable.id, input.id))
      .execute();

    return result[0];
  } catch (error) {
    console.error('Maintenance update update failed:', error);
    throw error;
  }
}

export async function deleteMaintenanceUpdate(id: number): Promise<void> {
  try {
    // Check if maintenance update exists
    const existingUpdate = await db.select()
      .from(maintenanceUpdatesTable)
      .where(eq(maintenanceUpdatesTable.id, id))
      .execute();

    if (existingUpdate.length === 0) {
      throw new Error(`Maintenance update with id ${id} does not exist`);
    }

    // Delete maintenance update
    await db.delete(maintenanceUpdatesTable)
      .where(eq(maintenanceUpdatesTable.id, id))
      .execute();

    // Log audit trail
    await db.insert(auditLogsTable)
      .values({
        username: 'system',
        action: 'DELETE_MAINTENANCE_UPDATE',
        details: `Deleted maintenance update id ${id}`
      })
      .execute();
  } catch (error) {
    console.error('Maintenance update deletion failed:', error);
    throw error;
  }
}

export async function getRecentCompletedMaintenance(days: number = 15): Promise<MaintenanceWithDetails[]> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const query = db.select()
      .from(maintenanceWindowsTable)
      .where(
        and(
          eq(maintenanceWindowsTable.status, 'completed'),
          gte(maintenanceWindowsTable.end_time, cutoffDate)
        )
      )
      .orderBy(desc(maintenanceWindowsTable.end_time));

    const maintenanceWindows = await query.execute();

    // Fetch details for each maintenance window
    const detailedWindows = await Promise.all(
      maintenanceWindows.map(async (window) => {
        return await getMaintenanceWindowById(window.id) as MaintenanceWithDetails;
      })
    );

    return detailedWindows;
  } catch (error) {
    console.error('Failed to fetch recent completed maintenance:', error);
    throw error;
  }
}