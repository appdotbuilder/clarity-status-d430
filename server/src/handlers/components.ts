import { db } from '../db';
import { 
    componentGroupsTable, 
    componentsTable 
} from '../db/schema';
import { 
    type CreateComponentInput, 
    type UpdateComponentInput, 
    type Component,
    type CreateComponentGroupInput,
    type UpdateComponentGroupInput,
    type ComponentGroupWithComponents
} from '../schema';
import { eq, asc, max, and, isNull } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

// Component Group handlers
export async function createComponentGroup(input: CreateComponentGroupInput): Promise<ComponentGroupWithComponents> {
    try {
        let displayOrder = input.display_order;
        
        // If no display order provided, use next available order
        if (displayOrder === undefined) {
            const maxOrderResult = await db.select({
                maxOrder: max(componentGroupsTable.display_order)
            })
            .from(componentGroupsTable)
            .execute();
            
            displayOrder = (maxOrderResult[0]?.maxOrder ?? -1) + 1;
        }

        const result = await db.insert(componentGroupsTable)
            .values({
                name: input.name,
                display_order: displayOrder,
                collapsed_by_default: input.collapsed_by_default
            })
            .returning()
            .execute();

        const group = result[0];
        return {
            ...group,
            components: []
        };
    } catch (error) {
        console.error('Component group creation failed:', error);
        throw error;
    }
}

export async function getComponentGroups(): Promise<ComponentGroupWithComponents[]> {
    try {
        // Get all component groups with their components
        const groupsWithComponents = await db.select()
            .from(componentGroupsTable)
            .leftJoin(componentsTable, eq(componentGroupsTable.id, componentsTable.group_id))
            .orderBy(asc(componentGroupsTable.display_order), asc(componentsTable.display_order))
            .execute();

        // Group the results by component group
        const groupsMap = new Map<number, ComponentGroupWithComponents>();
        
        for (const row of groupsWithComponents) {
            const group = row.component_groups;
            const component = row.components;
            
            if (!groupsMap.has(group.id)) {
                groupsMap.set(group.id, {
                    ...group,
                    components: []
                });
            }
            
            if (component) {
                groupsMap.get(group.id)!.components.push(component);
            }
        }

        return Array.from(groupsMap.values());
    } catch (error) {
        console.error('Failed to fetch component groups:', error);
        throw error;
    }
}

export async function getComponentGroupById(id: number): Promise<ComponentGroupWithComponents | null> {
    try {
        const groupWithComponents = await db.select()
            .from(componentGroupsTable)
            .leftJoin(componentsTable, eq(componentGroupsTable.id, componentsTable.group_id))
            .where(eq(componentGroupsTable.id, id))
            .orderBy(asc(componentsTable.display_order))
            .execute();

        if (groupWithComponents.length === 0) {
            return null;
        }

        const group = groupWithComponents[0].component_groups;
        const components = groupWithComponents
            .map(row => row.components)
            .filter((component): component is NonNullable<typeof component> => Boolean(component));

        return {
            ...group,
            components
        };
    } catch (error) {
        console.error('Failed to fetch component group by id:', error);
        throw error;
    }
}

export async function updateComponentGroup(input: UpdateComponentGroupInput): Promise<ComponentGroupWithComponents> {
    try {
        const updates: Partial<typeof componentGroupsTable.$inferInsert> = {};
        
        if (input.name !== undefined) updates.name = input.name;
        if (input.display_order !== undefined) updates.display_order = input.display_order;
        if (input.collapsed_by_default !== undefined) updates.collapsed_by_default = input.collapsed_by_default;
        
        updates.updated_at = new Date();

        const result = await db.update(componentGroupsTable)
            .set(updates)
            .where(eq(componentGroupsTable.id, input.id))
            .returning()
            .execute();

        if (result.length === 0) {
            throw new Error(`Component group with id ${input.id} not found`);
        }

        // Fetch the updated group with its components
        const updatedGroup = await getComponentGroupById(input.id);
        if (!updatedGroup) {
            throw new Error(`Failed to fetch updated component group ${input.id}`);
        }

        return updatedGroup;
    } catch (error) {
        console.error('Component group update failed:', error);
        throw error;
    }
}

export async function deleteComponentGroup(id: number): Promise<void> {
    try {
        // Check if any components exist in this group
        const components = await db.select({ count: componentsTable.id })
            .from(componentsTable)
            .where(eq(componentsTable.group_id, id))
            .execute();

        if (components.length > 0) {
            throw new Error('Cannot delete component group that contains components');
        }

        const result = await db.delete(componentGroupsTable)
            .where(eq(componentGroupsTable.id, id))
            .returning({ id: componentGroupsTable.id })
            .execute();

        if (result.length === 0) {
            throw new Error(`Component group with id ${id} not found`);
        }
    } catch (error) {
        console.error('Component group deletion failed:', error);
        throw error;
    }
}

