import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { componentGroupsTable, componentsTable } from '../db/schema';
import { 
    type CreateComponentGroupInput,
    type UpdateComponentGroupInput,
    type CreateComponentInput,
    type UpdateComponentInput
} from '../schema';
import {
    createComponentGroup,
    getComponentGroups,
    getComponentGroupById,
    updateComponentGroup,
    deleteComponentGroup,
    createComponent,
    getComponents,
    getComponentById,
    updateComponent,
    deleteComponent,
    getOverallStatus
} from '../handlers/components';
import { eq } from 'drizzle-orm';

describe('Component Group Handlers', () => {
    beforeEach(createDB);
    afterEach(resetDB);

    describe('createComponentGroup', () => {
        it('should create a component group with explicit display order', async () => {
            const input: CreateComponentGroupInput = {
                name: 'Web Services',
                display_order: 5,
                collapsed_by_default: true
            };

            const result = await createComponentGroup(input);

            expect(result.name).toEqual('Web Services');
            expect(result.display_order).toEqual(5);
            expect(result.collapsed_by_default).toEqual(true);
            expect(result.id).toBeDefined();
            expect(result.created_at).toBeInstanceOf(Date);
            expect(result.updated_at).toBeInstanceOf(Date);
            expect(result.components).toEqual([]);
        });

        it('should auto-assign display order when not provided', async () => {
            // Create first group with explicit order
            await createComponentGroup({
                name: 'First Group',
                display_order: 10,
                collapsed_by_default: false
            });

            // Create second group without order
            const input: CreateComponentGroupInput = {
                name: 'Second Group',
                collapsed_by_default: false
            };

            const result = await createComponentGroup(input);

            expect(result.display_order).toEqual(11);
            expect(result.name).toEqual('Second Group');
        });

        it('should save component group to database', async () => {
            const input: CreateComponentGroupInput = {
                name: 'Database Services',
                collapsed_by_default: false
            };

            const result = await createComponentGroup(input);

            const groups = await db.select()
                .from(componentGroupsTable)
                .where(eq(componentGroupsTable.id, result.id))
                .execute();

            expect(groups).toHaveLength(1);
            expect(groups[0].name).toEqual('Database Services');
            expect(groups[0].collapsed_by_default).toEqual(false);
        });
    });

    describe('getComponentGroups', () => {
        it('should return empty array when no groups exist', async () => {
            const result = await getComponentGroups();
            expect(result).toEqual([]);
        });

        it('should return groups with components ordered correctly', async () => {
            // Create groups in non-sequential order
            const group1 = await createComponentGroup({
                name: 'Group B',
                display_order: 2,
                collapsed_by_default: false
            });

            const group2 = await createComponentGroup({
                name: 'Group A',
                display_order: 1,
                collapsed_by_default: false
            });

            // Add components to groups
            await createComponent({
                name: 'Component 2',
                status: 'operational',
                display_order: 2,
                group_id: group1.id
            });

            await createComponent({
                name: 'Component 1',
                status: 'degraded',
                display_order: 1,
                group_id: group1.id
            });

            const result = await getComponentGroups();

            expect(result).toHaveLength(2);
            // Should be ordered by group display_order
            expect(result[0].name).toEqual('Group A');
            expect(result[1].name).toEqual('Group B');
            
            // Group B should have components ordered by display_order
            expect(result[1].components).toHaveLength(2);
            expect(result[1].components[0].name).toEqual('Component 1');
            expect(result[1].components[1].name).toEqual('Component 2');
        });

        it('should handle groups with no components', async () => {
            await createComponentGroup({
                name: 'Empty Group',
                collapsed_by_default: false
            });

            const result = await getComponentGroups();

            expect(result).toHaveLength(1);
            expect(result[0].name).toEqual('Empty Group');
            expect(result[0].components).toEqual([]);
        });
    });

    describe('getComponentGroupById', () => {
        it('should return null for non-existent group', async () => {
            const result = await getComponentGroupById(999);
            expect(result).toBeNull();
        });

        it('should return group with components', async () => {
            const group = await createComponentGroup({
                name: 'Test Group',
                collapsed_by_default: false
            });

            await createComponent({
                name: 'Test Component',
                status: 'operational',
                group_id: group.id
            });

            const result = await getComponentGroupById(group.id);

            expect(result).not.toBeNull();
            expect(result!.name).toEqual('Test Group');
            expect(result!.components).toHaveLength(1);
            expect(result!.components[0].name).toEqual('Test Component');
        });
    });

    describe('updateComponentGroup', () => {
        it('should update component group fields', async () => {
            const group = await createComponentGroup({
                name: 'Original Name',
                display_order: 1,
                collapsed_by_default: false
            });

            const updateInput: UpdateComponentGroupInput = {
                id: group.id,
                name: 'Updated Name',
                display_order: 10,
                collapsed_by_default: true
            };

            const result = await updateComponentGroup(updateInput);

            expect(result.name).toEqual('Updated Name');
            expect(result.display_order).toEqual(10);
            expect(result.collapsed_by_default).toEqual(true);
            expect(result.updated_at.getTime()).toBeGreaterThan(result.created_at.getTime());
        });

        it('should throw error for non-existent group', async () => {
            const updateInput: UpdateComponentGroupInput = {
                id: 999,
                name: 'Non-existent'
            };

            await expect(updateComponentGroup(updateInput)).rejects.toThrow(/not found/i);
        });

        it('should update only provided fields', async () => {
            const group = await createComponentGroup({
                name: 'Original Name',
                display_order: 5,
                collapsed_by_default: false
            });

            const updateInput: UpdateComponentGroupInput = {
                id: group.id,
                name: 'New Name'
            };

            const result = await updateComponentGroup(updateInput);

            expect(result.name).toEqual('New Name');
            expect(result.display_order).toEqual(5); // Unchanged
            expect(result.collapsed_by_default).toEqual(false); // Unchanged
        });
    });

    describe('deleteComponentGroup', () => {
        it('should delete empty component group', async () => {
            const group = await createComponentGroup({
                name: 'To Delete',
                collapsed_by_default: false
            });

            await deleteComponentGroup(group.id);

            const result = await getComponentGroupById(group.id);
            expect(result).toBeNull();
        });

        it('should throw error when group contains components', async () => {
            const group = await createComponentGroup({
                name: 'With Components',
                collapsed_by_default: false
            });

            await createComponent({
                name: 'Test Component',
                status: 'operational',
                group_id: group.id
            });

            await expect(deleteComponentGroup(group.id)).rejects.toThrow(/contains components/i);
        });

        it('should throw error for non-existent group', async () => {
            await expect(deleteComponentGroup(999)).rejects.toThrow(/not found/i);
        });
    });
});

