import { db } from '../db';
import { 
  componentGroupsTable, 
  componentsTable, 
  incidentsTable, 
  incidentUpdatesTable,
  incidentAffectedComponentsTable,
  maintenanceWindowsTable,
  maintenanceUpdatesTable,
  maintenanceAffectedComponentsTable
} from '../db/schema';
import { type PublicStatus, type IncidentWithDetails, type MaintenanceWithDetails, type ComponentGroupWithComponents } from '../schema';
import { eq, desc, gte, and, or, SQL } from 'drizzle-orm';

export async function getPublicStatus(): Promise<PublicStatus> {
  try {
    // Fetch component groups with their components
    const componentGroupsResult = await db.select()
      .from(componentGroupsTable)
      .innerJoin(componentsTable, eq(componentGroupsTable.id, componentsTable.group_id))
      .orderBy(componentGroupsTable.display_order, componentsTable.display_order)
      .execute();

    // Group components by component group
    const componentGroupMap = new Map<number, ComponentGroupWithComponents>();
    
    for (const result of componentGroupsResult) {
      const group = result.component_groups;
      const component = result.components;
      
      if (!componentGroupMap.has(group.id)) {
        componentGroupMap.set(group.id, {
          ...group,
          components: []
        });
      }
      
      componentGroupMap.get(group.id)!.components.push(component);
    }

    const component_groups = Array.from(componentGroupMap.values());

    // Calculate overall status based on component statuses
    let overall_status: 'operational' | 'degraded' | 'partial_outage' | 'major_outage' | 'under_maintenance' = 'operational';
    
    for (const group of component_groups) {
      for (const component of group.components) {
        if (component.status === 'major_outage') {
          overall_status = 'major_outage';
          break;
        } else if (component.status === 'partial_outage' && overall_status === 'operational') {
          overall_status = 'partial_outage';
        } else if (component.status === 'degraded' && overall_status === 'operational') {
          overall_status = 'degraded';
        } else if (component.status === 'under_maintenance' && overall_status === 'operational') {
          overall_status = 'under_maintenance';
        }
      }
      if (overall_status === 'major_outage') break;
    }

    // Fetch active incidents
    const active_incidents = await getPublicIncidents(false, 0);

    // Fetch recent resolved incidents (last 15 days)
    const recent_incidents = await getPublicIncidents(true, 15);

    // Fetch maintenance windows
    const maintenanceData = await getPublicMaintenance();
    
    const active_maintenance = maintenanceData.filter(m => m.status === 'in_progress');
    const upcoming_maintenance = maintenanceData.filter(m => m.status === 'scheduled');

    return {
      overall_status,
      component_groups,
      active_incidents,
      recent_incidents: recent_incidents.filter(i => i.status === 'resolved'),
      active_maintenance,
      upcoming_maintenance
    };
  } catch (error) {
    console.error('Failed to fetch public status:', error);
    throw error;
  }
}

export async function getPublicIncidents(includeResolved: boolean = true, days: number = 15): Promise<IncidentWithDetails[]> {
  try {
    let incidents;

    if (!includeResolved) {
      // Only active incidents
      incidents = await db.select()
        .from(incidentsTable)
        .where(
          or(
            eq(incidentsTable.status, 'investigating'),
            eq(incidentsTable.status, 'identified'),
            eq(incidentsTable.status, 'monitoring')
          )!
        )
        .orderBy(desc(incidentsTable.created_at))
        .execute();
    } else if (days > 0) {
      // Include resolved incidents from last N days
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      incidents = await db.select()
        .from(incidentsTable)
        .where(
          or(
            eq(incidentsTable.status, 'investigating'),
            eq(incidentsTable.status, 'identified'),
            eq(incidentsTable.status, 'monitoring'),
            and(
              eq(incidentsTable.status, 'resolved'),
              gte(incidentsTable.resolved_at, cutoffDate)
            )
          )!
        )
        .orderBy(desc(incidentsTable.created_at))
        .execute();
    } else {
      // All incidents
      incidents = await db.select()
        .from(incidentsTable)
        .orderBy(desc(incidentsTable.created_at))
        .execute();
    }

    // Fetch updates and affected components for each incident
    const incidentsWithDetails: IncidentWithDetails[] = [];

    for (const incident of incidents) {
      // Fetch incident updates
      const updates = await db.select()
        .from(incidentUpdatesTable)
        .where(eq(incidentUpdatesTable.incident_id, incident.id))
        .orderBy(desc(incidentUpdatesTable.timestamp))
        .execute();

      // Fetch affected components
      const affectedComponentsResult = await db.select()
        .from(incidentAffectedComponentsTable)
        .innerJoin(componentsTable, eq(incidentAffectedComponentsTable.component_id, componentsTable.id))
        .where(eq(incidentAffectedComponentsTable.incident_id, incident.id))
        .execute();

      const affected_components = affectedComponentsResult.map(result => result.components);

      incidentsWithDetails.push({
        ...incident,
        updates,
        affected_components
      });
    }

    return incidentsWithDetails;
  } catch (error) {
    console.error('Failed to fetch public incidents:', error);
    throw error;
  }
}

