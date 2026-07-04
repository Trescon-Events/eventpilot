// Shared helpers used across the jobs/clarify/plan/runs/recipes route handlers
// — ported from tools/smartexcel/src/server/jobs.functions.ts (the pieces
// other server functions imported from it), kept as one module to avoid
// route-handler-to-route-handler imports.
import { and, desc, eq, sql } from "drizzle-orm";
import { schema, type DB } from "../db/client";
import type { AuthUser } from "../auth";

export const RETENTION_DAYS = 30;

export const ACCEPTED_EXTENSIONS = [
  "xlsx", "xlsm", "xlsb", "xls", "csv", "tsv", "pdf", "doc", "docx", "txt", "md",
  "xml", "png", "jpg", "jpeg", "gif", "webp",
];

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
}

export async function loadJobForUser(db: DB, jobId: string, user: AuthUser) {
  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
  if (!job || job.deletedAt || job.workspaceId !== user.workspaceId) {
    throw new Error("Job not found.");
  }
  if (job.visibility === "restricted" && job.createdBy !== user.id && !user.isSuperAdmin) {
    throw new Error("Job not found.");
  }
  return job;
}

export async function addAiTokens(db: DB, jobId: string, tokens: number): Promise<void> {
  if (tokens <= 0) return;
  await db
    .update(schema.jobs)
    .set({ aiTokens: sql`${schema.jobs.aiTokens} + ${tokens}` })
    .where(eq(schema.jobs.id, jobId));
}

export async function latestInputArtifact(db: DB, jobId: string) {
  const [artifact] = await db
    .select()
    .from(schema.fileArtifacts)
    .where(and(eq(schema.fileArtifacts.jobId, jobId), eq(schema.fileArtifacts.kind, "input")))
    .orderBy(desc(schema.fileArtifacts.createdAt))
    .limit(1);
  return artifact ?? null;
}
