import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
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
import { 
  getPublicStatus, 
  getPublicIncidents, 
  getPublicMaintenance, 
  getPublicIncidentById, 
  getPublicMaintenanceById 
} from '../handlers/public';

describe('Public Status Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('getPublicStatus', () => {
    it('should return basic status with empty data', async () => {
      const result = await getPublicStatus();

      expect(result.overall_status).toEqual('operational');
      expect(result.component_groups).toEqual([]);
      expect(result.active_incidents).toEqual([]);
      expect(result.recent_incidents).toEqual([]);
      expect(result.active_maintenance).toEqual([]);
      expect(result.upcoming_maintenance).toEqual([]);
    });

    it('should return component groups with components and calculate overall status', async () => {
      // Create component group
      const groupResult = await db.insert(componentGroupsTable)
        .values({
          name: 'API Services',
          display_order: 1,
          collapsed_by_default: false
        })
        .returning()
        .execute();

      const group = groupResult[0];

      // Create components with different statuses
      await db.insert(componentsTable)
        .values([
          {
            name: 'API Gateway',
            status: 'operational',
            display_order: 1,
            group_id: group.id
          },
          {
            name: 'Database',
            status: 'degraded',
            display_order: 2,
            group_id: group.id
          }
        ])
        .execute();

      const result = await getPublicStatus();

      expect(result.overall_status).toEqual('degraded'); // Worst status among components
      expect(result.component_groups).toHaveLength(1);
      expect(result.component_groups[0].name).toEqual('API Services');
      expect(result.component_groups[0].components).toHaveLength(2);
      
      // Verify component order
      const components = result.component_groups[0].components;
      expect(components[0].name).toEqual('API Gateway');
      expect(components[0].status).toEqual('operational');
      expect(components[1].name).toEqual('Database');
      expect(components[1].status).toEqual('degraded');
    });

    it('should calculate major_outage as worst overall status', async () => {
      // Create component group
      const groupResult = await db.insert(componentGroupsTable)
        .values({
          name: 'Core Services',
          display_order: 1,
          collapsed_by_default: false
        })
        .returning()
        .execute();

      const group = groupResult[0];

      // Create components with major outage
      await db.insert(componentsTable)
        .values([
          {
            name: 'Service A',
            status: 'operational',
            display_order: 1,
            group_id: group.id
          },
          {
            name: 'Service B',
            status: 'major_outage',
            display_order: 2,
            group_id: group.id
          }
        ])
        .execute();

      const result = await getPublicStatus();

      expect(result.overall_status).toEqual('major_outage');
    });

    it('should include active incidents and maintenance', async () => {
      // Create component group and component first
      const groupResult = await db.insert(componentGroupsTable)
        .values({
          name: 'Test Group',
          display_order: 1,
          collapsed_by_default: false
        })
        .returning()
        .execute();

      const componentResult = await db.insert(componentsTable)
        .values({
          name: 'Test Component',
          status: 'operational',
          display_order: 1,
          group_id: groupResult[0].id
        })
        .returning()
        .execute();

      // Create active incident
      const incidentResult = await db.insert(incidentsTable)
        .values({
          title: 'Active Issue',
          status: 'investigating',
          impact: 'major',
          impact_description: 'Service degradation'
        })
        .returning()
        .execute();

      // Create incident update
      await db.insert(incidentUpdatesTable)
        .values({
          message: 'Investigating the issue',
          status: 'investigating',
          incident_id: incidentResult[0].id
        })
        .execute();

      // Link incident to component
      await db.insert(incidentAffectedComponentsTable)
        .values({
          incident_id: incidentResult[0].id,
          component_id: componentResult[0].id
        })
        .execute();

      // Create active maintenance
      const maintenanceResult = await db.insert(maintenanceWindowsTable)
        .values({
          title: 'Scheduled Maintenance',
          description: 'Server updates',
          start_time: new Date(),
          end_time: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
          status: 'in_progress'
        })
        .returning()
        .execute();

      // Link maintenance to component
      await db.insert(maintenanceAffectedComponentsTable)
        .values({
          maintenance_id: maintenanceResult[0].id,
          component_id: componentResult[0].id
        })
        .execute();

      const result = await getPublicStatus();

      expect(result.active_incidents).toHaveLength(1);
      expect(result.active_incidents[0].title).toEqual('Active Issue');
      expect(result.active_incidents[0].updates).toHaveLength(1);
      expect(result.active_incidents[0].affected_components).toHaveLength(1);

      expect(result.active_maintenance).toHaveLength(1);
      expect(result.active_maintenance[0].title).toEqual('Scheduled Maintenance');
    });
  });

  describe('getPublicIncidents', () => {
    it('should return empty array when no incidents exist', async () => {
      const result = await getPublicIncidents();

      expect(result).toEqual([]);
    });

    it('should return only active incidents when includeResolved is false', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      // Create active and resolved incidents
      await db.insert(incidentsTable)
        .values([
          {
            title: 'Active Incident',
            status: 'investigating',
            impact: 'major',
            impact_description: 'Service down'
          },
          {
            title: 'Resolved Incident',
            status: 'resolved',
            impact: 'minor',
            impact_description: 'Fixed issue',
            resolved_at: oneHourAgo
          }
        ])
        .execute();

      const result = await getPublicIncidents(false, 0);

      expect(result).toHaveLength(1);
      expect(result[0].title).toEqual('Active Incident');
      expect(result[0].status).toEqual('investigating');
    });

    it('should include recent resolved incidents when includeResolved is true', async () => {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const twentyDaysAgo = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);

      // Create incidents with different resolution dates
      await db.insert(incidentsTable)
        .values([
          {
            title: 'Recent Resolved',
            status: 'resolved',
            impact: 'minor',
            impact_description: 'Recent fix',
            resolved_at: oneDayAgo
          },
          {
            title: 'Old Resolved',
            status: 'resolved',
            impact: 'minor',
            impact_description: 'Old fix',
            resolved_at: twentyDaysAgo
          }
        ])
        .execute();

      const result = await getPublicIncidents(true, 15);

      expect(result).toHaveLength(1);
      expect(result[0].title).toEqual('Recent Resolved');
    });

    it('should include incident updates and affected components', async () => {
      // Create component group and component
      const groupResult = await db.insert(componentGroupsTable)
        .values({
          name: 'Test Group',
          display_order: 1,
          collapsed_by_default: false
        })
        .returning()
        .execute();

      const componentResult = await db.insert(componentsTable)
        .values({
          name: 'Affected Service',
          status: 'degraded',
          display_order: 1,
          group_id: groupResult[0].id
        })
        .returning()
        .execute();

      // Create incident
      const incidentResult = await db.insert(incidentsTable)
        .values({
          title: 'Service Issue',
          status: 'monitoring',
          impact: 'major',
          impact_description: 'Performance degradation'
        })
        .returning()
        .execute();

      const incident = incidentResult[0];

      // Create incident updates
      await db.insert(incidentUpdatesTable)
        .values([
          {
            message: 'Latest update',
            status: 'monitoring',
            incident_id: incident.id
          },
          {
            message: 'Initial investigation',
            status: 'investigating',
            incident_id: incident.id
          }
        ])
        .execute();

      // Link affected component
      await db.insert(incidentAffectedComponentsTable)
        .values({
          incident_id: incident.id,
          component_id: componentResult[0].id
        })
        .execute();

      const result = await getPublicIncidents();

      expect(result).toHaveLength(1);
      expect(result[0].updates).toHaveLength(2);
      expect(result[0].updates[0].message).toEqual('Latest update'); // Should be ordered by timestamp desc
      expect(result[0].affected_components).toHaveLength(1);
      expect(result[0].affected_components[0].name).toEqual('Affected Service');
    });
  });

  describe('getPublicMaintenance', () => {
    it('should return empty array when no maintenance windows exist', async () => {
      const result = await getPublicMaintenance();

      expect(result).toEqual([]);
    });

    it('should return scheduled, in_progress, and recent completed maintenance', async () => {
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const twentyDaysAgo = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);

      await db.insert(maintenanceWindowsTable)
        .values([
          {
            title: 'Upcoming Maintenance',
            description: 'Scheduled update',
            start_time: tomorrow,
            end_time: new Date(tomorrow.getTime() + 60 * 60 * 1000),
            status: 'scheduled'
          },
          {
            title: 'Current Maintenance',
            description: 'In progress',
            start_time: now,
            end_time: new Date(now.getTime() + 60 * 60 * 1000),
            status: 'in_progress'
          },
          {
            title: 'Recent Completed',
            description: 'Just finished',
            start_time: yesterday,
            end_time: yesterday,
            status: 'completed'
          },
          {
            title: 'Old Completed',
            description: 'Long ago',
            start_time: twentyDaysAgo,
            end_time: twentyDaysAgo,
            status: 'completed'
          }
        ])
        .execute();

      const result = await getPublicMaintenance();

      expect(result).toHaveLength(3); // Should exclude old completed maintenance
      
      const titles = result.map(m => m.title);
      expect(titles).toContain('Upcoming Maintenance');
      expect(titles).toContain('Current Maintenance');
      expect(titles).toContain('Recent Completed');
      expect(titles).not.toContain('Old Completed');
    });

    it('should include maintenance updates and affected components', async () => {
      // Create component group and component
      const groupResult = await db.insert(componentGroupsTable)
        .values({
          name: 'Test Group',
          display_order: 1,
          collapsed_by_default: false
        })
        .returning()
        .execute();

      const componentResult = await db.insert(componentsTable)
        .values({
          name: 'Maintained Service',
          status: 'under_maintenance',
          display_order: 1,
          group_id: groupResult[0].id
        })
        .returning()
        .execute();

      // Create maintenance window
      const maintenanceResult = await db.insert(maintenanceWindowsTable)
        .values({
          title: 'Server Updates',
          description: 'Applying security patches',
          start_time: new Date(),
          end_time: new Date(Date.now() + 60 * 60 * 1000),
          status: 'in_progress'
        })
        .returning()
        .execute();

      const maintenance = maintenanceResult[0];

      // Create maintenance updates
      await db.insert(maintenanceUpdatesTable)
        .values([
          {
            message: 'Updates in progress',
            maintenance_id: maintenance.id
          },
          {
            message: 'Starting maintenance',
            maintenance_id: maintenance.id
          }
        ])
        .execute();

      // Link affected component
      await db.insert(maintenanceAffectedComponentsTable)
        .values({
          maintenance_id: maintenance.id,
          component_id: componentResult[0].id
        })
        .execute();

      const result = await getPublicMaintenance();

      expect(result).toHaveLength(1);
      expect(result[0].updates).toHaveLength(2);
      expect(result[0].affected_components).toHaveLength(1);
      expect(result[0].affected_components[0].name).toEqual('Maintained Service');
    });
  });

  describe('getPublicIncidentById', () => {
    it('should return null for non-existent incident', async () => {
      const result = await getPublicIncidentById(999);

      expect(result).toBeNull();
    });

    it('should return incident with updates and affected components', async () => {
      // Create component group and component
      const groupResult = await db.insert(componentGroupsTable)
        .values({
          name: 'Test Group',
          display_order: 1,
          collapsed_by_default: false
        })
        .returning()
        .execute();

      const componentResult = await db.insert(componentsTable)
        .values({
          name: 'Test Service',
          status: 'degraded',
          display_order: 1,
          group_id: groupResult[0].id
        })
        .returning()
        .execute();

      // Create incident
      const incidentResult = await db.insert(incidentsTable)
        .values({
          title: 'Specific Incident',
          status: 'resolved',
          impact: 'minor',
          impact_description: 'Brief outage',
          root_cause: 'Network issue'
        })
        .returning()
        .execute();

      const incident = incidentResult[0];

      // Create incident update
      await db.insert(incidentUpdatesTable)
        .values({
          message: 'Issue resolved',
          status: 'resolved',
          incident_id: incident.id
        })
        .execute();

      // Link affected component
      await db.insert(incidentAffectedComponentsTable)
        .values({
          incident_id: incident.id,
          component_id: componentResult[0].id
        })
        .execute();

      const result = await getPublicIncidentById(incident.id);

      expect(result).not.toBeNull();
      expect(result!.title).toEqual('Specific Incident');
      expect(result!.root_cause).toEqual('Network issue');
      expect(result!.updates).toHaveLength(1);
      expect(result!.updates[0].message).toEqual('Issue resolved');
      expect(result!.affected_components).toHaveLength(1);
      expect(result!.affected_components[0].name).toEqual('Test Service');
    });
  });

  describe('getPublicMaintenanceById', () => {
    it('should return null for non-existent maintenance', async () => {
      const result = await getPublicMaintenanceById(999);

      expect(result).toBeNull();
    });

    it('should return maintenance with updates and affected components', async () => {
      // Create component group and component
      const groupResult = await db.insert(componentGroupsTable)
        .values({
          name: 'Test Group',
          display_order: 1,
          collapsed_by_default: false
        })
        .returning()
        .execute();

      const componentResult = await db.insert(componentsTable)
        .values({
          name: 'Test Service',
          status: 'under_maintenance',
          display_order: 1,
          group_id: groupResult[0].id
        })
        .returning()
        .execute();

      // Create maintenance window
      const maintenanceResult = await db.insert(maintenanceWindowsTable)
        .values({
          title: 'Specific Maintenance',
          description: 'Database upgrade',
          start_time: new Date(),
          end_time: new Date(Date.now() + 60 * 60 * 1000),
          status: 'completed'
        })
        .returning()
        .execute();

      const maintenance = maintenanceResult[0];

      // Create maintenance update
      await db.insert(maintenanceUpdatesTable)
        .values({
          message: 'Maintenance completed successfully',
          maintenance_id: maintenance.id
        })
        .execute();

      // Link affected component
      await db.insert(maintenanceAffectedComponentsTable)
        .values({
          maintenance_id: maintenance.id,
          component_id: componentResult[0].id
        })
        .execute();

      const result = await getPublicMaintenanceById(maintenance.id);

      expect(result).not.toBeNull();
      expect(result!.title).toEqual('Specific Maintenance');
      expect(result!.description).toEqual('Database upgrade');
      expect(result!.updates).toHaveLength(1);
      expect(result!.updates[0].message).toEqual('Maintenance completed successfully');
      expect(result!.affected_components).toHaveLength(1);
      expect(result!.affected_components[0].name).toEqual('Test Service');
    });
  });
});