import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
    automationsTable, 
    automationComponentsTable,
    componentGroupsTable,
    componentsTable,
    auditLogsTable
} from '../db/schema';
import { 
    type CreateAutomationInput,
    type UpdateAutomationInput,
    type ExecuteAutomationInput
} from '../schema';
import {
    createAutomation,
    getAutomations,
    getAutomationById,
    updateAutomation,
    deleteAutomation,
    executeAutomation,
    addComponentsToAutomation,
    removeComponentsFromAutomation
} from '../handlers/automations';
import { eq, and, inArray } from 'drizzle-orm';

// Test data
const testAutomationInput: CreateAutomationInput = {
    name: 'Test Automation',
    new_status: 'under_maintenance',
    target_component_ids: []
};

describe('Automation Handlers', () => {
    beforeEach(createDB);
    afterEach(resetDB);

    describe('createAutomation', () => {
        it('should create an automation without components', async () => {
            const result = await createAutomation(testAutomationInput);

            expect(result.name).toEqual('Test Automation');
            expect(result.new_status).toEqual('under_maintenance');
            expect(result.id).toBeDefined();
            expect(result.created_at).toBeInstanceOf(Date);
            expect(result.updated_at).toBeInstanceOf(Date);
        });

        it('should create an automation with target components', async () => {
            // Create a component group first
            const groupResult = await db.insert(componentGroupsTable)
                .values({
                    name: 'Test Group',
                    display_order: 1
                })
                .returning()
                .execute();

            // Create test components
            const componentResults = await db.insert(componentsTable)
                .values([
                    { name: 'Component 1', group_id: groupResult[0].id, display_order: 1 },
                    { name: 'Component 2', group_id: groupResult[0].id, display_order: 2 }
                ])
                .returning()
                .execute();

            const inputWithComponents: CreateAutomationInput = {
                ...testAutomationInput,
                target_component_ids: [componentResults[0].id, componentResults[1].id]
            };

            const result = await createAutomation(inputWithComponents);

            expect(result.name).toEqual('Test Automation');
            expect(result.new_status).toEqual('under_maintenance');

            // Verify component associations were created
            const associations = await db.select()
                .from(automationComponentsTable)
                .where(eq(automationComponentsTable.automation_id, result.id))
                .execute();

            expect(associations).toHaveLength(2);
        });

        it('should log automation creation in audit trail', async () => {
            await createAutomation(testAutomationInput);

            const auditLogs = await db.select()
                .from(auditLogsTable)
                .where(eq(auditLogsTable.action, 'create_automation'))
                .execute();

            expect(auditLogs).toHaveLength(1);
            expect(auditLogs[0].details).toContain('Created automation "Test Automation"');
        });

        it('should save automation to database', async () => {
            const result = await createAutomation(testAutomationInput);

            const automations = await db.select()
                .from(automationsTable)
                .where(eq(automationsTable.id, result.id))
                .execute();

            expect(automations).toHaveLength(1);
            expect(automations[0].name).toEqual('Test Automation');
            expect(automations[0].new_status).toEqual('under_maintenance');
        });
    });

    describe('getAutomations', () => {
        it('should return empty array when no automations exist', async () => {
            const result = await getAutomations();

            expect(result).toEqual([]);
        });

        it('should return all automations', async () => {
            // Create test automations
            await createAutomation(testAutomationInput);
            await createAutomation({
                ...testAutomationInput,
                name: 'Another Automation',
                new_status: 'operational'
            });

            const result = await getAutomations();

            expect(result).toHaveLength(2);
            expect(result[0].name).toEqual('Test Automation');
            expect(result[1].name).toEqual('Another Automation');
        });
    });

    describe('getAutomationById', () => {
        it('should return null for non-existent automation', async () => {
            const result = await getAutomationById(999);

            expect(result).toBeNull();
        });

        it('should return automation by id', async () => {
            const created = await createAutomation(testAutomationInput);

            const result = await getAutomationById(created.id);

            expect(result).not.toBeNull();
            expect(result!.id).toEqual(created.id);
            expect(result!.name).toEqual('Test Automation');
            expect(result!.new_status).toEqual('under_maintenance');
        });
    });

    describe('updateAutomation', () => {
        it('should update automation name', async () => {
            const created = await createAutomation(testAutomationInput);

            const updateInput: UpdateAutomationInput = {
                id: created.id,
                name: 'Updated Automation Name'
            };

            const result = await updateAutomation(updateInput);

            expect(result.name).toEqual('Updated Automation Name');
            expect(result.new_status).toEqual('under_maintenance'); // unchanged
            expect(result.updated_at).toBeInstanceOf(Date);
        });

        it('should update automation status', async () => {
            const created = await createAutomation(testAutomationInput);

            const updateInput: UpdateAutomationInput = {
                id: created.id,
                new_status: 'degraded'
            };

            const result = await updateAutomation(updateInput);

            expect(result.name).toEqual('Test Automation'); // unchanged
            expect(result.new_status).toEqual('degraded');
        });

        it('should update both name and status', async () => {
            const created = await createAutomation(testAutomationInput);

            const updateInput: UpdateAutomationInput = {
                id: created.id,
                name: 'Fully Updated',
                new_status: 'major_outage'
            };

            const result = await updateAutomation(updateInput);

            expect(result.name).toEqual('Fully Updated');
            expect(result.new_status).toEqual('major_outage');
        });

        it('should throw error for non-existent automation', async () => {
            const updateInput: UpdateAutomationInput = {
                id: 999,
                name: 'Non-existent'
            };

            expect(updateAutomation(updateInput)).rejects.toThrow(/not found/i);
        });

        it('should log update in audit trail', async () => {
            const created = await createAutomation(testAutomationInput);

            await updateAutomation({
                id: created.id,
                name: 'Updated Name'
            });

            const auditLogs = await db.select()
                .from(auditLogsTable)
                .where(eq(auditLogsTable.action, 'update_automation'))
                .execute();

            expect(auditLogs).toHaveLength(1);
            expect(auditLogs[0].details).toContain(`Updated automation with id ${created.id}`);
        });
    });

    describe('deleteAutomation', () => {
        it('should delete automation', async () => {
            const created = await createAutomation(testAutomationInput);

            await deleteAutomation(created.id);

            // Verify automation is deleted
            const automations = await db.select()
                .from(automationsTable)
                .where(eq(automationsTable.id, created.id))
                .execute();

            expect(automations).toHaveLength(0);
        });

        it('should delete automation with component associations', async () => {
            // Create component group and components
            const groupResult = await db.insert(componentGroupsTable)
                .values({ name: 'Test Group', display_order: 1 })
                .returning()
                .execute();

            const componentResults = await db.insert(componentsTable)
                .values([
                    { name: 'Component 1', group_id: groupResult[0].id, display_order: 1 },
                    { name: 'Component 2', group_id: groupResult[0].id, display_order: 2 }
                ])
                .returning()
                .execute();

            // Create automation with components
            const created = await createAutomation({
                ...testAutomationInput,
                target_component_ids: [componentResults[0].id, componentResults[1].id]
            });

            await deleteAutomation(created.id);

            // Verify automation and associations are deleted
            const automations = await db.select()
                .from(automationsTable)
                .where(eq(automationsTable.id, created.id))
                .execute();

            const associations = await db.select()
                .from(automationComponentsTable)
                .where(eq(automationComponentsTable.automation_id, created.id))
                .execute();

            expect(automations).toHaveLength(0);
            expect(associations).toHaveLength(0);
        });

        it('should log deletion in audit trail', async () => {
            const created = await createAutomation(testAutomationInput);

            await deleteAutomation(created.id);

            const auditLogs = await db.select()
                .from(auditLogsTable)
                .where(eq(auditLogsTable.action, 'delete_automation'))
                .execute();

            expect(auditLogs).toHaveLength(1);
            expect(auditLogs[0].details).toContain(`Deleted automation with id ${created.id}`);
        });
    });

    describe('executeAutomation', () => {
        it('should execute automation with no components', async () => {
            const created = await createAutomation(testAutomationInput);

            const executeInput: ExecuteAutomationInput = {
                automation_id: created.id
            };

            const result = await executeAutomation(executeInput);

            expect(result.success).toBe(true);
            expect(result.affected_components).toBe(0);
        });

        it('should execute automation and update component statuses', async () => {
            // Create component group and components
            const groupResult = await db.insert(componentGroupsTable)
                .values({ name: 'Test Group', display_order: 1 })
                .returning()
                .execute();

            const componentResults = await db.insert(componentsTable)
                .values([
                    { name: 'Component 1', group_id: groupResult[0].id, display_order: 1, status: 'operational' },
                    { name: 'Component 2', group_id: groupResult[0].id, display_order: 2, status: 'operational' }
                ])
                .returning()
                .execute();

            // Create automation with components
            const created = await createAutomation({
                ...testAutomationInput,
                new_status: 'major_outage',
                target_component_ids: [componentResults[0].id, componentResults[1].id]
            });

            const executeInput: ExecuteAutomationInput = {
                automation_id: created.id
            };

            const result = await executeAutomation(executeInput);

            expect(result.success).toBe(true);
            expect(result.affected_components).toBe(2);

            // Verify component statuses were updated
            const updatedComponents = await db.select()
                .from(componentsTable)
                .where(inArray(componentsTable.id, [componentResults[0].id, componentResults[1].id]))
                .execute();

            expect(updatedComponents[0].status).toEqual('major_outage');
            expect(updatedComponents[1].status).toEqual('major_outage');
        });

        it('should throw error for non-existent automation', async () => {
            const executeInput: ExecuteAutomationInput = {
                automation_id: 999
            };

            expect(executeAutomation(executeInput)).rejects.toThrow(/not found/i);
        });

        it('should log execution in audit trail', async () => {
            const created = await createAutomation(testAutomationInput);

            await executeAutomation({ automation_id: created.id });

            const auditLogs = await db.select()
                .from(auditLogsTable)
                .where(eq(auditLogsTable.action, 'execute_automation'))
                .execute();

            expect(auditLogs).toHaveLength(1);
            expect(auditLogs[0].details).toContain('Executed automation "Test Automation"');
        });
    });

    describe('addComponentsToAutomation', () => {
        it('should add components to automation', async () => {
            // Create automation
            const created = await createAutomation(testAutomationInput);

            // Create component group and components
            const groupResult = await db.insert(componentGroupsTable)
                .values({ name: 'Test Group', display_order: 1 })
                .returning()
                .execute();

            const componentResults = await db.insert(componentsTable)
                .values([
                    { name: 'Component 1', group_id: groupResult[0].id, display_order: 1 },
                    { name: 'Component 2', group_id: groupResult[0].id, display_order: 2 }
                ])
                .returning()
                .execute();

            await addComponentsToAutomation(created.id, [componentResults[0].id, componentResults[1].id]);

            // Verify associations were created
            const associations = await db.select()
                .from(automationComponentsTable)
                .where(eq(automationComponentsTable.automation_id, created.id))
                .execute();

            expect(associations).toHaveLength(2);
        });

        it('should not add duplicate components', async () => {
            // Create automation with one component
            const groupResult = await db.insert(componentGroupsTable)
                .values({ name: 'Test Group', display_order: 1 })
                .returning()
                .execute();

            const componentResults = await db.insert(componentsTable)
                .values([
                    { name: 'Component 1', group_id: groupResult[0].id, display_order: 1 },
                    { name: 'Component 2', group_id: groupResult[0].id, display_order: 2 }
                ])
                .returning()
                .execute();

            const created = await createAutomation({
                ...testAutomationInput,
                target_component_ids: [componentResults[0].id]
            });

            // Try to add existing component plus a new one
            await addComponentsToAutomation(created.id, [componentResults[0].id, componentResults[1].id]);

            // Verify only 2 total associations exist (no duplicates)
            const associations = await db.select()
                .from(automationComponentsTable)
                .where(eq(automationComponentsTable.automation_id, created.id))
                .execute();

            expect(associations).toHaveLength(2);
        });

        it('should handle empty component array', async () => {
            const created = await createAutomation(testAutomationInput);

            await addComponentsToAutomation(created.id, []);

            const associations = await db.select()
                .from(automationComponentsTable)
                .where(eq(automationComponentsTable.automation_id, created.id))
                .execute();

            expect(associations).toHaveLength(0);
        });

        it('should throw error for non-existent automation', async () => {
            expect(addComponentsToAutomation(999, [1, 2])).rejects.toThrow(/not found/i);
        });

        it('should log addition in audit trail', async () => {
            const created = await createAutomation(testAutomationInput);

            // Create components
            const groupResult = await db.insert(componentGroupsTable)
                .values({ name: 'Test Group', display_order: 1 })
                .returning()
                .execute();

            const componentResults = await db.insert(componentsTable)
                .values([{ name: 'Component 1', group_id: groupResult[0].id, display_order: 1 }])
                .returning()
                .execute();

            await addComponentsToAutomation(created.id, [componentResults[0].id]);

            const auditLogs = await db.select()
                .from(auditLogsTable)
                .where(eq(auditLogsTable.action, 'add_components_to_automation'))
                .execute();

            expect(auditLogs).toHaveLength(1);
            expect(auditLogs[0].details).toContain('Added 1 components to automation');
        });
    });

    describe('removeComponentsFromAutomation', () => {
        it('should remove components from automation', async () => {
            // Create component group and components
            const groupResult = await db.insert(componentGroupsTable)
                .values({ name: 'Test Group', display_order: 1 })
                .returning()
                .execute();

            const componentResults = await db.insert(componentsTable)
                .values([
                    { name: 'Component 1', group_id: groupResult[0].id, display_order: 1 },
                    { name: 'Component 2', group_id: groupResult[0].id, display_order: 2 },
                    { name: 'Component 3', group_id: groupResult[0].id, display_order: 3 }
                ])
                .returning()
                .execute();

            // Create automation with components
            const created = await createAutomation({
                ...testAutomationInput,
                target_component_ids: [componentResults[0].id, componentResults[1].id, componentResults[2].id]
            });

            // Remove two components
            await removeComponentsFromAutomation(created.id, [componentResults[0].id, componentResults[2].id]);

            // Verify only one association remains
            const associations = await db.select()
                .from(automationComponentsTable)
                .where(eq(automationComponentsTable.automation_id, created.id))
                .execute();

            expect(associations).toHaveLength(1);
            expect(associations[0].component_id).toEqual(componentResults[1].id);
        });

        it('should handle empty component array', async () => {
            const created = await createAutomation(testAutomationInput);

            await removeComponentsFromAutomation(created.id, []);

            // Should not throw error
            expect(true).toBe(true);
        });

        it('should handle removal of non-existent associations', async () => {
            const created = await createAutomation(testAutomationInput);

            // Try to remove components that aren't associated
            await removeComponentsFromAutomation(created.id, [999, 998]);

            // Should not throw error
            expect(true).toBe(true);
        });

        it('should throw error for non-existent automation', async () => {
            expect(removeComponentsFromAutomation(999, [1, 2])).rejects.toThrow(/not found/i);
        });

        it('should log removal in audit trail', async () => {
            // Create component and automation
            const groupResult = await db.insert(componentGroupsTable)
                .values({ name: 'Test Group', display_order: 1 })
                .returning()
                .execute();

            const componentResults = await db.insert(componentsTable)
                .values([{ name: 'Component 1', group_id: groupResult[0].id, display_order: 1 }])
                .returning()
                .execute();

            const created = await createAutomation({
                ...testAutomationInput,
                target_component_ids: [componentResults[0].id]
            });

            await removeComponentsFromAutomation(created.id, [componentResults[0].id]);

            const auditLogs = await db.select()
                .from(auditLogsTable)
                .where(eq(auditLogsTable.action, 'remove_components_from_automation'))
                .execute();

            expect(auditLogs).toHaveLength(1);
            expect(auditLogs[0].details).toContain('Removed 1 components from automation');
        });
    });
});