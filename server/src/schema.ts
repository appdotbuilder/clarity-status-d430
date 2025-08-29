import { z } from 'zod';

// Enums for various status types
export const componentStatusEnum = z.enum([
  'operational',
  'degraded',
  'partial_outage',
  'major_outage',
  'under_maintenance'
]);

export const incidentStatusEnum = z.enum([
  'investigating',
  'identified',
  'monitoring',
  'resolved'
]);

export const incidentImpactEnum = z.enum([
  'none',
  'minor',
  'major',
  'critical'
]);

export const maintenanceStatusEnum = z.enum([
  'scheduled',
  'in_progress',
  'completed'
]);

// Role schema
export const roleSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  permissions: z.record(z.boolean()), // JSON object with permission keys and boolean values
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Role = z.infer<typeof roleSchema>;

export const createRoleInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable(),
  permissions: z.record(z.boolean())
});

export type CreateRoleInput = z.infer<typeof createRoleInputSchema>;

export const updateRoleInputSchema = z.object({
  id: z.number(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  permissions: z.record(z.boolean()).optional()
});

export type UpdateRoleInput = z.infer<typeof updateRoleInputSchema>;

// User schema
export const userSchema = z.object({
  id: z.number(),
  username: z.string(),
  hashed_password: z.string(),
  role_id: z.number(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type User = z.infer<typeof userSchema>;

export const createUserInputSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(6),
  role_id: z.number()
});

export type CreateUserInput = z.infer<typeof createUserInputSchema>;

export const updateUserInputSchema = z.object({
  id: z.number(),
  username: z.string().min(1).optional(),
  password: z.string().min(6).optional(),
  role_id: z.number().optional()
});

export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;

// Component Group schema
export const componentGroupSchema = z.object({
  id: z.number(),
  name: z.string(),
  display_order: z.number().int(),
  collapsed_by_default: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type ComponentGroup = z.infer<typeof componentGroupSchema>;

export const createComponentGroupInputSchema = z.object({
  name: z.string().min(1),
  display_order: z.number().int().optional(),
  collapsed_by_default: z.boolean().default(false)
});

export type CreateComponentGroupInput = z.infer<typeof createComponentGroupInputSchema>;

export const updateComponentGroupInputSchema = z.object({
  id: z.number(),
  name: z.string().min(1).optional(),
  display_order: z.number().int().optional(),
  collapsed_by_default: z.boolean().optional()
});

export type UpdateComponentGroupInput = z.infer<typeof updateComponentGroupInputSchema>;

// Component schema
export const componentSchema = z.object({
  id: z.number(),
  name: z.string(),
  status: componentStatusEnum,
  display_order: z.number().int(),
  group_id: z.number(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Component = z.infer<typeof componentSchema>;

export const createComponentInputSchema = z.object({
  name: z.string().min(1),
  status: componentStatusEnum.default('operational'),
  display_order: z.number().int().optional(),
  group_id: z.number()
});

export type CreateComponentInput = z.infer<typeof createComponentInputSchema>;

export const updateComponentInputSchema = z.object({
  id: z.number(),
  name: z.string().min(1).optional(),
  status: componentStatusEnum.optional(),
  display_order: z.number().int().optional(),
  group_id: z.number().optional()
});

export type UpdateComponentInput = z.infer<typeof updateComponentInputSchema>;

// Incident schema
export const incidentSchema = z.object({
  id: z.number(),
  title: z.string(),
  created_at: z.coerce.date(),
  resolved_at: z.coerce.date().nullable(),
  status: incidentStatusEnum,
  impact: incidentImpactEnum,
  impact_description: z.string().nullable(),
  root_cause: z.string().nullable(),
  updated_at: z.coerce.date()
});

export type Incident = z.infer<typeof incidentSchema>;

export const createIncidentInputSchema = z.object({
  title: z.string().min(1),
  status: incidentStatusEnum.default('investigating'),
  impact: incidentImpactEnum,
  impact_description: z.string().nullable(),
  root_cause: z.string().nullable().optional(),
  affected_component_ids: z.array(z.number()),
  initial_update_message: z.string()
});

export type CreateIncidentInput = z.infer<typeof createIncidentInputSchema>;

export const updateIncidentInputSchema = z.object({
  id: z.number(),
  title: z.string().min(1).optional(),
  status: incidentStatusEnum.optional(),
  impact: incidentImpactEnum.optional(),
  impact_description: z.string().nullable().optional(),
  root_cause: z.string().nullable().optional(),
  resolved_at: z.coerce.date().nullable().optional()
});

export type UpdateIncidentInput = z.infer<typeof updateIncidentInputSchema>;

// Incident Update schema
export const incidentUpdateSchema = z.object({
  id: z.number(),
  message: z.string(),
  status: incidentStatusEnum,
  timestamp: z.coerce.date(),
  incident_id: z.number(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type IncidentUpdate = z.infer<typeof incidentUpdateSchema>;

export const createIncidentUpdateInputSchema = z.object({
  message: z.string().min(1),
  status: incidentStatusEnum,
  timestamp: z.coerce.date().optional(),
  incident_id: z.number()
});

export type CreateIncidentUpdateInput = z.infer<typeof createIncidentUpdateInputSchema>;

export const updateIncidentUpdateInputSchema = z.object({
  id: z.number(),
  message: z.string().min(1).optional(),
  status: incidentStatusEnum.optional(),
  timestamp: z.coerce.date().optional()
});

export type UpdateIncidentUpdateInput = z.infer<typeof updateIncidentUpdateInputSchema>;

// Maintenance Window schema
export const maintenanceWindowSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  start_time: z.coerce.date(),
  end_time: z.coerce.date(),
  status: maintenanceStatusEnum,
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type MaintenanceWindow = z.infer<typeof maintenanceWindowSchema>;

export const createMaintenanceWindowInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable(),
  start_time: z.coerce.date(),
  end_time: z.coerce.date(),
  status: maintenanceStatusEnum.default('scheduled'),
  affected_component_ids: z.array(z.number())
});

export type CreateMaintenanceWindowInput = z.infer<typeof createMaintenanceWindowInputSchema>;

export const updateMaintenanceWindowInputSchema = z.object({
  id: z.number(),
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  start_time: z.coerce.date().optional(),
  end_time: z.coerce.date().optional(),
  status: maintenanceStatusEnum.optional()
});

export type UpdateMaintenanceWindowInput = z.infer<typeof updateMaintenanceWindowInputSchema>;

// Maintenance Update schema
export const maintenanceUpdateSchema = z.object({
  id: z.number(),
  message: z.string(),
  timestamp: z.coerce.date(),
  maintenance_id: z.number(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type MaintenanceUpdate = z.infer<typeof maintenanceUpdateSchema>;

export const createMaintenanceUpdateInputSchema = z.object({
  message: z.string().min(1),
  timestamp: z.coerce.date().optional(),
  maintenance_id: z.number()
});

export type CreateMaintenanceUpdateInput = z.infer<typeof createMaintenanceUpdateInputSchema>;

export const updateMaintenanceUpdateInputSchema = z.object({
  id: z.number(),
  message: z.string().min(1).optional(),
  timestamp: z.coerce.date().optional()
});

export type UpdateMaintenanceUpdateInput = z.infer<typeof updateMaintenanceUpdateInputSchema>;

// Audit Log schema
export const auditLogSchema = z.object({
  id: z.number(),
  timestamp: z.coerce.date(),
  username: z.string(),
  action: z.string(),
  details: z.string().nullable(),
  created_at: z.coerce.date()
});

export type AuditLog = z.infer<typeof auditLogSchema>;

export const createAuditLogInputSchema = z.object({
  username: z.string(),
  action: z.string(),
  details: z.string().nullable()
});

export type CreateAuditLogInput = z.infer<typeof createAuditLogInputSchema>;

// Automation schema
export const automationSchema = z.object({
  id: z.number(),
  name: z.string(),
  new_status: componentStatusEnum,
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Automation = z.infer<typeof automationSchema>;

export const createAutomationInputSchema = z.object({
  name: z.string().min(1),
  new_status: componentStatusEnum,
  target_component_ids: z.array(z.number())
});

export type CreateAutomationInput = z.infer<typeof createAutomationInputSchema>;

export const updateAutomationInputSchema = z.object({
  id: z.number(),
  name: z.string().min(1).optional(),
  new_status: componentStatusEnum.optional()
});

export type UpdateAutomationInput = z.infer<typeof updateAutomationInputSchema>;

// Site Settings schema
export const siteSettingSchema = z.object({
  id: z.number(),
  key: z.string(),
  value: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type SiteSetting = z.infer<typeof siteSettingSchema>;

export const updateSiteSettingInputSchema = z.object({
  key: z.string(),
  value: z.string().nullable()
});

export type UpdateSiteSettingInput = z.infer<typeof updateSiteSettingInputSchema>;

// Combined schemas for complex operations
export const incidentWithDetailsSchema = incidentSchema.extend({
  updates: z.array(incidentUpdateSchema),
  affected_components: z.array(componentSchema)
});

export type IncidentWithDetails = z.infer<typeof incidentWithDetailsSchema>;

export const maintenanceWithDetailsSchema = maintenanceWindowSchema.extend({
  updates: z.array(maintenanceUpdateSchema),
  affected_components: z.array(componentSchema)
});

export type MaintenanceWithDetails = z.infer<typeof maintenanceWithDetailsSchema>;

export const componentGroupWithComponentsSchema = componentGroupSchema.extend({
  components: z.array(componentSchema)
});

export type ComponentGroupWithComponents = z.infer<typeof componentGroupWithComponentsSchema>;

export const userWithRoleSchema = userSchema.extend({
  role: roleSchema
});

export type UserWithRole = z.infer<typeof userWithRoleSchema>;

// Public status page response schema
export const publicStatusSchema = z.object({
  overall_status: componentStatusEnum,
  component_groups: z.array(componentGroupWithComponentsSchema),
  active_incidents: z.array(incidentWithDetailsSchema),
  recent_incidents: z.array(incidentWithDetailsSchema),
  active_maintenance: z.array(maintenanceWithDetailsSchema),
  upcoming_maintenance: z.array(maintenanceWithDetailsSchema)
});

export type PublicStatus = z.infer<typeof publicStatusSchema>;

// Authentication schemas
export const loginInputSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

export type LoginInput = z.infer<typeof loginInputSchema>;

export const authResponseSchema = z.object({
  user: userWithRoleSchema,
  token: z.string()
});

export type AuthResponse = z.infer<typeof authResponseSchema>;

// Execute automation schema
export const executeAutomationInputSchema = z.object({
  automation_id: z.number()
});

export type ExecuteAutomationInput = z.infer<typeof executeAutomationInputSchema>;