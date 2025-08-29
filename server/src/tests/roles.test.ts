import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { rolesTable, usersTable } from '../db/schema';
import { type CreateRoleInput, type UpdateRoleInput } from '../schema';
import { 
  createRole, 
  getRoles, 
  getRoleById, 
  updateRole, 
  deleteRole 
} from '../handlers/roles';
import { eq } from 'drizzle-orm';

// Test data
const testRoleInput: CreateRoleInput = {
  name: 'Test Admin',
  description: 'Administrator role for testing',
  permissions: {
    'manage_users': true,
    'manage_components': true,
    'view_reports': false
  }
};

const anotherRoleInput: CreateRoleInput = {
  name: 'Test Viewer',
  description: 'Viewer role for testing',
  permissions: {
    'manage_users': false,
    'manage_components': false,
    'view_reports': true
  }
};

describe('Role Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('createRole', () => {
    it('should create a role with all fields', async () => {
      const result = await createRole(testRoleInput);

      expect(result.name).toEqual('Test Admin');
      expect(result.description).toEqual('Administrator role for testing');
      expect(result.permissions).toEqual({
        'manage_users': true,
        'manage_components': true,
        'view_reports': false
      });
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should create a role with null description', async () => {
      const input: CreateRoleInput = {
        name: 'Test Role',
        description: null,
        permissions: { 'basic_access': true }
      };

      const result = await createRole(input);

      expect(result.name).toEqual('Test Role');
      expect(result.description).toBeNull();
      expect(result.permissions).toEqual({ 'basic_access': true });
    });

    it('should save role to database', async () => {
      const result = await createRole(testRoleInput);

      const roles = await db.select()
        .from(rolesTable)
        .where(eq(rolesTable.id, result.id))
        .execute();

      expect(roles).toHaveLength(1);
      expect(roles[0].name).toEqual('Test Admin');
      expect(roles[0].description).toEqual('Administrator role for testing');
      expect(roles[0].permissions).toEqual({
        'manage_users': true,
        'manage_components': true,
        'view_reports': false
      });
    });

    it('should enforce unique role names', async () => {
      await createRole(testRoleInput);

      expect(createRole(testRoleInput)).rejects.toThrow(/unique/i);
    });
  });

  describe('getRoles', () => {
    it('should return empty array when no roles exist', async () => {
      const result = await getRoles();

      expect(result).toEqual([]);
    });

    it('should return all roles', async () => {
      const role1 = await createRole(testRoleInput);
      const role2 = await createRole(anotherRoleInput);

      const result = await getRoles();

      expect(result).toHaveLength(2);
      expect(result.map(r => r.id)).toContain(role1.id);
      expect(result.map(r => r.id)).toContain(role2.id);
      expect(result.map(r => r.name)).toContain('Test Admin');
      expect(result.map(r => r.name)).toContain('Test Viewer');
    });

    it('should return roles with correct permissions structure', async () => {
      await createRole(testRoleInput);

      const result = await getRoles();

      expect(result[0].permissions).toEqual({
        'manage_users': true,
        'manage_components': true,
        'view_reports': false
      });
    });
  });

  describe('getRoleById', () => {
    it('should return null when role does not exist', async () => {
      const result = await getRoleById(999);

      expect(result).toBeNull();
    });

    it('should return role when it exists', async () => {
      const created = await createRole(testRoleInput);

      const result = await getRoleById(created.id);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(created.id);
      expect(result!.name).toEqual('Test Admin');
      expect(result!.description).toEqual('Administrator role for testing');
      expect(result!.permissions).toEqual({
        'manage_users': true,
        'manage_components': true,
        'view_reports': false
      });
    });
  });

  describe('updateRole', () => {
    it('should update all role fields', async () => {
      const created = await createRole(testRoleInput);

      const updateInput: UpdateRoleInput = {
        id: created.id,
        name: 'Updated Admin',
        description: 'Updated description',
        permissions: {
          'manage_users': false,
          'manage_components': true,
          'view_reports': true,
          'new_permission': true
        }
      };

      const result = await updateRole(updateInput);

      expect(result.id).toEqual(created.id);
      expect(result.name).toEqual('Updated Admin');
      expect(result.description).toEqual('Updated description');
      expect(result.permissions).toEqual({
        'manage_users': false,
        'manage_components': true,
        'view_reports': true,
        'new_permission': true
      });
      expect(result.updated_at).not.toEqual(created.updated_at);
    });

    it('should update only specified fields', async () => {
      const created = await createRole(testRoleInput);

      const updateInput: UpdateRoleInput = {
        id: created.id,
        name: 'Partially Updated'
      };

      const result = await updateRole(updateInput);

      expect(result.name).toEqual('Partially Updated');
      expect(result.description).toEqual(created.description); // Unchanged
      expect(result.permissions).toEqual(created.permissions); // Unchanged
    });

    it('should update description to null', async () => {
      const created = await createRole(testRoleInput);

      const updateInput: UpdateRoleInput = {
        id: created.id,
        description: null
      };

      const result = await updateRole(updateInput);

      expect(result.description).toBeNull();
      expect(result.name).toEqual(created.name); // Unchanged
    });

    it('should throw error when role does not exist', async () => {
      const updateInput: UpdateRoleInput = {
        id: 999,
        name: 'Non-existent'
      };

      expect(updateRole(updateInput)).rejects.toThrow(/not found/i);
    });

    it('should save updates to database', async () => {
      const created = await createRole(testRoleInput);

      const updateInput: UpdateRoleInput = {
        id: created.id,
        name: 'Database Updated'
      };

      await updateRole(updateInput);

      const roles = await db.select()
        .from(rolesTable)
        .where(eq(rolesTable.id, created.id))
        .execute();

      expect(roles[0].name).toEqual('Database Updated');
    });
  });

  describe('deleteRole', () => {
    it('should delete role successfully', async () => {
      const created = await createRole(testRoleInput);

      await deleteRole(created.id);

      const roles = await db.select()
        .from(rolesTable)
        .where(eq(rolesTable.id, created.id))
        .execute();

      expect(roles).toHaveLength(0);
    });

    it('should throw error when role does not exist', async () => {
      expect(deleteRole(999)).rejects.toThrow(/not found/i);
    });

    it('should prevent deletion when users are assigned to role', async () => {
      // Create a role
      const role = await createRole(testRoleInput);

      // Create a user assigned to this role
      await db.insert(usersTable)
        .values({
          username: 'testuser',
          hashed_password: 'hashed123',
          role_id: role.id
        })
        .execute();

      // Attempt to delete the role should fail
      expect(deleteRole(role.id)).rejects.toThrow(/cannot delete role.*users are assigned/i);
    });

    it('should allow deletion when no users are assigned', async () => {
      const role1 = await createRole(testRoleInput);
      const role2 = await createRole(anotherRoleInput);

      // Create a user assigned to role2 only
      await db.insert(usersTable)
        .values({
          username: 'testuser',
          hashed_password: 'hashed123',
          role_id: role2.id
        })
        .execute();

      // Should be able to delete role1 (no users assigned)
      await deleteRole(role1.id);

      const roles = await db.select()
        .from(rolesTable)
        .where(eq(rolesTable.id, role1.id))
        .execute();

      expect(roles).toHaveLength(0);

      // role2 should still exist
      const role2Check = await getRoleById(role2.id);
      expect(role2Check).not.toBeNull();
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complex permissions structure', async () => {
      const complexPermissions = {
        'user_create': true,
        'user_read': true,
        'user_update': false,
        'user_delete': false,
        'system_settings': true,
        'reports_daily': true,
        'reports_weekly': true,
        'reports_monthly': false,
        'feature_new_ui': true,
        'feature_beta': false
      };

      const input: CreateRoleInput = {
        name: 'Complex Role',
        description: 'Role with complex permissions',
        permissions: complexPermissions
      };

      const created = await createRole(input);
      const retrieved = await getRoleById(created.id);

      expect(retrieved!.permissions).toEqual(complexPermissions);
    });

    it('should maintain data integrity across operations', async () => {
      // Create multiple roles
      const role1 = await createRole(testRoleInput);
      const role2 = await createRole(anotherRoleInput);

      // Update one role
      await updateRole({
        id: role1.id,
        name: 'Modified Admin'
      });

      // Verify all roles are still correct
      const allRoles = await getRoles();
      expect(allRoles).toHaveLength(2);

      const updatedRole = allRoles.find(r => r.id === role1.id);
      const unchangedRole = allRoles.find(r => r.id === role2.id);

      expect(updatedRole!.name).toEqual('Modified Admin');
      expect(unchangedRole!.name).toEqual('Test Viewer');
      expect(unchangedRole!.permissions).toEqual(anotherRoleInput.permissions);
    });
  });
});