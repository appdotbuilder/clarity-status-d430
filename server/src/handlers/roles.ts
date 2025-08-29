import { db } from '../db';
import { rolesTable, usersTable } from '../db/schema';
import { type CreateRoleInput, type UpdateRoleInput, type Role } from '../schema';
import { eq } from 'drizzle-orm';

export async function createRole(input: CreateRoleInput): Promise<Role> {
  try {
    const result = await db.insert(rolesTable)
      .values({
        name: input.name,
        description: input.description,
        permissions: input.permissions
      })
      .returning()
      .execute();

    return {
      ...result[0],
      permissions: result[0].permissions as Record<string, boolean>
    };
  } catch (error) {
    console.error('Role creation failed:', error);
    throw error;
  }
}

export async function getRoles(): Promise<Role[]> {
  try {
    const results = await db.select()
      .from(rolesTable)
      .execute();

    return results.map(role => ({
      ...role,
      permissions: role.permissions as Record<string, boolean>
    }));
  } catch (error) {
    console.error('Failed to fetch roles:', error);
    throw error;
  }
}

export async function getRoleById(id: number): Promise<Role | null> {
  try {
    const results = await db.select()
      .from(rolesTable)
      .where(eq(rolesTable.id, id))
      .execute();

    if (results.length === 0) {
      return null;
    }

    return {
      ...results[0],
      permissions: results[0].permissions as Record<string, boolean>
    };
  } catch (error) {
    console.error('Failed to fetch role by ID:', error);
    throw error;
  }
}

export async function updateRole(input: UpdateRoleInput): Promise<Role> {
  try {
    // Build update object dynamically
    const updateData: any = {};
    if (input.name !== undefined) {
      updateData.name = input.name;
    }
    if (input.description !== undefined) {
      updateData.description = input.description;
    }
    if (input.permissions !== undefined) {
      updateData.permissions = input.permissions;
    }
    updateData.updated_at = new Date();

    const result = await db.update(rolesTable)
      .set(updateData)
      .where(eq(rolesTable.id, input.id))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error(`Role with id ${input.id} not found`);
    }

    return {
      ...result[0],
      permissions: result[0].permissions as Record<string, boolean>
    };
  } catch (error) {
    console.error('Role update failed:', error);
    throw error;
  }
}

export async function deleteRole(id: number): Promise<void> {
  try {
    // First check if any users are assigned to this role
    const usersWithRole = await db.select()
      .from(usersTable)
      .where(eq(usersTable.role_id, id))
      .execute();

    if (usersWithRole.length > 0) {
      throw new Error(`Cannot delete role: ${usersWithRole.length} users are assigned to this role`);
    }

    // Delete the role
    const result = await db.delete(rolesTable)
      .where(eq(rolesTable.id, id))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error(`Role with id ${id} not found`);
    }
  } catch (error) {
    console.error('Role deletion failed:', error);
    throw error;
  }
}