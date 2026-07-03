// Workspace analytics + operational config for the admin panel (PRD §6.10, Phase 3).
import { createServerFn } from "@tanstack/react-start";
import { and, count, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { ensurePermission, RETENTION_DAYS } from "@/server/jobs.functions";
import { PERMISSIONS } from "@/lib/roles";
import { MODELS } from "@/lib/ai";

export const getWorkspaceAnalytics = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser();
  ensurePermission(user, PERMISSIONS.AUDIT_VIEW); // admin-only surface
  const ws = user.workspaceId;

  const empty = {
    jobsByStatus: {} as Record<string, number>,
    totalJobs: 0,
    completed: 0,
    failed: 0,
    successRate: null as number | null,
    deletedJobs: 0,
    recipesByStatus: {} as Record<string, number>,
    models: MODELS,
    retentionDays: RETENTION_DAYS,
  };
  if (!ws) return empty;

  const db = getDb();
  const jobRows = await db
    .select({ status: schema.jobs.status, n: count() })
    .from(schema.jobs)
    .where(and(eq(schema.jobs.workspaceId, ws), isNull(schema.jobs.deletedAt)))
    .groupBy(schema.jobs.status);
  const [deleted] = await db
    .select({ n: count() })
    .from(schema.jobs)
    .where(and(eq(schema.jobs.workspaceId, ws), isNotNull(schema.jobs.deletedAt)));
  const recipeRows = await db
    .select({ status: schema.recipes.status, n: count() })
    .from(schema.recipes)
    .where(eq(schema.recipes.workspaceId, ws))
    .groupBy(schema.recipes.status);

  const jobsByStatus = Object.fromEntries(jobRows.map((r) => [r.status, r.n]));
  const totalJobs = jobRows.reduce((sum, r) => sum + r.n, 0);
  const completed = jobsByStatus["completed"] ?? 0;
  const failed = jobsByStatus["failed"] ?? 0;
  const finished = completed + failed;

  return {
    jobsByStatus,
    totalJobs,
    completed,
    failed,
    successRate: finished > 0 ? Math.round((completed / finished) * 100) : null,
    deletedJobs: deleted?.n ?? 0,
    recipesByStatus: Object.fromEntries(recipeRows.map((r) => [r.status, r.n])),
    models: MODELS,
    retentionDays: RETENTION_DAYS,
  };
});
