import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, rolesTable } from '../db/schema';
import { type LoginInput } from '../schema';
import { login, verifyToken, checkPermission, createHashedPassword } from '../handlers/auth';

// Test data
const testRole = {
  name: 'Test Admin',
  description: 'Test administrator role',
  permissions: { all: true, manage_users: true, view_dashboard: true }
};

const testLimitedRole = {
  name: 'Limited User',
  description: 'User with limited permissions',
  permissions: { view_dashboard: true, manage_incidents: false }
};

const testPassword = 'testpassword123';
let hashedPassword: string;

describe('auth handlers', () => {
  beforeEach(async () => {
    await createDB();
    
    // Hash password for test users
    hashedPassword = createHashedPassword(testPassword);

    // Create test roles
    const roleResults = await db.insert(rolesTable)
      .values([testRole, testLimitedRole])
      .returning()
      .execute();

    const adminRole = roleResults[0];
    const limitedRole = roleResults[1];

    // Create test users
    await db.insert(usersTable)
      .values([
        {
          username: 'testadmin',
          hashed_password: hashedPassword,
          role_id: adminRole.id
        },
        {
          username: 'limiteduser',
          hashed_password: hashedPassword,
          role_id: limitedRole.id
        }
      ])
      .execute();
  });
  
  afterEach(resetDB);

  describe('login', () => {
    it('should authenticate valid user and return token', async () => {
      const input: LoginInput = {
        username: 'testadmin',
        password: testPassword
      };

      const result = await login(input);

      // Verify user data
      expect(result.user.username).toEqual('testadmin');
      expect(result.user.role.name).toEqual('Test Admin');
      expect(result.user.role.permissions['all']).toBe(true);
      expect(result.user.id).toBeDefined();
      expect(result.user.created_at).toBeInstanceOf(Date);

      // Verify token is present and properly formatted
      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe('string');
      expect(result.token.split('.').length).toBe(3); // JWT-like format
    });

    it('should reject invalid username', async () => {
      const input: LoginInput = {
        username: 'nonexistent',
        password: testPassword
      };

      await expect(login(input)).rejects.toThrow(/Invalid username or password/i);
    });

    it('should reject invalid password', async () => {
      const input: LoginInput = {
        username: 'testadmin',
        password: 'wrongpassword'
      };

      await expect(login(input)).rejects.toThrow(/Invalid username or password/i);
    });

    it('should authenticate limited user with correct permissions', async () => {
      const input: LoginInput = {
        username: 'limiteduser',
        password: testPassword
      };

      const result = await login(input);

      expect(result.user.username).toEqual('limiteduser');
      expect(result.user.role.name).toEqual('Limited User');
      expect(result.user.role.permissions['view_dashboard']).toBe(true);
      expect(result.user.role.permissions['manage_incidents']).toBe(false);
      expect(result.user.role.permissions['all']).toBeUndefined();
    });
  });

  describe('verifyToken', () => {
    it('should verify valid token and return user with role', async () => {
      // First login to get a token
      const loginResult = await login({
        username: 'testadmin',
        password: testPassword
      });

      // Verify the token
      const user = await verifyToken(loginResult.token);

      expect(user).not.toBeNull();
      expect(user!.username).toEqual('testadmin');
      expect(user!.role.name).toEqual('Test Admin');
      expect(user!.role.permissions['all']).toBe(true);
      expect(user!.id).toBeDefined();
    });

    it('should return null for invalid token', async () => {
      const user = await verifyToken('invalid.jwt.token');
      expect(user).toBeNull();
    });

    it('should return null for malformed token', async () => {
      const user = await verifyToken('malformed_token');
      expect(user).toBeNull();
    });

    it('should return null for token with non-existent user', async () => {
      // Create a token-like string that would decode to invalid user ID
      const fakeToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOjk5OTk5LCJ1c2VybmFtZSI6ImZha2UiLCJyb2xlSWQiOjF9.invalid';
      
      const user = await verifyToken(fakeToken);
      expect(user).toBeNull();
    });
  });

  describe('checkPermission', () => {
    let adminUserId: number;
    let limitedUserId: number;

    beforeEach(async () => {
      // Get user IDs for testing
      const users = await db.select()
        .from(usersTable)
        .execute();
      
      adminUserId = users.find(u => u.username === 'testadmin')!.id;
      limitedUserId = users.find(u => u.username === 'limiteduser')!.id;
    });

    it('should return true for admin user with all permissions', async () => {
      const hasPermission = await checkPermission(adminUserId, 'manage_users');
      expect(hasPermission).toBe(true);
    });

    it('should return true for specific permission user has', async () => {
      const hasPermission = await checkPermission(limitedUserId, 'view_dashboard');
      expect(hasPermission).toBe(true);
    });

    it('should return false for permission user does not have', async () => {
      const hasPermission = await checkPermission(limitedUserId, 'manage_users');
      expect(hasPermission).toBe(false);
    });

    it('should return false for non-existent user', async () => {
      const hasPermission = await checkPermission(99999, 'view_dashboard');
      expect(hasPermission).toBe(false);
    });

    it('should return true for admin user with any permission due to all access', async () => {
      const hasPermission = await checkPermission(adminUserId, 'any_random_permission');
      expect(hasPermission).toBe(true);
    });

    it('should handle explicit false permissions correctly', async () => {
      const hasPermission = await checkPermission(limitedUserId, 'manage_incidents');
      expect(hasPermission).toBe(false);
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete auth flow', async () => {
      // Login
      const loginResult = await login({
        username: 'testadmin',
        password: testPassword
      });

      // Verify token
      const user = await verifyToken(loginResult.token);
      expect(user).not.toBeNull();

      // Check permissions
      const hasPermission = await checkPermission(user!.id, 'manage_users');
      expect(hasPermission).toBe(true);
    });

    it('should handle auth flow with limited user', async () => {
      // Login with limited user
      const loginResult = await login({
        username: 'limiteduser',
        password: testPassword
      });

      // Verify token
      const user = await verifyToken(loginResult.token);
      expect(user).not.toBeNull();
      expect(user!.role.name).toEqual('Limited User');

      // Check allowed permission
      const hasAllowedPermission = await checkPermission(user!.id, 'view_dashboard');
      expect(hasAllowedPermission).toBe(true);

      // Check denied permission
      const hasDeniedPermission = await checkPermission(user!.id, 'manage_users');
      expect(hasDeniedPermission).toBe(false);
    });

    it('should maintain token validity for subsequent operations', async () => {
      const loginResult = await login({
        username: 'testadmin',
        password: testPassword
      });

      // Use token multiple times
      const user1 = await verifyToken(loginResult.token);
      const user2 = await verifyToken(loginResult.token);
      
      expect(user1).not.toBeNull();
      expect(user2).not.toBeNull();
      expect(user1!.id).toEqual(user2!.id);
      expect(user1!.username).toEqual(user2!.username);
    });
  });

  describe('password hashing', () => {
    it('should create different hashes for same password', async () => {
      const hash1 = createHashedPassword('testpassword');
      const hash2 = createHashedPassword('testpassword');
      
      // Should be different due to salt
      expect(hash1).not.toEqual(hash2);
      
      // But both should contain salt and hash parts
      expect(hash1.split(':').length).toBe(2);
      expect(hash2.split(':').length).toBe(2);
    });

    it('should verify passwords correctly with different salts', async () => {
      const password = 'mypassword123';
      const hash = createHashedPassword(password);
      
      // Create user with this hash
      const roleResult = await db.insert(rolesTable)
        .values({ name: 'Test', description: null, permissions: {} })
        .returning()
        .execute();

      await db.insert(usersTable)
        .values({
          username: 'hashtest',
          hashed_password: hash,
          role_id: roleResult[0].id
        })
        .execute();

      // Should be able to login with correct password
      const loginResult = await login({
        username: 'hashtest',
        password: password
      });

      expect(loginResult.user.username).toEqual('hashtest');
    });
  });
});