// Component handlers
export async function createComponent(input: CreateComponentInput): Promise<Component> {
    try {
        // Verify the group exists
        const group = await db.select({ id: componentGroupsTable.id })
            .from(componentGroupsTable)
            .where(eq(componentGroupsTable.id, input.group_id))
            .execute();

        if (group.length === 0) {
            throw new Error(`Component group with id ${input.group_id} not found`);
        }

        let displayOrder = input.display_order;
        
        // If no display order provided, use next available order within the group
        if (displayOrder === undefined) {
            const maxOrderResult = await db.select({
                maxOrder: max(componentsTable.display_order)
            })
            .from(componentsTable)
            .where(eq(componentsTable.group_id, input.group_id))
            .execute();
            
            displayOrder = (maxOrderResult[0]?.maxOrder ?? -1) + 1;
        }

        const result = await db.insert(componentsTable)
            .values({
                name: input.name,
                status: input.status,
                display_order: displayOrder,
                group_id: input.group_id
            })
            .returning()
            .execute();

        return result[0];
    } catch (error) {
        console.error('Component creation failed:', error);
        throw error;
    }
}

export async function getComponents(): Promise<Component[]> {
    try {
        const components = await db.select()
            .from(componentsTable)
            .orderBy(asc(componentsTable.group_id), asc(componentsTable.display_order))
            .execute();

        return components;
    } catch (error) {
        console.error('Failed to fetch components:', error);
        throw error;
    }
}

export async function getComponentById(id: number): Promise<Component | null> {
    try {
        const components = await db.select()
            .from(componentsTable)
            .where(eq(componentsTable.id, id))
            .execute();

        return components[0] || null;
    } catch (error) {
        console.error('Failed to fetch component by id:', error);
        throw error;
    }
}

export async function updateComponent(input: UpdateComponentInput): Promise<Component> {
    try {
        const updates: Partial<typeof componentsTable.$inferInsert> = {};
        
        if (input.name !== undefined) updates.name = input.name;
        if (input.status !== undefined) updates.status = input.status;
        if (input.display_order !== undefined) updates.display_order = input.display_order;
        if (input.group_id !== undefined) {
            // Verify the new group exists
            const group = await db.select({ id: componentGroupsTable.id })
                .from(componentGroupsTable)
                .where(eq(componentGroupsTable.id, input.group_id))
                .execute();

            if (group.length === 0) {
                throw new Error(`Component group with id ${input.group_id} not found`);
            }
            updates.group_id = input.group_id;
        }
        
        updates.updated_at = new Date();

        const result = await db.update(componentsTable)
            .set(updates)
            .where(eq(componentsTable.id, input.id))
            .returning()
            .execute();

        if (result.length === 0) {
            throw new Error(`Component with id ${input.id} not found`);
        }

        return result[0];
    } catch (error) {
        console.error('Component update failed:', error);
        throw error;
    }
}

export async function deleteComponent(id: number): Promise<void> {
    try {
        const result = await db.delete(componentsTable)
            .where(eq(componentsTable.id, id))
            .returning({ id: componentsTable.id })
            .execute();

        if (result.length === 0) {
            throw new Error(`Component with id ${id} not found`);
        }
    } catch (error) {
        console.error('Component deletion failed:', error);
        throw error;
    }
}

export async function getOverallStatus(): Promise<'operational' | 'degraded' | 'partial_outage' | 'major_outage' | 'under_maintenance'> {
    try {
        const components = await db.select({ status: componentsTable.status })
            .from(componentsTable)
            .execute();

        if (components.length === 0) {
            return 'operational';
        }

        // Status priority (higher number = more severe)
        const statusPriority = {
            'operational': 0,
            'under_maintenance': 1,
            'degraded': 2,
            'partial_outage': 3,
            'major_outage': 4
        };

        let maxSeverity = 0;
        let worstStatus: 'operational' | 'degraded' | 'partial_outage' | 'major_outage' | 'under_maintenance' = 'operational';

        for (const component of components) {
            const severity = statusPriority[component.status];
            if (severity > maxSeverity) {
                maxSeverity = severity;
                worstStatus = component.status;
            }
        }

        return worstStatus;
    } catch (error) {
        console.error('Failed to calculate overall status:', error);
        throw error;
    }
}