import { 
  serial, 
  text, 
  pgTable, 
  timestamp, 
  integer, 
  boolean,
  json,
  pgEnum,
  primaryKey,
  foreignKey
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const componentStatusEnum = pgEnum('component_status', [
  'operational',
  'degraded',
  'partial_outage',
  'major_outage',
  'under_maintenance'
]);

export const incidentStatusEnum = pgEnum('incident_status', [
  'investigating',
  'identified',
  'monitoring',
  'resolved'
]);

export const incidentImpactEnum = pgEnum('incident_impact', [
  'none',
  'minor',
  'major',
  'critical'
]);

export const maintenanceStatusEnum = pgEnum('maintenance_status', [
  'scheduled',
  'in_progress',
  'completed'
]);

// Roles table
export const rolesTable = pgTable('roles', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  permissions: json('permissions').notNull(), // JSON object with permissions
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Users table
export const usersTable = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  hashed_password: text('hashed_password').notNull(),
  role_id: integer('role_id').notNull().references(() => rolesTable.id),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Component groups table
export const componentGroupsTable = pgTable('component_groups', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  display_order: integer('display_order').notNull().default(0),
  collapsed_by_default: boolean('collapsed_by_default').notNull().default(false),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Components table
export const componentsTable = pgTable('components', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  status: componentStatusEnum('status').notNull().default('operational'),
  display_order: integer('display_order').notNull().default(0),
  group_id: integer('group_id').notNull().references(() => componentGroupsTable.id),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Incidents table
export const incidentsTable = pgTable('incidents', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  resolved_at: timestamp('resolved_at'),
  status: incidentStatusEnum('status').notNull().default('investigating'),
  impact: incidentImpactEnum('impact').notNull(),
  impact_description: text('impact_description'),
  root_cause: text('root_cause'),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Incident updates table
export const incidentUpdatesTable = pgTable('incident_updates', {
  id: serial('id').primaryKey(),
  message: text('message').notNull(),
  status: incidentStatusEnum('status').notNull(),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
  incident_id: integer('incident_id').notNull().references(() => incidentsTable.id, { onDelete: 'cascade' }),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Incident affected components pivot table
export const incidentAffectedComponentsTable = pgTable('incident_affected_components', {
  incident_id: integer('incident_id').notNull().references(() => incidentsTable.id, { onDelete: 'cascade' }),
  component_id: integer('component_id').notNull().references(() => componentsTable.id, { onDelete: 'cascade' })
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.incident_id, table.component_id] })
  };
});

// Maintenance windows table
export const maintenanceWindowsTable = pgTable('maintenance_windows', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  start_time: timestamp('start_time').notNull(),
  end_time: timestamp('end_time').notNull(),
  status: maintenanceStatusEnum('status').notNull().default('scheduled'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Maintenance updates table
export const maintenanceUpdatesTable = pgTable('maintenance_updates', {
  id: serial('id').primaryKey(),
  message: text('message').notNull(),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
  maintenance_id: integer('maintenance_id').notNull().references(() => maintenanceWindowsTable.id, { onDelete: 'cascade' }),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Maintenance affected components pivot table
export const maintenanceAffectedComponentsTable = pgTable('maintenance_affected_components', {
  maintenance_id: integer('maintenance_id').notNull().references(() => maintenanceWindowsTable.id, { onDelete: 'cascade' }),
  component_id: integer('component_id').notNull().references(() => componentsTable.id, { onDelete: 'cascade' })
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.maintenance_id, table.component_id] })
  };
});

// Audit logs table
export const auditLogsTable = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
  username: text('username').notNull(),
  action: text('action').notNull(),
  details: text('details'),
  created_at: timestamp('created_at').defaultNow().notNull()
});

// Automations table
export const automationsTable = pgTable('automations', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  new_status: componentStatusEnum('new_status').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Automation components pivot table
export const automationComponentsTable = pgTable('automation_components', {
  automation_id: integer('automation_id').notNull().references(() => automationsTable.id, { onDelete: 'cascade' }),
  component_id: integer('component_id').notNull().references(() => componentsTable.id, { onDelete: 'cascade' })
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.automation_id, table.component_id] })
  };
});

