import { db } from '../db';
import { 
    automationsTable,
    automationComponentsTable,
    componentsTable,
    auditLogsTable
} from '../db/schema';
import { 
    type CreateAutomationInput, 
    type UpdateAutomationInput, 
    type Automation,
    type ExecuteAutomationInput
} from '../schema';
import { eq, and, inArray } from 'drizzle-orm';

export async function createAutomation(input: CreateAutomationInput): Promise<Automation> {
    try {
        // Create the automation
        const automationResult = await db.insert(automationsTable)
            .values({
                name: input.name,
                new_status: input.new_status
            })
            .returning()
            .execute();

        const automation = automationResult[0];

        // Add components to the automation if provided
        if (input.target_component_ids.length > 0) {
            const componentAssociations = input.target_component_ids.map(componentId => ({
                automation_id: automation.id,
                component_id: componentId
            }));

            await db.insert(automationComponentsTable)
                .values(componentAssociations)
                .execute();
        }

        // Log the action in audit trail
        await db.insert(auditLogsTable)
            .values({
                username: 'system', // In real implementation, this would come from auth context
                action: 'create_automation',
                details: `Created automation "${input.name}" with ${input.target_component_ids.length} target components`
            })
            .execute();

        return automation;
    } catch (error) {
        console.error('Automation creation failed:', error);
        throw error;
    }
}

export async function getAutomations(): Promise<Automation[]> {
    try {
        const automations = await db.select()
            .from(automationsTable)
            .execute();

        return automations;
    } catch (error) {
        console.error('Failed to fetch automations:', error);
        throw error;
    }
}

export async function getAutomationById(id: number): Promise<Automation | null> {
    try {
        const automations = await db.select()
            .from(automationsTable)
            .where(eq(automationsTable.id, id))
            .execute();

        return automations.length > 0 ? automations[0] : null;
    } catch (error) {
        console.error('Failed to fetch automation:', error);
        throw error;
    }
}

export async function updateAutomation(input: UpdateAutomationInput): Promise<Automation> {
    try {
        // Build update object with only provided fields
        const updateData: any = {};
        if (input.name !== undefined) updateData.name = input.name;
        if (input.new_status !== undefined) updateData.new_status = input.new_status;
        updateData.updated_at = new Date();

        const result = await db.update(automationsTable)
            .set(updateData)
            .where(eq(automationsTable.id, input.id))
            .returning()
            .execute();

        if (result.length === 0) {
            throw new Error(`Automation with id ${input.id} not found`);
        }

        // Log the action in audit trail
        await db.insert(auditLogsTable)
            .values({
                username: 'system',
                action: 'update_automation',
                details: `Updated automation with id ${input.id}`
            })
            .execute();

        return result[0];
    } catch (error) {
        console.error('Automation update failed:', error);
        throw error;
    }
}

export async function deleteAutomation(id: number): Promise<void> {
    try {
        // Delete automation components associations first (cascade should handle this, but being explicit)
        await db.delete(automationComponentsTable)
            .where(eq(automationComponentsTable.automation_id, id))
            .execute();

        // Delete the automation
        const result = await db.delete(automationsTable)
            .where(eq(automationsTable.id, id))
            .execute();

        // Log the action in audit trail
        await db.insert(auditLogsTable)
            .values({
                username: 'system',
                action: 'delete_automation',
                details: `Deleted automation with id ${id}`
            })
            .execute();
    } catch (error) {
        console.error('Automation deletion failed:', error);
        throw error;
    }
}

export async function executeAutomation(input: ExecuteAutomationInput): Promise<{ affected_components: number; success: boolean }> {
    try {
        // Get the automation details
        const automation = await getAutomationById(input.automation_id);
        if (!automation) {
            throw new Error(`Automation with id ${input.automation_id} not found`);
        }

        // Get all components associated with this automation
        const componentAssociations = await db.select({
            component_id: automationComponentsTable.component_id
        })
            .from(automationComponentsTable)
            .where(eq(automationComponentsTable.automation_id, input.automation_id))
            .execute();

        const componentIds = componentAssociations.map(assoc => assoc.component_id);

        if (componentIds.length === 0) {
            // Log the action
            await db.insert(auditLogsTable)
                .values({
                    username: 'system',
                    action: 'execute_automation',
                    details: `Executed automation "${automation.name}" but no components were targeted`
                })
                .execute();

            return { affected_components: 0, success: true };
        }

        // Update all target components to the new status
        await db.update(componentsTable)
            .set({
                status: automation.new_status,
                updated_at: new Date()
            })
            .where(inArray(componentsTable.id, componentIds))
            .execute();

        // Log the detailed action in audit trail
        await db.insert(auditLogsTable)
            .values({
                username: 'system',
                action: 'execute_automation',
                details: `Executed automation "${automation.name}" affecting ${componentIds.length} components. Set status to ${automation.new_status}.`
            })
            .execute();

        return { affected_components: componentIds.length, success: true };
    } catch (error) {
        console.error('Automation execution failed:', error);
        throw error;
    }
}

export async function addComponentsToAutomation(automationId: number, componentIds: number[]): Promise<void> {
    try {
        if (componentIds.length === 0) return;

        // Check if automation exists
        const automation = await getAutomationById(automationId);
        if (!automation) {
            throw new Error(`Automation with id ${automationId} not found`);
        }

        // Get existing component associations to avoid duplicates
        const existingAssociations = await db.select({
            component_id: automationComponentsTable.component_id
        })
            .from(automationComponentsTable)
            .where(eq(automationComponentsTable.automation_id, automationId))
            .execute();

        const existingComponentIds = existingAssociations.map(assoc => assoc.component_id);
        const newComponentIds = componentIds.filter(id => !existingComponentIds.includes(id));

        if (newComponentIds.length > 0) {
            const componentAssociations = newComponentIds.map(componentId => ({
                automation_id: automationId,
                component_id: componentId
            }));

            await db.insert(automationComponentsTable)
                .values(componentAssociations)
                .execute();
        }

        // Log the action in audit trail
        await db.insert(auditLogsTable)
            .values({
                username: 'system',
                action: 'add_components_to_automation',
                details: `Added ${newComponentIds.length} components to automation "${automation.name}"`
            })
            .execute();
    } catch (error) {
        console.error('Failed to add components to automation:', error);
        throw error;
    }
}

export async function removeComponentsFromAutomation(automationId: number, componentIds: number[]): Promise<void> {
    try {
        if (componentIds.length === 0) return;

        // Check if automation exists
        const automation = await getAutomationById(automationId);
        if (!automation) {
            throw new Error(`Automation with id ${automationId} not found`);
        }

        // Remove component associations
        await db.delete(automationComponentsTable)
            .where(
                and(
                    eq(automationComponentsTable.automation_id, automationId),
                    inArray(automationComponentsTable.component_id, componentIds)
                )
            )
            .execute();

        // Log the action in audit trail
        await db.insert(auditLogsTable)
            .values({
                username: 'system',
                action: 'remove_components_from_automation',
                details: `Removed ${componentIds.length} components from automation "${automation.name}"`
            })
            .execute();
    } catch (error) {
        console.error('Failed to remove components from automation:', error);
        throw error;
    }
}