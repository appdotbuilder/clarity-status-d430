import { db } from '../db';
import { 
    incidentsTable,
    incidentUpdatesTable,
    incidentAffectedComponentsTable,
    componentsTable,
    auditLogsTable
} from '../db/schema';
import { 
    type CreateIncidentInput, 
    type UpdateIncidentInput, 
    type IncidentWithDetails,
    type CreateIncidentUpdateInput,
    type UpdateIncidentUpdateInput,
    type IncidentUpdate,
    type Component
} from '../schema';
import { eq, isNull, and, gte, sql, desc, SQL, between } from 'drizzle-orm';

// Incident handlers
export async function createIncident(input: CreateIncidentInput): Promise<IncidentWithDetails> {
    try {
        // Start a transaction to ensure all operations succeed together
        const result = await db.transaction(async (tx) => {
            // Insert the incident
            const incidentResult = await tx.insert(incidentsTable)
                .values({
                    title: input.title,
                    status: input.status,
                    impact: input.impact,
                    impact_description: input.impact_description,
                    root_cause: input.root_cause || null
                })
                .returning()
                .execute();

            const incident = incidentResult[0];

            // Create the initial update
            await tx.insert(incidentUpdatesTable)
                .values({
                    message: input.initial_update_message,
                    status: input.status,
                    incident_id: incident.id
                })
                .execute();

            // Link affected components
            if (input.affected_component_ids.length > 0) {
                await tx.insert(incidentAffectedComponentsTable)
                    .values(input.affected_component_ids.map(componentId => ({
                        incident_id: incident.id,
                        component_id: componentId
                    })))
                    .execute();
            }

            // Log audit trail
            await tx.insert(auditLogsTable)
                .values({
                    username: 'system', // In real app, this would come from authenticated user
                    action: 'create_incident',
                    details: `Created incident: ${incident.title}`
                })
                .execute();

            return incident;
        });

        // Return full incident with details
        return await getIncidentById(result.id) as IncidentWithDetails;
    } catch (error) {
        console.error('Incident creation failed:', error);
        throw error;
    }
}

export async function getActiveIncidents(): Promise<IncidentWithDetails[]> {
    try {
        // Get all incidents where resolved_at is null
        const incidents = await db.select()
            .from(incidentsTable)
            .where(isNull(incidentsTable.resolved_at))
            .orderBy(desc(incidentsTable.created_at))
            .execute();

        // Get details for each incident
        const incidentsWithDetails = await Promise.all(
            incidents.map(async (incident) => {
                return await getIncidentById(incident.id) as IncidentWithDetails;
            })
        );

        return incidentsWithDetails;
    } catch (error) {
        console.error('Failed to get active incidents:', error);
        throw error;
    }
}

export async function getRecentIncidents(days: number = 15): Promise<IncidentWithDetails[]> {
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        // Get resolved incidents from the last N days
        const incidents = await db.select()
            .from(incidentsTable)
            .where(and(
                gte(incidentsTable.resolved_at, cutoffDate),
                sql`${incidentsTable.resolved_at} IS NOT NULL`
            ))
            .orderBy(desc(incidentsTable.resolved_at))
            .execute();

        // Get details for each incident
        const incidentsWithDetails = await Promise.all(
            incidents.map(async (incident) => {
                return await getIncidentById(incident.id) as IncidentWithDetails;
            })
        );

        return incidentsWithDetails;
    } catch (error) {
        console.error('Failed to get recent incidents:', error);
        throw error;
    }
}

export async function getAllIncidents(): Promise<IncidentWithDetails[]> {
    try {
        // Get all incidents ordered by creation date (newest first)
        const incidents = await db.select()
            .from(incidentsTable)
            .orderBy(desc(incidentsTable.created_at))
            .execute();

        // Get details for each incident
        const incidentsWithDetails = await Promise.all(
            incidents.map(async (incident) => {
                return await getIncidentById(incident.id) as IncidentWithDetails;
            })
        );

        return incidentsWithDetails;
    } catch (error) {
        console.error('Failed to get all incidents:', error);
        throw error;
    }
}