// Site settings table
export const siteSettingsTable = pgTable('site_settings', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  value: text('value'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Relations
export const rolesRelations = relations(rolesTable, ({ many }) => ({
  users: many(usersTable)
}));

export const usersRelations = relations(usersTable, ({ one }) => ({
  role: one(rolesTable, {
    fields: [usersTable.role_id],
    references: [rolesTable.id]
  })
}));

export const componentGroupsRelations = relations(componentGroupsTable, ({ many }) => ({
  components: many(componentsTable)
}));

export const componentsRelations = relations(componentsTable, ({ one, many }) => ({
  group: one(componentGroupsTable, {
    fields: [componentsTable.group_id],
    references: [componentGroupsTable.id]
  }),
  incidentAffectedComponents: many(incidentAffectedComponentsTable),
  maintenanceAffectedComponents: many(maintenanceAffectedComponentsTable),
  automationComponents: many(automationComponentsTable)
}));

export const incidentsRelations = relations(incidentsTable, ({ many }) => ({
  updates: many(incidentUpdatesTable),
  affectedComponents: many(incidentAffectedComponentsTable)
}));

export const incidentUpdatesRelations = relations(incidentUpdatesTable, ({ one }) => ({
  incident: one(incidentsTable, {
    fields: [incidentUpdatesTable.incident_id],
    references: [incidentsTable.id]
  })
}));

export const incidentAffectedComponentsRelations = relations(incidentAffectedComponentsTable, ({ one }) => ({
  incident: one(incidentsTable, {
    fields: [incidentAffectedComponentsTable.incident_id],
    references: [incidentsTable.id]
  }),
  component: one(componentsTable, {
    fields: [incidentAffectedComponentsTable.component_id],
    references: [componentsTable.id]
  })
}));

export const maintenanceWindowsRelations = relations(maintenanceWindowsTable, ({ many }) => ({
  updates: many(maintenanceUpdatesTable),
  affectedComponents: many(maintenanceAffectedComponentsTable)
}));

export const maintenanceUpdatesRelations = relations(maintenanceUpdatesTable, ({ one }) => ({
  maintenance: one(maintenanceWindowsTable, {
    fields: [maintenanceUpdatesTable.maintenance_id],
    references: [maintenanceWindowsTable.id]
  })
}));

export const maintenanceAffectedComponentsRelations = relations(maintenanceAffectedComponentsTable, ({ one }) => ({
  maintenance: one(maintenanceWindowsTable, {
    fields: [maintenanceAffectedComponentsTable.maintenance_id],
    references: [maintenanceWindowsTable.id]
  }),
  component: one(componentsTable, {
    fields: [maintenanceAffectedComponentsTable.component_id],
    references: [componentsTable.id]
  })
}));

export const automationsRelations = relations(automationsTable, ({ many }) => ({
  components: many(automationComponentsTable)
}));

export const automationComponentsRelations = relations(automationComponentsTable, ({ one }) => ({
  automation: one(automationsTable, {
    fields: [automationComponentsTable.automation_id],
    references: [automationsTable.id]
  }),
  component: one(componentsTable, {
    fields: [automationComponentsTable.component_id],
    references: [componentsTable.id]
  })
}));

// TypeScript types for the table schemas
export type Role = typeof rolesTable.$inferSelect;
export type NewRole = typeof rolesTable.$inferInsert;

export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;

export type ComponentGroup = typeof componentGroupsTable.$inferSelect;
export type NewComponentGroup = typeof componentGroupsTable.$inferInsert;

export type Component = typeof componentsTable.$inferSelect;
export type NewComponent = typeof componentsTable.$inferInsert;

export type Incident = typeof incidentsTable.$inferSelect;
export type NewIncident = typeof incidentsTable.$inferInsert;

export type IncidentUpdate = typeof incidentUpdatesTable.$inferSelect;
export type NewIncidentUpdate = typeof incidentUpdatesTable.$inferInsert;

export type MaintenanceWindow = typeof maintenanceWindowsTable.$inferSelect;
export type NewMaintenanceWindow = typeof maintenanceWindowsTable.$inferInsert;

export type MaintenanceUpdate = typeof maintenanceUpdatesTable.$inferSelect;
export type NewMaintenanceUpdate = typeof maintenanceUpdatesTable.$inferInsert;

export type AuditLog = typeof auditLogsTable.$inferSelect;
export type NewAuditLog = typeof auditLogsTable.$inferInsert;

export type Automation = typeof automationsTable.$inferSelect;
export type NewAutomation = typeof automationsTable.$inferInsert;

export type SiteSetting = typeof siteSettingsTable.$inferSelect;
export type NewSiteSetting = typeof siteSettingsTable.$inferInsert;

// Export all tables and relations for proper query building
export const tables = {
  roles: rolesTable,
  users: usersTable,
  componentGroups: componentGroupsTable,
  components: componentsTable,
  incidents: incidentsTable,
  incidentUpdates: incidentUpdatesTable,
  incidentAffectedComponents: incidentAffectedComponentsTable,
  maintenanceWindows: maintenanceWindowsTable,
  maintenanceUpdates: maintenanceUpdatesTable,
  maintenanceAffectedComponents: maintenanceAffectedComponentsTable,
  auditLogs: auditLogsTable,
  automations: automationsTable,
  automationComponents: automationComponentsTable,
  siteSettings: siteSettingsTable
};