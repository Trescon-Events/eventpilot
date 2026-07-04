// SmartExcel's data model, ported from tools/smartexcel/src/db/schema.ts and
// consolidated into EventPilot's own Supabase Postgres (was a separate Neon
// DB) under a dedicated `smartexcel` schema — see smartexcelSchema below.
// Keep in sync with the Python worker's expectations (operations shape) and
// with tools/smartexcel's own copy if that app is ever revived.

import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { Operation } from "../lib/operations";

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

// Dedicated Postgres schema inside EventPilot's own Supabase database —
// consolidated here 04 Jul 2026 (was a separate Neon DB). Namespacing under
// `smartexcel.*` guarantees zero collision with EventPilot's own `public.*`
// tables regardless of naming (jobs/users/roles would otherwise be very
// plausible collisions).
export const smartexcelSchema = pgSchema("smartexcel");

/* ----------------------------------------------------------------------------
 * Enums
 * ------------------------------------------------------------------------- */

export const userStatusEnum = smartexcelSchema.enum("user_status", ["invited", "active", "disabled"]);
export const roleKeyEnum = smartexcelSchema.enum("role_key", ["super_admin", "admin", "standard"]);

export const jobStatusEnum = smartexcelSchema.enum("job_status", [
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
export const jobComplexityEnum = smartexcelSchema.enum("job_complexity", ["simple", "complex"]);
export const jobVisibilityEnum = smartexcelSchema.enum("job_visibility", ["workspace", "restricted"]);
export const messageRoleEnum = smartexcelSchema.enum("message_role", ["user", "assistant", "system"]);
export const planStatusEnum = smartexcelSchema.enum("plan_status", ["pending", "approved", "rejected"]);
export const runStatusEnum = smartexcelSchema.enum("run_status", [
  "pending",
  "running",
  "succeeded",
  "failed",
]);
export const artifactKindEnum = smartexcelSchema.enum("artifact_kind", [
  "input",
  "preview",
  "sample_output",
  "output",
  "log",
]);
export const recipeStatusEnum = smartexcelSchema.enum("recipe_status", ["candidate", "published", "archived"]);

/* ----------------------------------------------------------------------------
 * Workspace, roles, permissions, users
 * ------------------------------------------------------------------------- */

export const workspaces = smartexcelSchema.table("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const roles = smartexcelSchema.table("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: roleKeyEnum("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  isSystem: boolean("is_system").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const permissions = smartexcelSchema.table("permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  description: text("description"),
});

export const rolePermissions = smartexcelSchema.table(
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

export const users = smartexcelSchema.table(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name"),
    roleId: uuid("role_id").references(() => roles.id),
    workspaceId: uuid("workspace_id").references(() => workspaces.id),
    status: userStatusEnum("status").notNull().default("invited"),
    isSuperAdmin: boolean("is_super_admin").notNull().default(false),
    invitedBy: uuid("invited_by"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

/* ----------------------------------------------------------------------------
 * Sessions — retained in schema for compatibility with existing rows, but no
 * longer written to. Auth is now a per-request bridge off EventPilot's own
 * tcs_session cookie (see app/lib/smartexcel/auth.ts), not a local session.
 * ------------------------------------------------------------------------- */

export const sessions = smartexcelSchema.table("sessions", {
  id: text("id").primaryKey(),
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

export const jobs = smartexcelSchema.table("jobs", {
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
  structuredUnderstanding: jsonb("structured_understanding").$type<Json>(),
  currentPlanId: uuid("current_plan_id"),
  recipeId: uuid("recipe_id"),
  aiTokens: integer("ai_tokens").notNull().default(0),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobMessages = smartexcelSchema.table("job_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  role: messageRoleEnum("role").notNull(),
  content: text("content").notNull(),
  metadata: jsonb("metadata").$type<Json>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const clarificationQuestions = smartexcelSchema.table("clarification_questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  order: integer("order").notNull().default(0),
  question: text("question").notNull(),
  options: jsonb("options").$type<string[]>(),
  allowOther: boolean("allow_other").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const clarificationAnswers = smartexcelSchema.table("clarification_answers", {
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

export const executionPlans = smartexcelSchema.table("execution_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  version: integer("version").notNull().default(1),
  summary: text("summary").notNull(),
  steps: jsonb("steps").$type<string[]>(),
  operations: jsonb("operations").$type<Operation[]>(),
  expectedOutput: text("expected_output"),
  risks: text("risks"),
  status: planStatusEnum("status").notNull().default("pending"),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sampleRuns = smartexcelSchema.table("sample_runs", {
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

export const fullRuns = smartexcelSchema.table("full_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  planId: uuid("plan_id").references(() => executionPlans.id),
  status: runStatusEnum("status").notNull().default("pending"),
  progress: integer("progress").notNull().default(0),
  outputArtifactId: uuid("output_artifact_id"),
  summary: text("summary"),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const fileArtifacts = smartexcelSchema.table("file_artifacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").references(() => jobs.id, { onDelete: "cascade" }),
  kind: artifactKindEnum("kind").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type"),
  sizeBytes: integer("size_bytes"),
  storageKey: text("storage_key").notNull(),
  checksum: text("checksum"),
  createdBy: uuid("created_by").references(() => users.id),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ----------------------------------------------------------------------------
 * Reusable recipes
 * ------------------------------------------------------------------------- */

export const recipes = smartexcelSchema.table("recipes", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: recipeStatusEnum("status").notNull().default("candidate"),
  currentVersionId: uuid("current_version_id"),
  createdFromJobId: uuid("created_from_job_id").references(() => jobs.id),
  createdBy: uuid("created_by").references(() => users.id),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const recipeVersions = smartexcelSchema.table("recipe_versions", {
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

export const auditLogs = smartexcelSchema.table("audit_logs", {
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

export const notifications = smartexcelSchema.table("notifications", {
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
 * Relations
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