export async function getIncidentById(id: number): Promise<IncidentWithDetails | null> {
    try {
        // Get the incident
        const incidentResults = await db.select()
            .from(incidentsTable)
            .where(eq(incidentsTable.id, id))
            .execute();

        if (incidentResults.length === 0) {
            return null;
        }

        const incident = incidentResults[0];

        // Get incident updates
        const updates = await db.select()
            .from(incidentUpdatesTable)
            .where(eq(incidentUpdatesTable.incident_id, id))
            .orderBy(desc(incidentUpdatesTable.timestamp))
            .execute();

        // Get affected components
        const affectedComponentsResult = await db.select()
            .from(incidentAffectedComponentsTable)
            .innerJoin(componentsTable, eq(incidentAffectedComponentsTable.component_id, componentsTable.id))
            .where(eq(incidentAffectedComponentsTable.incident_id, id))
            .execute();

        const affected_components: Component[] = affectedComponentsResult.map(result => result.components);

        return {
            ...incident,
            updates,
            affected_components
        };
    } catch (error) {
        console.error('Failed to get incident by ID:', error);
        throw error;
    }
}

export async function updateIncident(input: UpdateIncidentInput): Promise<IncidentWithDetails> {
    try {
        const result = await db.transaction(async (tx) => {
            // Prepare update values
            const updateValues: any = {
                updated_at: sql`NOW()`
            };

            if (input.title !== undefined) updateValues.title = input.title;
            if (input.status !== undefined) updateValues.status = input.status;
            if (input.impact !== undefined) updateValues.impact = input.impact;
            if (input.impact_description !== undefined) updateValues.impact_description = input.impact_description;
            if (input.root_cause !== undefined) updateValues.root_cause = input.root_cause;
            if (input.resolved_at !== undefined) updateValues.resolved_at = input.resolved_at;

            // If status is being changed to resolved and no resolved_at is provided, set it now
            if (input.status === 'resolved' && input.resolved_at === undefined) {
                updateValues.resolved_at = sql`NOW()`;
            }

            // Update the incident
            const updatedIncidents = await tx.update(incidentsTable)
                .set(updateValues)
                .where(eq(incidentsTable.id, input.id))
                .returning()
                .execute();

            if (updatedIncidents.length === 0) {
                throw new Error('Incident not found');
            }

            // Log audit trail
            await tx.insert(auditLogsTable)
                .values({
                    username: 'system', // In real app, this would come from authenticated user
                    action: 'update_incident',
                    details: `Updated incident: ${updatedIncidents[0].title}`
                })
                .execute();

            return updatedIncidents[0];
        });

        // Return full incident with details
        return await getIncidentById(result.id) as IncidentWithDetails;
    } catch (error) {
        console.error('Incident update failed:', error);
        throw error;
    }
}

export async function deleteIncident(id: number): Promise<void> {
    try {
        await db.transaction(async (tx) => {
            // Get incident title for audit log
            const incidentResults = await tx.select()
                .from(incidentsTable)
                .where(eq(incidentsTable.id, id))
                .execute();

            if (incidentResults.length === 0) {
                throw new Error('Incident not found');
            }

            const incidentTitle = incidentResults[0].title;

            // Delete the incident (cascade will handle updates and affected components)
            await tx.delete(incidentsTable)
                .where(eq(incidentsTable.id, id))
                .execute();

            // Log audit trail
            await tx.insert(auditLogsTable)
                .values({
                    username: 'system', // In real app, this would come from authenticated user
                    action: 'delete_incident',
                    details: `Deleted incident: ${incidentTitle}`
                })
                .execute();
        });
    } catch (error) {
        console.error('Incident deletion failed:', error);
        throw error;
    }
}

// Incident Update handlers
export async function createIncidentUpdate(input: CreateIncidentUpdateInput): Promise<IncidentUpdate> {
    try {
        const result = await db.transaction(async (tx) => {
            // Insert the update
            const updateResult = await tx.insert(incidentUpdatesTable)
                .values({
                    message: input.message,
                    status: input.status,
                    timestamp: input.timestamp || sql`NOW()`,
                    incident_id: input.incident_id
                })
                .returning()
                .execute();

            // Update the incident's status to match the latest update
            await tx.update(incidentsTable)
                .set({
                    status: input.status,
                    updated_at: sql`NOW()`
                })
                .where(eq(incidentsTable.id, input.incident_id))
                .execute();

            // Log audit trail
            await tx.insert(auditLogsTable)
                .values({
                    username: 'system', // In real app, this would come from authenticated user
                    action: 'create_incident_update',
                    details: `Created update for incident ${input.incident_id}`
                })
                .execute();

            return updateResult[0];
        });

        return result;
    } catch (error) {
        console.error('Incident update creation failed:', error);
        throw error;
    }
}

