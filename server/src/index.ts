import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';
import { z } from 'zod';

// Import schemas
import { 
  loginInputSchema,
  createRoleInputSchema,
  updateRoleInputSchema,
  createUserInputSchema,
  updateUserInputSchema,
  createComponentGroupInputSchema,
  updateComponentGroupInputSchema,
  createComponentInputSchema,
  updateComponentInputSchema,
  createIncidentInputSchema,
  updateIncidentInputSchema,
  createIncidentUpdateInputSchema,
  updateIncidentUpdateInputSchema,
  createMaintenanceWindowInputSchema,
  updateMaintenanceWindowInputSchema,
  createMaintenanceUpdateInputSchema,
  updateMaintenanceUpdateInputSchema,
  createAutomationInputSchema,
  updateAutomationInputSchema,
  executeAutomationInputSchema,
  updateSiteSettingInputSchema,
  createAuditLogInputSchema
} from './schema';

// Import handlers
import { login, verifyToken, checkPermission } from './handlers/auth';
import { 
  createRole, 
  getRoles, 
  getRoleById, 
  updateRole, 
  deleteRole 
} from './handlers/roles';
import { 
  createUser, 
  getUsers, 
  getUserById, 
  getUserByUsername, 
  updateUser, 
  deleteUser 
} from './handlers/users';
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
} from './handlers/components';
import { 
  createIncident,
  getActiveIncidents,
  getRecentIncidents,
  getAllIncidents,
  getIncidentById,
  updateIncident,
  deleteIncident,
  createIncidentUpdate,
  getIncidentUpdates,
  updateIncidentUpdate,
  deleteIncidentUpdate,
  getIncidentHistory
} from './handlers/incidents';
import { 
  createMaintenanceWindow,
  getActiveMaintenanceWindows,
  getUpcomingMaintenanceWindows,
  getAllMaintenanceWindows,
  getMaintenanceWindowById,
  updateMaintenanceWindow,
  deleteMaintenanceWindow,
  createMaintenanceUpdate,
  getMaintenanceUpdates,
  updateMaintenanceUpdate,
  deleteMaintenanceUpdate,
  getRecentCompletedMaintenance
} from './handlers/maintenance';
import { 
  createAutomation,
  getAutomations,
  getAutomationById,
  updateAutomation,
  deleteAutomation,
  executeAutomation,
  addComponentsToAutomation,
  removeComponentsFromAutomation
} from './handlers/automations';
import { 
  createAuditLog,
  getAuditLogs,
  getAuditLogsByUser,
  getAuditLogsByAction,
  getAuditLogsByDateRange
} from './handlers/audit';
import { 
  getSiteSetting,
  getAllSiteSettings,
  updateSiteSetting,
  getMaintenanceMode,
  setMaintenanceMode,
  getMaintenanceModeMessage
} from './handlers/settings';
import { 
  getPublicStatus,
  getPublicIncidents,
  getPublicMaintenance,
  getPublicIncidentById,
  getPublicMaintenanceById
} from './handlers/public';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

