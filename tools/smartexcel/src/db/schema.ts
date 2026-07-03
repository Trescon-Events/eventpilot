import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { Operation } from "@/lib/operations";

// Serializable JSON shape for untyped jsonb columns. Concrete (not `unknown`)
// so server-function return types pass TanStack Start's serialization check.
export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

/* ----------------------------------------------------------------------------
 * Enums
 * ------------------------------------------------------------------------- */

export const userStatusEnum = pgEnum("user_status", ["invited", "active", "disabled"]);
export const roleKeyEnum = pgEnum("role_key", ["super_admin", "admin", "standard"]);

// Job lifecycle states — mirrors PRD §9.
export const jobStatusEnum = pgEnum("job_status", [
  "draft",
  "clarifying",
  "plan_pending",
  "sample_running",
  "sample_pending",
  "full_running",
  "completed",
  "rework_requested",
  "failed",
  "deleted",
]);
export const jobComplexityEnum = pgEnum("job_complexity", ["simple", "complex"]);
export const jobVisibilityEnum = pgEnum("job_visibility", ["workspace", "restricted"]);
export const messageRoleEnum = pgEnum("message_role", ["user", "assistant", "system"]);
export const planStatusEnum = pgEnum("plan_status", ["pending", "approved", "rejected"]);
export const runStatusEnum = pgEnum("run_status", [
  "pending",
  "running",
  "succeeded",
  "failed",
]);
export const artifactKindEnum = pgEnum("artifact_kind", [
  "input",
  "preview",
  "sample_output",
  "output",
  "log",
]);
export const recipeStatusEnum = pgEnum("recipe_status", ["candidate", "published", "archived"]);