describe('Component Handlers', () => {
    beforeEach(createDB);
    afterEach(resetDB);

    let testGroup: any;

    beforeEach(async () => {
        testGroup = await createComponentGroup({
            name: 'Test Group',
            collapsed_by_default: false
        });
    });

    describe('createComponent', () => {
        it('should create a component with explicit display order', async () => {
            const input: CreateComponentInput = {
                name: 'Web Server',
                status: 'degraded',
                display_order: 5,
                group_id: testGroup.id
            };

            const result = await createComponent(input);

            expect(result.name).toEqual('Web Server');
            expect(result.status).toEqual('degraded');
            expect(result.display_order).toEqual(5);
            expect(result.group_id).toEqual(testGroup.id);
            expect(result.id).toBeDefined();
            expect(result.created_at).toBeInstanceOf(Date);
            expect(result.updated_at).toBeInstanceOf(Date);
        });

        it('should auto-assign display order when not provided', async () => {
            await createComponent({
                name: 'First Component',
                status: 'operational',
                display_order: 10,
                group_id: testGroup.id
            });

            const input: CreateComponentInput = {
                name: 'Second Component',
                status: 'operational',
                group_id: testGroup.id
            };

            const result = await createComponent(input);
            expect(result.display_order).toEqual(11);
        });

        it('should throw error for non-existent group', async () => {
            const input: CreateComponentInput = {
                name: 'Component',
                status: 'operational',
                group_id: 999
            };

            await expect(createComponent(input)).rejects.toThrow(/not found/i);
        });
    });

    describe('getComponents', () => {
        it('should return empty array when no components exist', async () => {
            const result = await getComponents();
            expect(result).toEqual([]);
        });

        it('should return components ordered by group and display order', async () => {
            const group2 = await createComponentGroup({
                name: 'Group 2',
                display_order: 2,
                collapsed_by_default: false
            });

            // Create components in different groups and orders
            await createComponent({
                name: 'Group1 Component2',
                status: 'operational',
                display_order: 2,
                group_id: testGroup.id
            });

            await createComponent({
                name: 'Group2 Component1',
                status: 'degraded',
                display_order: 1,
                group_id: group2.id
            });

            await createComponent({
                name: 'Group1 Component1',
                status: 'major_outage',
                display_order: 1,
                group_id: testGroup.id
            });

            const result = await getComponents();

            expect(result).toHaveLength(3);
            // Should be ordered by group_id first, then display_order
            expect(result[0].name).toEqual('Group1 Component1');
            expect(result[1].name).toEqual('Group1 Component2');
            expect(result[2].name).toEqual('Group2 Component1');
        });
    });

    describe('getComponentById', () => {
        it('should return null for non-existent component', async () => {
            const result = await getComponentById(999);
            expect(result).toBeNull();
        });

        it('should return component by id', async () => {
            const component = await createComponent({
                name: 'Test Component',
                status: 'under_maintenance',
                group_id: testGroup.id
            });

            const result = await getComponentById(component.id);

            expect(result).not.toBeNull();
            expect(result!.name).toEqual('Test Component');
            expect(result!.status).toEqual('under_maintenance');
        });
    });

    describe('updateComponent', () => {
        it('should update component fields', async () => {
            const component = await createComponent({
                name: 'Original Component',
                status: 'operational',
                display_order: 1,
                group_id: testGroup.id
            });

            const updateInput: UpdateComponentInput = {
                id: component.id,
                name: 'Updated Component',
                status: 'degraded',
                display_order: 5
            };

            const result = await updateComponent(updateInput);

            expect(result.name).toEqual('Updated Component');
            expect(result.status).toEqual('degraded');
            expect(result.display_order).toEqual(5);
            expect(result.updated_at.getTime()).toBeGreaterThan(result.created_at.getTime());
        });

        it('should update component group', async () => {
            const newGroup = await createComponentGroup({
                name: 'New Group',
                collapsed_by_default: false
            });

            const component = await createComponent({
                name: 'Component',
                status: 'operational',
                group_id: testGroup.id
            });

            const updateInput: UpdateComponentInput = {
                id: component.id,
                group_id: newGroup.id
            };

            const result = await updateComponent(updateInput);
            expect(result.group_id).toEqual(newGroup.id);
        });

        it('should throw error for non-existent component', async () => {
            const updateInput: UpdateComponentInput = {
                id: 999,
                name: 'Non-existent'
            };

            await expect(updateComponent(updateInput)).rejects.toThrow(/not found/i);
        });

        it('should throw error for non-existent group', async () => {
            const component = await createComponent({
                name: 'Component',
                status: 'operational',
                group_id: testGroup.id
            });

            const updateInput: UpdateComponentInput = {
                id: component.id,
                group_id: 999
            };

            await expect(updateComponent(updateInput)).rejects.toThrow(/not found/i);
        });
    });

    describe('deleteComponent', () => {
        it('should delete component', async () => {
            const component = await createComponent({
                name: 'To Delete',
                status: 'operational',
                group_id: testGroup.id
            });

            await deleteComponent(component.id);

            const result = await getComponentById(component.id);
            expect(result).toBeNull();
        });

        it('should throw error for non-existent component', async () => {
            await expect(deleteComponent(999)).rejects.toThrow(/not found/i);
        });
    });

    describe('getOverallStatus', () => {
        it('should return operational when no components exist', async () => {
            const result = await getOverallStatus();
            expect(result).toEqual('operational');
        });

        it('should return worst status among all components', async () => {
            await createComponent({
                name: 'Component 1',
                status: 'operational',
                group_id: testGroup.id
            });

            await createComponent({
                name: 'Component 2',
                status: 'degraded',
                group_id: testGroup.id
            });

            await createComponent({
                name: 'Component 3',
                status: 'partial_outage',
                group_id: testGroup.id
            });

            const result = await getOverallStatus();
            expect(result).toEqual('partial_outage');
        });

        it('should prioritize major_outage over other statuses', async () => {
            await createComponent({
                name: 'Component 1',
                status: 'operational',
                group_id: testGroup.id
            });

            await createComponent({
                name: 'Component 2',
                status: 'major_outage',
                group_id: testGroup.id
            });

            await createComponent({
                name: 'Component 3',
                status: 'degraded',
                group_id: testGroup.id
            });

            const result = await getOverallStatus();
            expect(result).toEqual('major_outage');
        });

        it('should handle maintenance status correctly', async () => {
            await createComponent({
                name: 'Component 1',
                status: 'operational',
                group_id: testGroup.id
            });

            await createComponent({
                name: 'Component 2',
                status: 'under_maintenance',
                group_id: testGroup.id
            });

            const result = await getOverallStatus();
            expect(result).toEqual('under_maintenance');
        });

        it('should return operational when all components are operational', async () => {
            await createComponent({
                name: 'Component 1',
                status: 'operational',
                group_id: testGroup.id
            });

            await createComponent({
                name: 'Component 2',
                status: 'operational',
                group_id: testGroup.id
            });

            const result = await getOverallStatus();
            expect(result).toEqual('operational');
        });
    });
});