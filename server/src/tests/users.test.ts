import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, rolesTable } from '../db/schema';
import { type CreateUserInput, type UpdateUserInput } from '../schema';
import { 
  createUser, 
  getUsers, 
  getUserById, 
  getUserByUsername, 
  updateUser, 
  deleteUser 
} from '../handlers/users';
import { eq } from 'drizzle-orm';

// Test role for user creation
const testRole = {
  name: 'Test Role',
  description: 'A role for testing',
  permissions: { read: true, write: false, admin: false }
};

// Test user input
const testUserInput: CreateUserInput = {
  username: 'testuser',
  password: 'password123',
  role_id: 1 // Will be set after role creation
};

describe('Users Handler', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('createUser', () => {
    it('should create a user with hashed password', async () => {
      // Create a test role first
      const roleResult = await db.insert(rolesTable)
        .values(testRole)
        .returning()
        .execute();
      
      const role = roleResult[0];
      testUserInput.role_id = role.id;

      const result = await createUser(testUserInput);

      expect(result.id).toBeDefined();
      expect(result.username).toEqual('testuser');
      expect(result.hashed_password).toBeDefined();
      expect(result.hashed_password).not.toEqual('password123'); // Should be hashed
      expect(result.role_id).toEqual(role.id);
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
      expect(result.role.id).toEqual(role.id);
      expect(result.role.name).toEqual('Test Role');
    });

    it('should save user to database', async () => {
      // Create a test role first
      const roleResult = await db.insert(rolesTable)
        .values(testRole)
        .returning()
        .execute();
      
      const role = roleResult[0];
      testUserInput.role_id = role.id;

      const result = await createUser(testUserInput);

      // Verify user was saved to database
      const users = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, result.id))
        .execute();

      expect(users).toHaveLength(1);
      expect(users[0].username).toEqual('testuser');
      expect(users[0].role_id).toEqual(role.id);
    });

    it('should reject creation with non-existent role', async () => {
      const invalidInput = {
        ...testUserInput,
        role_id: 999 // Non-existent role
      };

      await expect(createUser(invalidInput)).rejects.toThrow(/Role with id 999 not found/i);
    });

    it('should reject duplicate usernames', async () => {
      // Create a test role first
      const roleResult = await db.insert(rolesTable)
        .values(testRole)
        .returning()
        .execute();
      
      const role = roleResult[0];
      testUserInput.role_id = role.id;

      // Create first user
      await createUser(testUserInput);

      // Try to create another user with same username
      await expect(createUser(testUserInput)).rejects.toThrow();
    });
  });

  describe('getUsers', () => {
    it('should return empty array when no users exist', async () => {
      const result = await getUsers();
      expect(result).toHaveLength(0);
    });

    it('should return all users with their roles', async () => {
      // Create test role
      const roleResult = await db.insert(rolesTable)
        .values(testRole)
        .returning()
        .execute();
      
      const role = roleResult[0];

      // Create multiple users
      const user1Input = { ...testUserInput, username: 'user1', role_id: role.id };
      const user2Input = { ...testUserInput, username: 'user2', role_id: role.id };

      await createUser(user1Input);
      await createUser(user2Input);

      const result = await getUsers();

      expect(result).toHaveLength(2);
      expect(result[0].username).toEqual('user1');
      expect(result[1].username).toEqual('user2');
      expect(result[0].role.name).toEqual('Test Role');
      expect(result[1].role.name).toEqual('Test Role');
    });
  });

  describe('getUserById', () => {
    it('should return null for non-existent user', async () => {
      const result = await getUserById(999);
      expect(result).toBeNull();
    });

    it('should return user with role for existing user', async () => {
      // Create test role and user
      const roleResult = await db.insert(rolesTable)
        .values(testRole)
        .returning()
        .execute();
      
      const role = roleResult[0];
      testUserInput.role_id = role.id;
      
      const user = await createUser(testUserInput);
      const result = await getUserById(user.id);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(user.id);
      expect(result!.username).toEqual('testuser');
      expect(result!.role.name).toEqual('Test Role');
    });
  });

  describe('getUserByUsername', () => {
    it('should return null for non-existent username', async () => {
      const result = await getUserByUsername('nonexistent');
      expect(result).toBeNull();
    });

    it('should return user with role for existing username', async () => {
      // Create test role and user
      const roleResult = await db.insert(rolesTable)
        .values(testRole)
        .returning()
        .execute();
      
      const role = roleResult[0];
      testUserInput.role_id = role.id;
      
      const user = await createUser(testUserInput);
      const result = await getUserByUsername('testuser');

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(user.id);
      expect(result!.username).toEqual('testuser');
      expect(result!.role.name).toEqual('Test Role');
    });
  });

  describe('updateUser', () => {
    it('should update username', async () => {
      // Create test role and user
      const roleResult = await db.insert(rolesTable)
        .values(testRole)
        .returning()
        .execute();
      
      const role = roleResult[0];
      testUserInput.role_id = role.id;
      
      const user = await createUser(testUserInput);
      
      const updateInput: UpdateUserInput = {
        id: user.id,
        username: 'updateduser'
      };

      const result = await updateUser(updateInput);

      expect(result.id).toEqual(user.id);
      expect(result.username).toEqual('updateduser');
      expect(result.role_id).toEqual(role.id); // Should remain unchanged
    });

    it('should update password (hash it)', async () => {
      // Create test role and user
      const roleResult = await db.insert(rolesTable)
        .values(testRole)
        .returning()
        .execute();
      
      const role = roleResult[0];
      testUserInput.role_id = role.id;
      
      const user = await createUser(testUserInput);
      const originalHash = user.hashed_password;
      
      const updateInput: UpdateUserInput = {
        id: user.id,
        password: 'newpassword123'
      };

      const result = await updateUser(updateInput);

      expect(result.hashed_password).not.toEqual(originalHash);
      expect(result.hashed_password).not.toEqual('newpassword123'); // Should be hashed
    });

    it('should update role', async () => {
      // Create two test roles
      const role1Result = await db.insert(rolesTable)
        .values(testRole)
        .returning()
        .execute();
      
      const role2Result = await db.insert(rolesTable)
        .values({
          name: 'Another Role',
          description: 'Another role for testing',
          permissions: { read: true, write: true, admin: true }
        })
        .returning()
        .execute();
      
      const role1 = role1Result[0];
      const role2 = role2Result[0];
      testUserInput.role_id = role1.id;
      
      const user = await createUser(testUserInput);
      
      const updateInput: UpdateUserInput = {
        id: user.id,
        role_id: role2.id
      };

      const result = await updateUser(updateInput);

      expect(result.role_id).toEqual(role2.id);
      expect(result.role.name).toEqual('Another Role');
    });

    it('should reject update for non-existent user', async () => {
      const updateInput: UpdateUserInput = {
        id: 999,
        username: 'updateduser'
      };

      await expect(updateUser(updateInput)).rejects.toThrow(/User with id 999 not found/i);
    });

    it('should reject update with non-existent role', async () => {
      // Create test role and user
      const roleResult = await db.insert(rolesTable)
        .values(testRole)
        .returning()
        .execute();
      
      const role = roleResult[0];
      testUserInput.role_id = role.id;
      
      const user = await createUser(testUserInput);
      
      const updateInput: UpdateUserInput = {
        id: user.id,
        role_id: 999 // Non-existent role
      };

      await expect(updateUser(updateInput)).rejects.toThrow(/Role with id 999 not found/i);
    });
  });

  describe('deleteUser', () => {
    it('should delete existing user', async () => {
      // Create test role and user
      const roleResult = await db.insert(rolesTable)
        .values(testRole)
        .returning()
        .execute();
      
      const role = roleResult[0];
      testUserInput.role_id = role.id;
      
      const user = await createUser(testUserInput);

      // Delete the user
      await deleteUser(user.id);

      // Verify user is deleted
      const result = await getUserById(user.id);
      expect(result).toBeNull();
    });

    it('should reject deletion of non-existent user', async () => {
      await expect(deleteUser(999)).rejects.toThrow(/User with id 999 not found/i);
    });

    it('should remove user from database', async () => {
      // Create test role and user
      const roleResult = await db.insert(rolesTable)
        .values(testRole)
        .returning()
        .execute();
      
      const role = roleResult[0];
      testUserInput.role_id = role.id;
      
      const user = await createUser(testUserInput);

      // Delete the user
      await deleteUser(user.id);

      // Verify user is removed from database
      const users = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, user.id))
        .execute();

      expect(users).toHaveLength(0);
    });
  });

  describe('password hashing', () => {
    it('should hash passwords consistently', async () => {
      // Create test role
      const roleResult = await db.insert(rolesTable)
        .values(testRole)
        .returning()
        .execute();
      
      const role = roleResult[0];

      // Create two users with same password
      const user1Input = { ...testUserInput, username: 'user1', role_id: role.id };
      const user2Input = { ...testUserInput, username: 'user2', role_id: role.id };

      const user1 = await createUser(user1Input);
      const user2 = await createUser(user2Input);

      // Same password should produce same hash
      expect(user1.hashed_password).toEqual(user2.hashed_password);
    });
  });
});