/* ----------------------------------------------------------------------------
 * Workspace, roles, permissions, users
 * ------------------------------------------------------------------------- */

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: roleKeyEnum("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  // System roles cannot be deleted; super_admin permissions are also non-editable.
  isSystem: boolean("is_system").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const permissions = pgTable("permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  description: text("description"),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name"),
    roleId: uuid("role_id").references(() => roles.id),
    workspaceId: uuid("workspace_id").references(() => workspaces.id),
    status: userStatusEnum("status").notNull().default("invited"),
    // Permanent, non-revokable owner (md@tresconglobal.com). Guarded in app logic.
    isSuperAdmin: boolean("is_super_admin").notNull().default(false),
    invitedBy: uuid("invited_by"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

/* ----------------------------------------------------------------------------
 * Auth: sessions, OTP codes, invitations
 * ------------------------------------------------------------------------- */

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // opaque random token (also the cookie value)
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  userAgent: text("user_agent"),
  ip: text("ip"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ----------------------------------------------------------------------------
 * Jobs and the conversational execution cycle
 * ------------------------------------------------------------------------- */

export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  title: text("title").notNull().default("Untitled job"),
  status: jobStatusEnum("status").notNull().default("draft"),
  complexity: jobComplexityEnum("complexity"),
  visibility: jobVisibilityEnum("visibility").notNull().default("workspace"),
  // Structured interpretation of intent (not free-form chat). See PRD §6.3.
  structuredUnderstanding: jsonb("structured_understanding").$type<Json>(),
  // Logical pointer to the active execution_plans row (no FK to avoid cycle).
  currentPlanId: uuid("current_plan_id"),
  recipeId: uuid("recipe_id"),
  // Running total of Gemini tokens spent on this job (sum across clarify+plan calls).
  aiTokens: integer("ai_tokens").notNull().default(0),
  deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobMessages = pgTable("job_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  role: messageRoleEnum("role").notNull(),
  content: text("content").notNull(),
  metadata: jsonb("metadata").$type<Json>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const clarificationQuestions = pgTable("clarification_questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  order: integer("order").notNull().default(0),
  question: text("question").notNull(),
  options: jsonb("options").$type<string[]>(), // predefined selectable answers
  allowOther: boolean("allow_other").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const clarificationAnswers = pgTable("clarification_answers", {
  id: uuid("id").primaryKey().defaultRandom(),
  questionId: uuid("question_id")
    .notNull()
    .references(() => clarificationQuestions.id, { onDelete: "cascade" }),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  answer: text("answer").notNull(),
  isOther: boolean("is_other").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const executionPlans = pgTable("execution_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  version: integer("version").notNull().default(1),
  summary: text("summary").notNull(),
  steps: jsonb("steps").$type<string[]>(),
  // Machine-executable transform spec the worker runs (see src/lib/operations.ts).
  operations: jsonb("operations").$type<Operation[]>(),
  expectedOutput: text("expected_output"),
  risks: text("risks"),
  status: planStatusEnum("status").notNull().default("pending"),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sampleRuns = pgTable("sample_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  planId: uuid("plan_id").references(() => executionPlans.id),
  status: runStatusEnum("status").notNull().default("pending"),
  rowsSampled: integer("rows_sampled"),
  previewArtifactId: uuid("preview_artifact_id"),
  summary: text("summary"),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const fullRuns = pgTable("full_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  planId: uuid("plan_id").references(() => executionPlans.id),
  status: runStatusEnum("status").notNull().default("pending"),
  progress: integer("progress").notNull().default(0), // 0–100
  outputArtifactId: uuid("output_artifact_id"),
  summary: text("summary"),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const fileArtifacts = pgTable("file_artifacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").references(() => jobs.id, { onDelete: "cascade" }),
  kind: artifactKindEnum("kind").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type"),
  sizeBytes: integer("size_bytes"),
  storageKey: text("storage_key").notNull(), // R2 object key
  checksum: text("checksum"),
  createdBy: uuid("created_by").references(() => users.id),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ----------------------------------------------------------------------------
 * Reusable recipes (Phase 2 surface, modeled now)
 * ------------------------------------------------------------------------- */

export const recipes = pgTable("recipes", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  title: text("title").notNull(), // layman-friendly
  description: text("description").notNull(), // layman-friendly
  status: recipeStatusEnum("status").notNull().default("candidate"),
  currentVersionId: uuid("current_version_id"),
  createdFromJobId: uuid("created_from_job_id").references(() => jobs.id),
  createdBy: uuid("created_by").references(() => users.id),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const recipeVersions = pgTable("recipe_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  recipeId: uuid("recipe_id")
    .notNull()
    .references(() => recipes.id, { onDelete: "cascade" }),
  version: integer("version").notNull().default(1),
  structuredLogic: jsonb("structured_logic").$type<Json>(),
  settings: jsonb("settings").$type<Json>(),
  outputExpectations: text("output_expectations"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ----------------------------------------------------------------------------
 * Governance: audit log, notifications
 * ------------------------------------------------------------------------- */

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id),
  actorUserId: uuid("actor_user_id").references(() => users.id),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  details: jsonb("details").$type<Json>(),
  ip: text("ip"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  jobId: uuid("job_id").references(() => jobs.id, { onDelete: "cascade" }),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ----------------------------------------------------------------------------
 * Relations (for typed query helpers)
 * ------------------------------------------------------------------------- */

export const usersRelations = relations(users, ({ one, many }) => ({
  role: one(roles, { fields: [users.roleId], references: [roles.id] }),
  workspace: one(workspaces, { fields: [users.workspaceId], references: [workspaces.id] }),
  sessions: many(sessions),
  jobs: many(jobs),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  users: many(users),
  rolePermissions: many(rolePermissions),
}));

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [jobs.workspaceId], references: [workspaces.id] }),
  creator: one(users, { fields: [jobs.createdBy], references: [users.id] }),
  messages: many(jobMessages),
  questions: many(clarificationQuestions),
  plans: many(executionPlans),
  artifacts: many(fileArtifacts),
}));

export const jobMessagesRelations = relations(jobMessages, ({ one }) => ({
  job: one(jobs, { fields: [jobMessages.jobId], references: [jobs.id] }),
}));
