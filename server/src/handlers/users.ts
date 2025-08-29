import { db } from '../db';
import { usersTable, rolesTable } from '../db/schema';
import { type CreateUserInput, type UpdateUserInput, type UserWithRole } from '../schema';
import { eq } from 'drizzle-orm';
import { createHash } from 'crypto';

// Simple password hashing using SHA-256 (in production, use bcrypt or similar)
function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

export async function createUser(input: CreateUserInput): Promise<UserWithRole> {
  try {
    // Verify that the role exists
    const role = await db.select()
      .from(rolesTable)
      .where(eq(rolesTable.id, input.role_id))
      .execute();

    if (role.length === 0) {
      throw new Error(`Role with id ${input.role_id} not found`);
    }

    // Hash the password
    const hashedPassword = hashPassword(input.password);

    // Insert the user
    const userResult = await db.insert(usersTable)
      .values({
        username: input.username,
        hashed_password: hashedPassword,
        role_id: input.role_id,
        updated_at: new Date()
      })
      .returning()
      .execute();

    const newUser = userResult[0];

    // Return user with role details
    return {
      ...newUser,
      role: {
        ...role[0],
        permissions: role[0].permissions as Record<string, boolean>
      }
    };
  } catch (error) {
    console.error('User creation failed:', error);
    throw error;
  }
}

export async function getUsers(): Promise<UserWithRole[]> {
  try {
    const results = await db.select()
      .from(usersTable)
      .innerJoin(rolesTable, eq(usersTable.role_id, rolesTable.id))
      .execute();

    return results.map(result => ({
      id: result.users.id,
      username: result.users.username,
      hashed_password: result.users.hashed_password,
      role_id: result.users.role_id,
      created_at: result.users.created_at,
      updated_at: result.users.updated_at,
      role: {
        ...result.roles,
        permissions: result.roles.permissions as Record<string, boolean>
      }
    }));
  } catch (error) {
    console.error('Failed to fetch users:', error);
    throw error;
  }
}

export async function getUserById(id: number): Promise<UserWithRole | null> {
  try {
    const results = await db.select()
      .from(usersTable)
      .innerJoin(rolesTable, eq(usersTable.role_id, rolesTable.id))
      .where(eq(usersTable.id, id))
      .execute();

    if (results.length === 0) {
      return null;
    }

    const result = results[0];
    return {
      id: result.users.id,
      username: result.users.username,
      hashed_password: result.users.hashed_password,
      role_id: result.users.role_id,
      created_at: result.users.created_at,
      updated_at: result.users.updated_at,
      role: {
        ...result.roles,
        permissions: result.roles.permissions as Record<string, boolean>
      }
    };
  } catch (error) {
    console.error('Failed to fetch user by ID:', error);
    throw error;
  }
}

export async function getUserByUsername(username: string): Promise<UserWithRole | null> {
  try {
    const results = await db.select()
      .from(usersTable)
      .innerJoin(rolesTable, eq(usersTable.role_id, rolesTable.id))
      .where(eq(usersTable.username, username))
      .execute();

    if (results.length === 0) {
      return null;
    }

    const result = results[0];
    return {
      id: result.users.id,
      username: result.users.username,
      hashed_password: result.users.hashed_password,
      role_id: result.users.role_id,
      created_at: result.users.created_at,
      updated_at: result.users.updated_at,
      role: {
        ...result.roles,
        permissions: result.roles.permissions as Record<string, boolean>
      }
    };
  } catch (error) {
    console.error('Failed to fetch user by username:', error);
    throw error;
  }
}

export async function updateUser(input: UpdateUserInput): Promise<UserWithRole> {
  try {
    // Check if user exists
    const existingUser = await getUserById(input.id);
    if (!existingUser) {
      throw new Error(`User with id ${input.id} not found`);
    }

    // If role is being updated, verify it exists
    if (input.role_id !== undefined) {
      const role = await db.select()
        .from(rolesTable)
        .where(eq(rolesTable.id, input.role_id))
        .execute();

      if (role.length === 0) {
        throw new Error(`Role with id ${input.role_id} not found`);
      }
    }

    // Build update values
    const updateValues: any = {
      updated_at: new Date()
    };

    if (input.username !== undefined) {
      updateValues.username = input.username;
    }

    if (input.password !== undefined) {
      updateValues.hashed_password = hashPassword(input.password);
    }

    if (input.role_id !== undefined) {
      updateValues.role_id = input.role_id;
    }

    // Update the user
    const userResult = await db.update(usersTable)
      .set(updateValues)
      .where(eq(usersTable.id, input.id))
      .returning()
      .execute();

    const updatedUser = userResult[0];

    // Fetch the updated user with role details
    const userWithRole = await getUserById(updatedUser.id);
    if (!userWithRole) {
      throw new Error('Failed to fetch updated user');
    }

    return userWithRole;
  } catch (error) {
    console.error('User update failed:', error);
    throw error;
  }
}

export async function deleteUser(id: number): Promise<void> {
  try {
    // Check if user exists
    const existingUser = await getUserById(id);
    if (!existingUser) {
      throw new Error(`User with id ${id} not found`);
    }

    // Delete the user
    await db.delete(usersTable)
      .where(eq(usersTable.id, id))
      .execute();
  } catch (error) {
    console.error('User deletion failed:', error);
    throw error;
  }
}