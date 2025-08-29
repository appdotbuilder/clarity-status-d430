import { db } from '../db';
import { usersTable, rolesTable } from '../db/schema';
import { type LoginInput, type AuthResponse, type UserWithRole } from '../schema';
import { eq } from 'drizzle-orm';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';

const JWT_SECRET = process.env['JWT_SECRET'] || 'your-secret-key-here';
const JWT_EXPIRES_IN_HOURS = 24;

// Simple JWT-like token implementation using crypto
function createToken(payload: { userId: number; username: string; roleId: number }): string {
  const header = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'HS256' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (JWT_EXPIRES_IN_HOURS * 3600); // 24 hours from now
  
  const payloadWithExp = { ...payload, iat: now, exp };
  const payloadStr = Buffer.from(JSON.stringify(payloadWithExp)).toString('base64url');
  
  const signature = createHash('sha256')
    .update(`${header}.${payloadStr}`)
    .update(JWT_SECRET)
    .digest('base64url');
  
  return `${header}.${payloadStr}.${signature}`;
}

function verifyTokenSignature(token: string): { userId: number; username: string; roleId: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const [header, payload, signature] = parts;
    
    // Verify signature
    const expectedSignature = createHash('sha256')
      .update(`${header}.${payload}`)
      .update(JWT_SECRET)
      .digest('base64url');
    
    if (signature !== expectedSignature) return null;
    
    // Decode payload
    const payloadData = JSON.parse(Buffer.from(payload, 'base64url').toString());
    
    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payloadData.exp && now > payloadData.exp) return null;
    
    return {
      userId: payloadData.userId,
      username: payloadData.username,
      roleId: payloadData.roleId
    };
  } catch (error) {
    return null;
  }
}

// Simple password hashing using crypto
function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  if (!salt) {
    salt = randomBytes(16).toString('hex');
  }
  
  const hash = createHash('sha256')
    .update(password)
    .update(salt)
    .digest('hex');
  
  return { hash: `${salt}:${hash}`, salt };
}

function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, hash] = storedHash.split(':');
    if (!salt || !hash) return false;
    
    const { hash: newHash } = hashPassword(password, salt);
    const storedHashBuffer = Buffer.from(storedHash);
    const newHashBuffer = Buffer.from(newHash);
    
    if (storedHashBuffer.length !== newHashBuffer.length) return false;
    
    return timingSafeEqual(storedHashBuffer, newHashBuffer);
  } catch (error) {
    return false;
  }
}

export async function login(input: LoginInput): Promise<AuthResponse> {
  try {
    // Find user with role information
    const userResult = await db.select()
      .from(usersTable)
      .innerJoin(rolesTable, eq(usersTable.role_id, rolesTable.id))
      .where(eq(usersTable.username, input.username))
      .execute();

    if (userResult.length === 0) {
      throw new Error('Invalid username or password');
    }

    const userData = userResult[0];
    const user = userData.users;
    const role = userData.roles;

    // Verify password
    const isValidPassword = verifyPassword(input.password, user.hashed_password);
    if (!isValidPassword) {
      throw new Error('Invalid username or password');
    }

    // Create token
    const token = createToken({
      userId: user.id,
      username: user.username,
      roleId: user.role_id
    });

    // Return user with role information
    const userWithRole: UserWithRole = {
      id: user.id,
      username: user.username,
      hashed_password: user.hashed_password,
      role_id: user.role_id,
      created_at: user.created_at,
      updated_at: user.updated_at,
      role: {
        id: role.id,
        name: role.name,
        description: role.description,
        permissions: role.permissions as Record<string, boolean>,
        created_at: role.created_at,
        updated_at: role.updated_at
      }
    };

    return {
      user: userWithRole,
      token
    };
  } catch (error) {
    console.error('Login failed:', error);
    throw error;
  }
}

export async function verifyToken(token: string): Promise<UserWithRole | null> {
  try {
    // Verify token signature and get payload
    const decoded = verifyTokenSignature(token);
    if (!decoded) return null;

    // Fetch user with role information
    const userResult = await db.select()
      .from(usersTable)
      .innerJoin(rolesTable, eq(usersTable.role_id, rolesTable.id))
      .where(eq(usersTable.id, decoded.userId))
      .execute();

    if (userResult.length === 0) {
      return null;
    }

    const userData = userResult[0];
    const user = userData.users;
    const role = userData.roles;

    return {
      id: user.id,
      username: user.username,
      hashed_password: user.hashed_password,
      role_id: user.role_id,
      created_at: user.created_at,
      updated_at: user.updated_at,
      role: {
        id: role.id,
        name: role.name,
        description: role.description,
        permissions: role.permissions as Record<string, boolean>,
        created_at: role.created_at,
        updated_at: role.updated_at
      }
    };
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}

export async function checkPermission(userId: number, permission: string): Promise<boolean> {
  try {
    // Fetch user with role information
    const userResult = await db.select()
      .from(usersTable)
      .innerJoin(rolesTable, eq(usersTable.role_id, rolesTable.id))
      .where(eq(usersTable.id, userId))
      .execute();

    if (userResult.length === 0) {
      return false;
    }

    const role = userResult[0].roles;
    const permissions = role.permissions as Record<string, boolean>;

    // Check for specific permission or admin access
    return permissions[permission] === true || permissions['all'] === true;
  } catch (error) {
    console.error('Permission check failed:', error);
    return false;
  }
}

// Helper function for creating users with properly hashed passwords (used in tests)
export function createHashedPassword(password: string): string {
  return hashPassword(password).hash;
}