export async function getIncidentUpdates(incidentId: number): Promise<IncidentUpdate[]> {
    try {
        const updates = await db.select()
            .from(incidentUpdatesTable)
            .where(eq(incidentUpdatesTable.incident_id, incidentId))
            .orderBy(desc(incidentUpdatesTable.timestamp))
            .execute();

        return updates;
    } catch (error) {
        console.error('Failed to get incident updates:', error);
        throw error;
    }
}

export async function updateIncidentUpdate(input: UpdateIncidentUpdateInput): Promise<IncidentUpdate> {
    try {
        const result = await db.transaction(async (tx) => {
            // Prepare update values
            const updateValues: any = {
                updated_at: sql`NOW()`
            };

            if (input.message !== undefined) updateValues.message = input.message;
            if (input.status !== undefined) updateValues.status = input.status;
            if (input.timestamp !== undefined) updateValues.timestamp = input.timestamp;

            // Update the incident update
            const updatedUpdates = await tx.update(incidentUpdatesTable)
                .set(updateValues)
                .where(eq(incidentUpdatesTable.id, input.id))
                .returning()
                .execute();

            if (updatedUpdates.length === 0) {
                throw new Error('Incident update not found');
            }

            // Log audit trail
            await tx.insert(auditLogsTable)
                .values({
                    username: 'system', // In real app, this would come from authenticated user
                    action: 'update_incident_update',
                    details: `Updated incident update ${input.id}`
                })
                .execute();

            return updatedUpdates[0];
        });

        return result;
    } catch (error) {
        console.error('Incident update modification failed:', error);
        throw error;
    }
}

export async function deleteIncidentUpdate(id: number): Promise<void> {
    try {
        await db.transaction(async (tx) => {
            // Delete the incident update
            const deletedUpdates = await tx.delete(incidentUpdatesTable)
                .where(eq(incidentUpdatesTable.id, id))
                .returning()
                .execute();

            if (deletedUpdates.length === 0) {
                throw new Error('Incident update not found');
            }

            // Log audit trail
            await tx.insert(auditLogsTable)
                .values({
                    username: 'system', // In real app, this would come from authenticated user
                    action: 'delete_incident_update',
                    details: `Deleted incident update ${id}`
                })
                .execute();
        });
    } catch (error) {
        console.error('Incident update deletion failed:', error);
        throw error;
    }
}

export async function getIncidentHistory(year?: number, month?: number): Promise<IncidentWithDetails[]> {
    try {
        const conditions: SQL<unknown>[] = [];

        if (year !== undefined) {
            if (month !== undefined) {
                // Filter by specific month and year
                const startDate = new Date(year, month - 1, 1); // month is 0-indexed
                const endDate = new Date(year, month, 0, 23, 59, 59, 999); // last day of month
                conditions.push(between(incidentsTable.created_at, startDate, endDate));
            } else {
                // Filter by year only
                const startDate = new Date(year, 0, 1); // January 1st
                const endDate = new Date(year, 11, 31, 23, 59, 59, 999); // December 31st
                conditions.push(between(incidentsTable.created_at, startDate, endDate));
            }
        }

        // Build query step by step to maintain proper types
        const baseQuery = db.select().from(incidentsTable);
        
        const queryWithFilters = conditions.length > 0 
            ? baseQuery.where(conditions.length === 1 ? conditions[0] : and(...conditions))
            : baseQuery;

        const incidents = await queryWithFilters
            .orderBy(desc(incidentsTable.created_at))
            .execute();

        // Get details for each incident
        const incidentsWithDetails = await Promise.all(
            incidents.map(async (incident) => {
                return await getIncidentById(incident.id) as IncidentWithDetails;
            })
        );

        return incidentsWithDetails;
    } catch (error) {
        console.error('Failed to get incident history:', error);
        throw error;
    }
}