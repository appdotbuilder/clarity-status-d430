import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
    incidentsTable, 
    incidentUpdatesTable,
    incidentAffectedComponentsTable,
    componentGroupsTable,
    componentsTable,
    auditLogsTable
} from '../db/schema';
import { 
    type CreateIncidentInput,
    type UpdateIncidentInput,
    type CreateIncidentUpdateInput,
    type UpdateIncidentUpdateInput
} from '../schema';
import {
    createIncident,
    getActiveIncidents,
    getRecentIncidents,
    getAllIncidents,
    getIncidentById,
    updateIncident,
    deleteIncident,
    createIncidentUpdate,
    getIncidentUpdates,
    updateIncidentUpdate,
    deleteIncidentUpdate,
    getIncidentHistory
} from '../handlers/incidents';
import { eq, and, gte } from 'drizzle-orm';

// Test data
const testIncidentInput: CreateIncidentInput = {
    title: 'Database Connection Issues',
    status: 'investigating',
    impact: 'major',
    impact_description: 'Users experiencing connection timeouts',
    root_cause: null,
    affected_component_ids: [],
    initial_update_message: 'We are investigating reports of database connection issues'
};

describe('Incidents Handlers', () => {
    beforeEach(createDB);
    afterEach(resetDB);

    // Helper function to create test component group and component
    async function createTestComponent() {
        const groupResult = await db.insert(componentGroupsTable)
            .values({
                name: 'Database Services',
                display_order: 1
            })
            .returning()
            .execute();

        const componentResult = await db.insert(componentsTable)
            .values({
                name: 'Main Database',
                status: 'operational',
                display_order: 1,
                group_id: groupResult[0].id
            })
            .returning()
            .execute();

        return componentResult[0];
    }

    describe('createIncident', () => {
        it('should create an incident with initial update', async () => {
            const component = await createTestComponent();
            const input: CreateIncidentInput = {
                ...testIncidentInput,
                affected_component_ids: [component.id]
            };

            const result = await createIncident(input);

            // Verify incident properties
            expect(result.title).toEqual(input.title);
            expect(result.status).toEqual(input.status);
            expect(result.impact).toEqual(input.impact);
            expect(result.impact_description).toEqual(input.impact_description);
            expect(result.root_cause).toBeNull();
            expect(result.resolved_at).toBeNull();
            expect(result.id).toBeDefined();
            expect(result.created_at).toBeInstanceOf(Date);
            expect(result.updated_at).toBeInstanceOf(Date);

            // Verify initial update was created
            expect(result.updates).toHaveLength(1);
            expect(result.updates[0].message).toEqual(input.initial_update_message);
            expect(result.updates[0].status).toEqual(input.status);
            expect(result.updates[0].incident_id).toEqual(result.id);

            // Verify affected components
            expect(result.affected_components).toHaveLength(1);
            expect(result.affected_components[0].id).toEqual(component.id);
        });

        it('should create incident without affected components', async () => {
            const result = await createIncident(testIncidentInput);

            expect(result.title).toEqual(testIncidentInput.title);
            expect(result.affected_components).toHaveLength(0);
            expect(result.updates).toHaveLength(1);
        });

        it('should save incident to database', async () => {
            const result = await createIncident(testIncidentInput);

            const incidents = await db.select()
                .from(incidentsTable)
                .where(eq(incidentsTable.id, result.id))
                .execute();

            expect(incidents).toHaveLength(1);
            expect(incidents[0].title).toEqual(testIncidentInput.title);
            expect(incidents[0].status).toEqual(testIncidentInput.status);
        });

        it('should log audit trail', async () => {
            await createIncident(testIncidentInput);

            const auditLogs = await db.select()
                .from(auditLogsTable)
                .where(eq(auditLogsTable.action, 'create_incident'))
                .execute();

            expect(auditLogs.length).toBeGreaterThan(0);
            expect(auditLogs[0].action).toEqual('create_incident');
        });
    });

    describe('getActiveIncidents', () => {
        it('should return only unresolved incidents', async () => {
            // Create resolved incident
            const resolvedIncident = await createIncident(testIncidentInput);
            await updateIncident({
                id: resolvedIncident.id,
                status: 'resolved',
                resolved_at: new Date()
            });

            // Create active incident
            await createIncident({
                ...testIncidentInput,
                title: 'Active Incident'
            });

            const activeIncidents = await getActiveIncidents();

            expect(activeIncidents).toHaveLength(1);
            expect(activeIncidents[0].title).toEqual('Active Incident');
            expect(activeIncidents[0].resolved_at).toBeNull();
        });

        it('should return empty array when no active incidents', async () => {
            const activeIncidents = await getActiveIncidents();
            expect(activeIncidents).toHaveLength(0);
        });

        it('should include incident details', async () => {
            const component = await createTestComponent();
            await createIncident({
                ...testIncidentInput,
                affected_component_ids: [component.id]
            });

            const activeIncidents = await getActiveIncidents();

            expect(activeIncidents).toHaveLength(1);
            expect(activeIncidents[0].updates).toHaveLength(1);
            expect(activeIncidents[0].affected_components).toHaveLength(1);
        });
    });

    describe('getRecentIncidents', () => {
        it('should return resolved incidents from last N days', async () => {
            // Create and resolve an incident
            const incident = await createIncident(testIncidentInput);
            await updateIncident({
                id: incident.id,
                status: 'resolved'
            });

            const recentIncidents = await getRecentIncidents(30);

            expect(recentIncidents).toHaveLength(1);
            expect(recentIncidents[0].status).toEqual('resolved');
            expect(recentIncidents[0].resolved_at).not.toBeNull();
        });

        it('should not return unresolved incidents', async () => {
            await createIncident(testIncidentInput);

            const recentIncidents = await getRecentIncidents(30);

            expect(recentIncidents).toHaveLength(0);
        });

        it('should filter by days parameter', async () => {
            // Create and resolve incident
            const incident = await createIncident(testIncidentInput);
            
            // Manually set resolved_at to older date
            const oldDate = new Date();
            oldDate.setDate(oldDate.getDate() - 20);
            
            await db.update(incidentsTable)
                .set({ 
                    resolved_at: oldDate,
                    status: 'resolved'
                })
                .where(eq(incidentsTable.id, incident.id))
                .execute();

            // Should find incident with 30 day window
            const recentIncidents30 = await getRecentIncidents(30);
            expect(recentIncidents30).toHaveLength(1);

            // Should not find incident with 10 day window
            const recentIncidents10 = await getRecentIncidents(10);
            expect(recentIncidents10).toHaveLength(0);
        });
    });

    describe('getAllIncidents', () => {
        it('should return all incidents regardless of status', async () => {
            // Create active incident
            await createIncident(testIncidentInput);

            // Create and resolve incident
            const resolvedIncident = await createIncident({
                ...testIncidentInput,
                title: 'Resolved Incident'
            });
            await updateIncident({
                id: resolvedIncident.id,
                status: 'resolved'
            });

            const allIncidents = await getAllIncidents();

            expect(allIncidents).toHaveLength(2);
            const titles = allIncidents.map(i => i.title);
            expect(titles).toContain(testIncidentInput.title);
            expect(titles).toContain('Resolved Incident');
        });

        it('should return empty array when no incidents', async () => {
            const allIncidents = await getAllIncidents();
            expect(allIncidents).toHaveLength(0);
        });
    });

    describe('getIncidentById', () => {
        it('should return incident with full details', async () => {
            const component = await createTestComponent();
            const incident = await createIncident({
                ...testIncidentInput,
                affected_component_ids: [component.id]
            });

            const result = await getIncidentById(incident.id);

            expect(result).not.toBeNull();
            expect(result!.id).toEqual(incident.id);
            expect(result!.title).toEqual(testIncidentInput.title);
            expect(result!.updates).toHaveLength(1);
            expect(result!.affected_components).toHaveLength(1);
            expect(result!.affected_components[0].id).toEqual(component.id);
        });

        it('should return null for non-existent incident', async () => {
            const result = await getIncidentById(999);
            expect(result).toBeNull();
        });
    });

    describe('updateIncident', () => {
        it('should update incident properties', async () => {
            const incident = await createIncident(testIncidentInput);

            const updateInput: UpdateIncidentInput = {
                id: incident.id,
                title: 'Updated Database Issues',
                status: 'identified',
                impact: 'critical',
                impact_description: 'All users affected',
                root_cause: 'Database server crash'
            };

            const result = await updateIncident(updateInput);

            expect(result.id).toEqual(incident.id);
            expect(result.title).toEqual(updateInput.title!);
            expect(result.status).toEqual(updateInput.status!);
            expect(result.impact).toEqual(updateInput.impact!);
            expect(result.impact_description).toEqual(updateInput.impact_description!);
            expect(result.root_cause).toEqual(updateInput.root_cause!);
            expect(result.resolved_at).toBeNull();
        });

        it('should set resolved_at when status changes to resolved', async () => {
            const incident = await createIncident(testIncidentInput);

            const result = await updateIncident({
                id: incident.id,
                status: 'resolved'
            });

            expect(result.status).toEqual('resolved');
            expect(result.resolved_at).not.toBeNull();
            expect(result.resolved_at).toBeInstanceOf(Date);
        });

        it('should allow setting custom resolved_at', async () => {
            const incident = await createIncident(testIncidentInput);
            const customResolvedAt = new Date('2024-01-01T12:00:00Z');

            const result = await updateIncident({
                id: incident.id,
                status: 'resolved',
                resolved_at: customResolvedAt
            });

            expect(result.status).toEqual('resolved');
            expect(result.resolved_at).toEqual(customResolvedAt);
        });

        it('should log audit trail', async () => {
            const incident = await createIncident(testIncidentInput);

            await updateIncident({
                id: incident.id,
                title: 'Updated Title'
            });

            const auditLogs = await db.select()
                .from(auditLogsTable)
                .where(eq(auditLogsTable.action, 'update_incident'))
                .execute();

            expect(auditLogs.length).toBeGreaterThan(0);
        });

        it('should throw error for non-existent incident', async () => {
            await expect(updateIncident({
                id: 999,
                title: 'Should fail'
            })).rejects.toThrow();
        });
    });

    describe('deleteIncident', () => {
        it('should delete incident and related data', async () => {
            const component = await createTestComponent();
            const incident = await createIncident({
                ...testIncidentInput,
                affected_component_ids: [component.id]
            });

            await deleteIncident(incident.id);

            // Verify incident is deleted
            const incidents = await db.select()
                .from(incidentsTable)
                .where(eq(incidentsTable.id, incident.id))
                .execute();

            expect(incidents).toHaveLength(0);

            // Verify updates are cascade deleted
            const updates = await db.select()
                .from(incidentUpdatesTable)
                .where(eq(incidentUpdatesTable.incident_id, incident.id))
                .execute();

            expect(updates).toHaveLength(0);

            // Verify affected components are cascade deleted
            const affectedComponents = await db.select()
                .from(incidentAffectedComponentsTable)
                .where(eq(incidentAffectedComponentsTable.incident_id, incident.id))
                .execute();

            expect(affectedComponents).toHaveLength(0);
        });

        it('should log audit trail', async () => {
            const incident = await createIncident(testIncidentInput);

            await deleteIncident(incident.id);

            const auditLogs = await db.select()
                .from(auditLogsTable)
                .where(eq(auditLogsTable.action, 'delete_incident'))
                .execute();

            expect(auditLogs.length).toBeGreaterThan(0);
        });

        it('should throw error for non-existent incident', async () => {
            await expect(deleteIncident(999)).rejects.toThrow();
        });
    });

    describe('createIncidentUpdate', () => {
        it('should create incident update', async () => {
            const incident = await createIncident(testIncidentInput);

            const updateInput: CreateIncidentUpdateInput = {
                message: 'Issue has been identified and fix is being deployed',
                status: 'identified',
                incident_id: incident.id
            };

            const result = await createIncidentUpdate(updateInput);

            expect(result.message).toEqual(updateInput.message);
            expect(result.status).toEqual(updateInput.status);
            expect(result.incident_id).toEqual(incident.id);
            expect(result.id).toBeDefined();
            expect(result.timestamp).toBeInstanceOf(Date);
            expect(result.created_at).toBeInstanceOf(Date);
            expect(result.updated_at).toBeInstanceOf(Date);
        });

        it('should use custom timestamp when provided', async () => {
            const incident = await createIncident(testIncidentInput);
            const customTimestamp = new Date('2024-01-01T12:00:00Z');

            const result = await createIncidentUpdate({
                message: 'Custom timestamp update',
                status: 'monitoring',
                timestamp: customTimestamp,
                incident_id: incident.id
            });

            expect(result.timestamp).toEqual(customTimestamp);
        });

        it('should update incident status', async () => {
            const incident = await createIncident(testIncidentInput);

            await createIncidentUpdate({
                message: 'Status update',
                status: 'monitoring',
                incident_id: incident.id
            });

            const updatedIncident = await getIncidentById(incident.id);
            expect(updatedIncident!.status).toEqual('monitoring');
        });

        it('should log audit trail', async () => {
            const incident = await createIncident(testIncidentInput);

            await createIncidentUpdate({
                message: 'Test update',
                status: 'monitoring',
                incident_id: incident.id
            });

            const auditLogs = await db.select()
                .from(auditLogsTable)
                .where(eq(auditLogsTable.action, 'create_incident_update'))
                .execute();

            expect(auditLogs.length).toBeGreaterThan(0);
        });
    });

    describe('getIncidentUpdates', () => {
        it('should return updates for specific incident', async () => {
            const incident = await createIncident(testIncidentInput);

            // Add additional update
            await createIncidentUpdate({
                message: 'Additional update',
                status: 'monitoring',
                incident_id: incident.id
            });

            const updates = await getIncidentUpdates(incident.id);

            expect(updates).toHaveLength(2); // Initial + additional
            // Should be ordered by timestamp descending (newest first)
            expect(updates[0].message).toEqual('Additional update');
            expect(updates[1].message).toEqual(testIncidentInput.initial_update_message);
        });

        it('should return empty array for incident with no updates', async () => {
            // Create incident directly in database without handler to skip initial update
            const incidentResult = await db.insert(incidentsTable)
                .values({
                    title: 'No updates incident',
                    status: 'investigating',
                    impact: 'minor'
                })
                .returning()
                .execute();

            const updates = await getIncidentUpdates(incidentResult[0].id);
            expect(updates).toHaveLength(0);
        });
    });

    describe('updateIncidentUpdate', () => {
        it('should update incident update properties', async () => {
            const incident = await createIncident(testIncidentInput);
            
            const update = await createIncidentUpdate({
                message: 'Original message',
                status: 'investigating',
                incident_id: incident.id
            });

            const customTimestamp = new Date('2024-01-01T12:00:00Z');
            
            const result = await updateIncidentUpdate({
                id: update.id,
                message: 'Updated message',
                status: 'monitoring',
                timestamp: customTimestamp
            });

            expect(result.id).toEqual(update.id);
            expect(result.message).toEqual('Updated message');
            expect(result.status).toEqual('monitoring');
            expect(result.timestamp).toEqual(customTimestamp);
        });

        it('should log audit trail', async () => {
            const incident = await createIncident(testIncidentInput);
            const update = await createIncidentUpdate({
                message: 'Test message',
                status: 'investigating',
                incident_id: incident.id
            });

            await updateIncidentUpdate({
                id: update.id,
                message: 'Updated message'
            });

            const auditLogs = await db.select()
                .from(auditLogsTable)
                .where(eq(auditLogsTable.action, 'update_incident_update'))
                .execute();

            expect(auditLogs.length).toBeGreaterThan(0);
        });

        it('should throw error for non-existent update', async () => {
            await expect(updateIncidentUpdate({
                id: 999,
                message: 'Should fail'
            })).rejects.toThrow();
        });
    });

    describe('deleteIncidentUpdate', () => {
        it('should delete incident update', async () => {
            const incident = await createIncident(testIncidentInput);
            const update = await createIncidentUpdate({
                message: 'To be deleted',
                status: 'investigating',
                incident_id: incident.id
            });

            await deleteIncidentUpdate(update.id);

            const updates = await db.select()
                .from(incidentUpdatesTable)
                .where(eq(incidentUpdatesTable.id, update.id))
                .execute();

            expect(updates).toHaveLength(0);
        });

        it('should log audit trail', async () => {
            const incident = await createIncident(testIncidentInput);
            const update = await createIncidentUpdate({
                message: 'Test message',
                status: 'investigating',
                incident_id: incident.id
            });

            await deleteIncidentUpdate(update.id);

            const auditLogs = await db.select()
                .from(auditLogsTable)
                .where(eq(auditLogsTable.action, 'delete_incident_update'))
                .execute();

            expect(auditLogs.length).toBeGreaterThan(0);
        });

        it('should throw error for non-existent update', async () => {
            await expect(deleteIncidentUpdate(999)).rejects.toThrow();
        });
    });

    describe('getIncidentHistory', () => {
        it('should return all incidents when no filters provided', async () => {
            await createIncident(testIncidentInput);
            await createIncident({
                ...testIncidentInput,
                title: 'Second Incident'
            });

            const history = await getIncidentHistory();

            expect(history).toHaveLength(2);
        });

        it('should filter by year', async () => {
            // Create incident in current year
            await createIncident(testIncidentInput);

            // Create incident in 2023 (manually set date)
            const oldIncident = await createIncident({
                ...testIncidentInput,
                title: 'Old Incident'
            });

            const oldDate = new Date('2023-06-15T10:00:00Z');
            await db.update(incidentsTable)
                .set({ created_at: oldDate })
                .where(eq(incidentsTable.id, oldIncident.id))
                .execute();

            const currentYear = new Date().getFullYear();
            const history2024 = await getIncidentHistory(currentYear);
            const history2023 = await getIncidentHistory(2023);

            expect(history2024).toHaveLength(1);
            expect(history2024[0].title).toEqual(testIncidentInput.title);
            
            expect(history2023).toHaveLength(1);
            expect(history2023[0].title).toEqual('Old Incident');
        });

        it('should filter by year and month', async () => {
            // Create incident in June 2023
            const juneIncident = await createIncident({
                ...testIncidentInput,
                title: 'June Incident'
            });

            const juneDate = new Date('2023-06-15T10:00:00Z');
            await db.update(incidentsTable)
                .set({ created_at: juneDate })
                .where(eq(incidentsTable.id, juneIncident.id))
                .execute();

            // Create incident in July 2023
            const julyIncident = await createIncident({
                ...testIncidentInput,
                title: 'July Incident'
            });

            const julyDate = new Date('2023-07-15T10:00:00Z');
            await db.update(incidentsTable)
                .set({ created_at: julyDate })
                .where(eq(incidentsTable.id, julyIncident.id))
                .execute();

            const juneHistory = await getIncidentHistory(2023, 6);
            const julyHistory = await getIncidentHistory(2023, 7);

            expect(juneHistory).toHaveLength(1);
            expect(juneHistory[0].title).toEqual('June Incident');
            
            expect(julyHistory).toHaveLength(1);
            expect(julyHistory[0].title).toEqual('July Incident');
        });

        it('should return empty array when no incidents match filters', async () => {
            await createIncident(testIncidentInput);

            const history = await getIncidentHistory(2020, 1);
            expect(history).toHaveLength(0);
        });

        it('should include full incident details', async () => {
            const component = await createTestComponent();
            await createIncident({
                ...testIncidentInput,
                affected_component_ids: [component.id]
            });

            const history = await getIncidentHistory();

            expect(history).toHaveLength(1);
            expect(history[0].updates).toHaveLength(1);
            expect(history[0].affected_components).toHaveLength(1);
        });
    });
});