const appRouter = router({
  // Health check
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),

  // Public endpoints (no authentication required)
  public: router({
    getStatus: publicProcedure.query(() => getPublicStatus()),
    getIncidents: publicProcedure.query(() => getPublicIncidents()),
    getMaintenance: publicProcedure.query(() => getPublicMaintenance()),
    getIncidentById: publicProcedure
      .input(z.number())
      .query(({ input }) => getPublicIncidentById(input)),
    getMaintenanceById: publicProcedure
      .input(z.number())
      .query(({ input }) => getPublicMaintenanceById(input)),
    getMaintenanceMode: publicProcedure.query(() => getMaintenanceMode()),
    getMaintenanceModeMessage: publicProcedure.query(() => getMaintenanceModeMessage())
  }),

  // Authentication
  auth: router({
    login: publicProcedure
      .input(loginInputSchema)
      .mutation(({ input }) => login(input)),
    verifyToken: publicProcedure
      .input(z.string())
      .query(({ input }) => verifyToken(input))
  }),

  // Role management
  roles: router({
    create: publicProcedure
      .input(createRoleInputSchema)
      .mutation(({ input }) => createRole(input)),
    getAll: publicProcedure.query(() => getRoles()),
    getById: publicProcedure
      .input(z.number())
      .query(({ input }) => getRoleById(input)),
    update: publicProcedure
      .input(updateRoleInputSchema)
      .mutation(({ input }) => updateRole(input)),
    delete: publicProcedure
      .input(z.number())
      .mutation(({ input }) => deleteRole(input))
  }),

  // User management
  users: router({
    create: publicProcedure
      .input(createUserInputSchema)
      .mutation(({ input }) => createUser(input)),
    getAll: publicProcedure.query(() => getUsers()),
    getById: publicProcedure
      .input(z.number())
      .query(({ input }) => getUserById(input)),
    getByUsername: publicProcedure
      .input(z.string())
      .query(({ input }) => getUserByUsername(input)),
    update: publicProcedure
      .input(updateUserInputSchema)
      .mutation(({ input }) => updateUser(input)),
    delete: publicProcedure
      .input(z.number())
      .mutation(({ input }) => deleteUser(input))
  }),

  // Component management
  components: router({
    // Component groups
    groups: router({
      create: publicProcedure
        .input(createComponentGroupInputSchema)
        .mutation(({ input }) => createComponentGroup(input)),
      getAll: publicProcedure.query(() => getComponentGroups()),
      getById: publicProcedure
        .input(z.number())
        .query(({ input }) => getComponentGroupById(input)),
      update: publicProcedure
        .input(updateComponentGroupInputSchema)
        .mutation(({ input }) => updateComponentGroup(input)),
      delete: publicProcedure
        .input(z.number())
        .mutation(({ input }) => deleteComponentGroup(input))
    }),
    
    // Individual components
    create: publicProcedure
      .input(createComponentInputSchema)
      .mutation(({ input }) => createComponent(input)),
    getAll: publicProcedure.query(() => getComponents()),
    getById: publicProcedure
      .input(z.number())
      .query(({ input }) => getComponentById(input)),
    update: publicProcedure
      .input(updateComponentInputSchema)
      .mutation(({ input }) => updateComponent(input)),
    delete: publicProcedure
      .input(z.number())
      .mutation(({ input }) => deleteComponent(input)),
    getOverallStatus: publicProcedure.query(() => getOverallStatus())
  }),

  // Incident management
  incidents: router({
    create: publicProcedure
      .input(createIncidentInputSchema)
      .mutation(({ input }) => createIncident(input)),
    getActive: publicProcedure.query(() => getActiveIncidents()),
    getRecent: publicProcedure
      .input(z.number().optional())
      .query(({ input }) => getRecentIncidents(input)),
    getAll: publicProcedure.query(() => getAllIncidents()),
    getById: publicProcedure
      .input(z.number())
      .query(({ input }) => getIncidentById(input)),
    update: publicProcedure
      .input(updateIncidentInputSchema)
      .mutation(({ input }) => updateIncident(input)),
    delete: publicProcedure
      .input(z.number())
      .mutation(({ input }) => deleteIncident(input)),
    getHistory: publicProcedure
      .input(z.object({ year: z.number().optional(), month: z.number().optional() }))
      .query(({ input }) => getIncidentHistory(input.year, input.month)),
    
    // Incident updates
    updates: router({
      create: publicProcedure
        .input(createIncidentUpdateInputSchema)
        .mutation(({ input }) => createIncidentUpdate(input)),
      getByIncident: publicProcedure
        .input(z.number())
        .query(({ input }) => getIncidentUpdates(input)),
      update: publicProcedure
        .input(updateIncidentUpdateInputSchema)
        .mutation(({ input }) => updateIncidentUpdate(input)),
      delete: publicProcedure
        .input(z.number())
        .mutation(({ input }) => deleteIncidentUpdate(input))
    })
  }),

  // Maintenance management
  maintenance: router({
    create: publicProcedure
      .input(createMaintenanceWindowInputSchema)
      .mutation(({ input }) => createMaintenanceWindow(input)),
    getActive: publicProcedure.query(() => getActiveMaintenanceWindows()),
    getUpcoming: publicProcedure.query(() => getUpcomingMaintenanceWindows()),
    getAll: publicProcedure.query(() => getAllMaintenanceWindows()),
    getById: publicProcedure
      .input(z.number())
      .query(({ input }) => getMaintenanceWindowById(input)),
    update: publicProcedure
      .input(updateMaintenanceWindowInputSchema)
      .mutation(({ input }) => updateMaintenanceWindow(input)),
    delete: publicProcedure
      .input(z.number())
      .mutation(({ input }) => deleteMaintenanceWindow(input)),
    getRecentCompleted: publicProcedure
      .input(z.number().optional())
      .query(({ input }) => getRecentCompletedMaintenance(input)),
    
    // Maintenance updates
    updates: router({
      create: publicProcedure
        .input(createMaintenanceUpdateInputSchema)
        .mutation(({ input }) => createMaintenanceUpdate(input)),
      getByMaintenance: publicProcedure
        .input(z.number())
        .query(({ input }) => getMaintenanceUpdates(input)),
      update: publicProcedure
        .input(updateMaintenanceUpdateInputSchema)
        .mutation(({ input }) => updateMaintenanceUpdate(input)),
      delete: publicProcedure
        .input(z.number())
        .mutation(({ input }) => deleteMaintenanceUpdate(input))
    })
  }),

  // Automation management
  automations: router({
    create: publicProcedure
      .input(createAutomationInputSchema)
      .mutation(({ input }) => createAutomation(input)),
    getAll: publicProcedure.query(() => getAutomations()),
    getById: publicProcedure
      .input(z.number())
      .query(({ input }) => getAutomationById(input)),
    update: publicProcedure
      .input(updateAutomationInputSchema)
      .mutation(({ input }) => updateAutomation(input)),
    delete: publicProcedure
      .input(z.number())
      .mutation(({ input }) => deleteAutomation(input)),
    execute: publicProcedure
      .input(executeAutomationInputSchema)
      .mutation(({ input }) => executeAutomation(input)),
    addComponents: publicProcedure
      .input(z.object({ automationId: z.number(), componentIds: z.array(z.number()) }))
      .mutation(({ input }) => addComponentsToAutomation(input.automationId, input.componentIds)),
    removeComponents: publicProcedure
      .input(z.object({ automationId: z.number(), componentIds: z.array(z.number()) }))
      .mutation(({ input }) => removeComponentsFromAutomation(input.automationId, input.componentIds))
  }),

  // Audit logs
  audit: router({
    create: publicProcedure
      .input(createAuditLogInputSchema)
      .mutation(({ input }) => createAuditLog(input)),
    getAll: publicProcedure
      .input(z.object({ limit: z.number().optional(), offset: z.number().optional() }))
      .query(({ input }) => getAuditLogs(input.limit, input.offset)),
    getByUser: publicProcedure
      .input(z.object({ username: z.string(), limit: z.number().optional() }))
      .query(({ input }) => getAuditLogsByUser(input.username, input.limit)),
    getByAction: publicProcedure
      .input(z.object({ action: z.string(), limit: z.number().optional() }))
      .query(({ input }) => getAuditLogsByAction(input.action, input.limit)),
    getByDateRange: publicProcedure
      .input(z.object({ startDate: z.coerce.date(), endDate: z.coerce.date() }))
      .query(({ input }) => getAuditLogsByDateRange(input.startDate, input.endDate))
  }),

  // Site settings
  settings: router({
    get: publicProcedure
      .input(z.string())
      .query(({ input }) => getSiteSetting(input)),
    getAll: publicProcedure.query(() => getAllSiteSettings()),
    update: publicProcedure
      .input(updateSiteSettingInputSchema)
      .mutation(({ input }) => updateSiteSetting(input)),
    setMaintenanceMode: publicProcedure
      .input(z.object({ enabled: z.boolean(), message: z.string().optional() }))
      .mutation(({ input }) => setMaintenanceMode(input.enabled, input.message))
  })
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors()(req, res, next);
    },
    router: appRouter,
    createContext() {
      return {};
    },
  });
  server.listen(port);
  console.log(`ClarityStatus TRPC server listening at port: ${port}`);
}

start();