export async function getPublicMaintenance(): Promise<MaintenanceWithDetails[]> {
  try {
    // Fetch current and upcoming maintenance, plus recent completed (last 15 days)
    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
    
    const now = new Date();

    const maintenanceWindows = await db.select()
      .from(maintenanceWindowsTable)
      .where(
        or(
          eq(maintenanceWindowsTable.status, 'scheduled'),
          eq(maintenanceWindowsTable.status, 'in_progress'),
          and(
            eq(maintenanceWindowsTable.status, 'completed'),
            gte(maintenanceWindowsTable.end_time, fifteenDaysAgo)
          )
        )!
      )
      .orderBy(maintenanceWindowsTable.start_time)
      .execute();

    // Fetch updates and affected components for each maintenance window
    const maintenanceWithDetails: MaintenanceWithDetails[] = [];

    for (const maintenance of maintenanceWindows) {
      // Fetch maintenance updates
      const updates = await db.select()
        .from(maintenanceUpdatesTable)
        .where(eq(maintenanceUpdatesTable.maintenance_id, maintenance.id))
        .orderBy(desc(maintenanceUpdatesTable.timestamp))
        .execute();

      // Fetch affected components
      const affectedComponentsResult = await db.select()
        .from(maintenanceAffectedComponentsTable)
        .innerJoin(componentsTable, eq(maintenanceAffectedComponentsTable.component_id, componentsTable.id))
        .where(eq(maintenanceAffectedComponentsTable.maintenance_id, maintenance.id))
        .execute();

      const affected_components = affectedComponentsResult.map(result => result.components);

      maintenanceWithDetails.push({
        ...maintenance,
        updates,
        affected_components
      });
    }

    return maintenanceWithDetails;
  } catch (error) {
    console.error('Failed to fetch public maintenance:', error);
    throw error;
  }
}

export async function getPublicIncidentById(id: number): Promise<IncidentWithDetails | null> {
  try {
    // Fetch the incident
    const incidents = await db.select()
      .from(incidentsTable)
      .where(eq(incidentsTable.id, id))
      .execute();

    if (incidents.length === 0) {
      return null;
    }

    const incident = incidents[0];

    // Fetch incident updates
    const updates = await db.select()
      .from(incidentUpdatesTable)
      .where(eq(incidentUpdatesTable.incident_id, incident.id))
      .orderBy(desc(incidentUpdatesTable.timestamp))
      .execute();

    // Fetch affected components
    const affectedComponentsResult = await db.select()
      .from(incidentAffectedComponentsTable)
      .innerJoin(componentsTable, eq(incidentAffectedComponentsTable.component_id, componentsTable.id))
      .where(eq(incidentAffectedComponentsTable.incident_id, incident.id))
      .execute();

    const affected_components = affectedComponentsResult.map(result => result.components);

    return {
      ...incident,
      updates,
      affected_components
    };
  } catch (error) {
    console.error('Failed to fetch public incident by ID:', error);
    throw error;
  }
}

export async function getPublicMaintenanceById(id: number): Promise<MaintenanceWithDetails | null> {
  try {
    // Fetch the maintenance window
    const maintenanceWindows = await db.select()
      .from(maintenanceWindowsTable)
      .where(eq(maintenanceWindowsTable.id, id))
      .execute();

    if (maintenanceWindows.length === 0) {
      return null;
    }

    const maintenance = maintenanceWindows[0];

    // Fetch maintenance updates
    const updates = await db.select()
      .from(maintenanceUpdatesTable)
      .where(eq(maintenanceUpdatesTable.maintenance_id, maintenance.id))
      .orderBy(desc(maintenanceUpdatesTable.timestamp))
      .execute();

    // Fetch affected components
    const affectedComponentsResult = await db.select()
      .from(maintenanceAffectedComponentsTable)
      .innerJoin(componentsTable, eq(maintenanceAffectedComponentsTable.component_id, componentsTable.id))
      .where(eq(maintenanceAffectedComponentsTable.maintenance_id, maintenance.id))
      .execute();

    const affected_components = affectedComponentsResult.map(result => result.components);

    return {
      ...maintenance,
      updates,
      affected_components
    };
  } catch (error) {
    console.error('Failed to fetch public maintenance by ID:', error);
    throw error;
  }
}