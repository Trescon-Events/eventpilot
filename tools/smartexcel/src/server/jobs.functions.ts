// Minimal job endpoints to make the workspace tangible. The full conversational
// execution cycle (clarify -> plan -> sample -> full run) is Phase 1; these cover
// create / list / read so the two-pane workspace renders real data.

import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema, type DB } from "@/db";
import { requireUser } from "@/lib/session";
import { presignPut } from "@/lib/storage";
import { canTransition, type JobStatus } from "@/lib/job-states";
import { hasPermission, PERMISSIONS, type PermissionKey } from "@/lib/roles";
import { writeAudit } from "@/lib/audit";
import type { AuthUser } from "@/types/auth";

export function userCan(user: AuthUser, permission: PermissionKey): boolean {
  return hasPermission(
    { isSuperAdmin: user.isSuperAdmin, permissions: new Set<string>(user.permissions) },
    permission,
  );
}

export function ensurePermission(user: AuthUser, permission: PermissionKey) {
  if (!userCan(user, permission)) {
    throw new Error("You don't have permission to do that.");
  }
}

// Spreadsheet + supporting document formats accepted for job intake (PRD §6.6).
const ACCEPTED_EXTENSIONS = [
  "xlsx", "xlsm", "xlsb", "xls", "csv", "tsv", "pdf", "doc", "docx", "txt", "md",
  "xml", "png", "jpg", "jpeg", "gif", "webp",
];

function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
}

// Load a job the active user is allowed to see, or throw a uniform "not found".
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

// Atomically increment the running AI-token total spent on a job.
export async function addAiTokens(db: DB, jobId: string, tokens: number): Promise<void> {
  if (tokens <= 0) return;
  await db
    .update(schema.jobs)
    .set({ aiTokens: sql`${schema.jobs.aiTokens} + ${tokens}` })
    .where(eq(schema.jobs.id, jobId));
}

// Most recent input file uploaded for a job (the file jobs operate on in V1).
export async function latestInputArtifact(db: DB, jobId: string) {
  const [artifact] = await db
    .select()
    .from(schema.fileArtifacts)
    .where(and(eq(schema.fileArtifacts.jobId, jobId), eq(schema.fileArtifacts.kind, "input")))
    .orderBy(desc(schema.fileArtifacts.createdAt))
    .limit(1);
  return artifact ?? null;
}

export const listJobs = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser();
  if (!user.workspaceId) return { jobs: [], canSeeAll: false };
  const db = getDb();
  // Standard users see only their own jobs; admin and Super Admin see every job
  // in the workspace (the audit history).
  const canSeeAll = user.isSuperAdmin || user.roleKey === "admin";
  const scope = canSeeAll
    ? eq(schema.jobs.workspaceId, user.workspaceId)
    : and(
        eq(schema.jobs.workspaceId, user.workspaceId),
        eq(schema.jobs.createdBy, user.id),
      );
  const rows = await db
    .select({
      id: schema.jobs.id,
      title: schema.jobs.title,
      status: schema.jobs.status,
      visibility: schema.jobs.visibility,
      createdAt: schema.jobs.createdAt,
      updatedAt: schema.jobs.updatedAt,
      createdBy: schema.jobs.createdBy,
      aiTokens: schema.jobs.aiTokens,
      creatorEmail: schema.users.email,
      creatorName: schema.users.name,
    })
    .from(schema.jobs)
    .leftJoin(schema.users, eq(schema.jobs.createdBy, schema.users.id))
    .where(and(scope, isNull(schema.jobs.deletedAt)))
    .orderBy(desc(schema.jobs.updatedAt));
  return { jobs: rows, canSeeAll };
});

const createJobInput = z.object({ title: z.string().trim().min(1).optional() });

export const createJob = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => createJobInput.parse(d))
  .handler(async ({ data }) => {
    const user = await requireUser();
    if (!user.workspaceId) throw new Error("No workspace assigned to this user.");
    const db = getDb();
    const [job] = await db
      .insert(schema.jobs)
      .values({
        workspaceId: user.workspaceId,
        createdBy: user.id,
        title: data.title ?? "Untitled job",
        status: "draft",
      })
      .returning({ id: schema.jobs.id });
    await db.insert(schema.jobMessages).values({
      jobId: job.id,
      role: "system",
      content: "Job created. Upload a file and describe what you need to get started.",
    });
    return { id: job.id };
  });

const jobIdInput = z.object({ jobId: z.string().uuid() });

export const getJob = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => jobIdInput.parse(d))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const db = getDb();
    const job = await loadJobForUser(db, data.jobId, user);
    const messages = await db
      .select()
      .from(schema.jobMessages)
      .where(eq(schema.jobMessages.jobId, job.id))
      .orderBy(schema.jobMessages.createdAt);

    const questions = await db
      .select()
      .from(schema.clarificationQuestions)
      .where(eq(schema.clarificationQuestions.jobId, job.id))
      .orderBy(schema.clarificationQuestions.order);
    const answers = await db
      .select({ questionId: schema.clarificationAnswers.questionId })
      .from(schema.clarificationAnswers)
      .where(eq(schema.clarificationAnswers.jobId, job.id));
    const answeredIds = new Set(answers.map((a) => a.questionId));
    const activeQuestion = questions.find((q) => !answeredIds.has(q.id)) ?? null;

    let currentPlan = null;
    if (job.currentPlanId) {
      const [plan] = await db
        .select()
        .from(schema.executionPlans)
        .where(eq(schema.executionPlans.id, job.currentPlanId));
      currentPlan = plan ?? null;
    }

    const ctx = { isSuperAdmin: user.isSuperAdmin, permissions: new Set<string>(user.permissions) };
    const permissions = {
      canDelete: hasPermission(ctx, PERMISSIONS.JOBS_DELETE),
      canSetVisibility:
        job.createdBy === user.id || hasPermission(ctx, PERMISSIONS.WORKSPACE_MANAGE),
      canSaveRecipe: hasPermission(ctx, PERMISSIONS.RECIPES_CREATE),
    };

    return { job, messages, activeQuestion, currentPlan, permissions };
  });

const requestUploadInput = z.object({
  jobId: z.string().uuid(),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().max(255).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
});

// Step 1 of intake: validate, reserve a fileArtifact row, and return a presigned
// PUT URL so the browser uploads the file straight to R2 (PRD §6.6).
export const requestUpload = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => requestUploadInput.parse(d))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const db = getDb();
    const job = await loadJobForUser(db, data.jobId, user);

    const ext = fileExtension(data.fileName);
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      throw new Error(
        `Unsupported file type ".${ext}". Accepted: ${ACCEPTED_EXTENSIONS.join(", ")}.`,
      );
    }

    const artifactId = crypto.randomUUID();
    const storageKey = `jobs/${job.id}/input/${artifactId}-${safeName(data.fileName)}`;
    await db.insert(schema.fileArtifacts).values({
      id: artifactId,
      jobId: job.id,
      kind: "input",
      fileName: data.fileName,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      storageKey,
      createdBy: user.id,
    });

    const uploadUrl = await presignPut(storageKey);
    return { artifactId, uploadUrl };
  });

const confirmUploadInput = z.object({
  jobId: z.string().uuid(),
  artifactId: z.string().uuid(),
});

// Step 2 of intake: the browser confirms the R2 upload succeeded. Records a
// system message and moves a fresh job from draft into clarifying.
export const confirmUpload = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => confirmUploadInput.parse(d))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const db = getDb();
    const job = await loadJobForUser(db, data.jobId, user);

    const [artifact] = await db
      .select()
      .from(schema.fileArtifacts)
      .where(
        and(eq(schema.fileArtifacts.id, data.artifactId), eq(schema.fileArtifacts.jobId, job.id)),
      );
    if (!artifact) throw new Error("Upload not found.");

    await db.insert(schema.jobMessages).values({
      jobId: job.id,
      role: "system",
      content: `Uploaded \`${artifact.fileName}\`.`,
    });

    if (canTransition(job.status as JobStatus, "clarifying")) {
      await db
        .update(schema.jobs)
        .set({ status: "clarifying", updatedAt: new Date() })
        .where(eq(schema.jobs.id, job.id));
    }

    return { ok: true };
  });

const postMessageInput = z.object({
  jobId: z.string().uuid(),
  content: z.string().trim().min(1).max(4000),
});

// Append a free-text user message to the job thread (the conversational surface
// the clarification engine builds on).
export const postMessage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => postMessageInput.parse(d))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const db = getDb();
    const job = await loadJobForUser(db, data.jobId, user);
    await db.insert(schema.jobMessages).values({
      jobId: job.id,
      role: "user",
      content: data.content,
    });
    return { ok: true };
  });

export const renameJob = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ jobId: z.string().uuid(), title: z.string().trim().min(1).max(200) }).parse(d),
  )
  .handler(async ({ data }) => {
    const user = await requireUser();
    const db = getDb();
    const job = await loadJobForUser(db, data.jobId, user);
    if (job.createdBy !== user.id) ensurePermission(user, PERMISSIONS.WORKSPACE_MANAGE);
    await db
      .update(schema.jobs)
      .set({ title: data.title, updatedAt: new Date() })
      .where(eq(schema.jobs.id, job.id));
    return { ok: true as const };
  });

export const setJobVisibility = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({ jobId: z.string().uuid(), visibility: z.enum(["workspace", "restricted"]) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const user = await requireUser();
    const db = getDb();
    const job = await loadJobForUser(db, data.jobId, user);
    if (job.createdBy !== user.id) ensurePermission(user, PERMISSIONS.WORKSPACE_MANAGE);

    await db
      .update(schema.jobs)
      .set({ visibility: data.visibility, updatedAt: new Date() })
      .where(eq(schema.jobs.id, job.id));
    await writeAudit({
      workspaceId: job.workspaceId,
      actorUserId: user.id,
      action: "job.visibility",
      entityType: "job",
      entityId: job.id,
      details: { visibility: data.visibility },
    });
    return { ok: true };
  });

// Soft delete: set deletedAt so the job drops out of all access paths but stays
// recoverable within the retention window (PRD §7.3). Status is left intact so a
// restore returns the job to where it was.
export const RETENTION_DAYS = 30;
const RESTORE_WINDOW_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

export const deleteJob = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const user = await requireUser();
    ensurePermission(user, PERMISSIONS.JOBS_DELETE);
    const db = getDb();
    const job = await loadJobForUser(db, data.jobId, user);

    await db
      .update(schema.jobs)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.jobs.id, job.id));
    await writeAudit({
      workspaceId: job.workspaceId,
      actorUserId: user.id,
      action: "job.delete",
      entityType: "job",
      entityId: job.id,
    });
    return { ok: true };
  });

export const restoreJob = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const user = await requireUser();
    ensurePermission(user, PERMISSIONS.JOBS_DELETE);
    const db = getDb();
    const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, data.jobId));
    if (!job || job.workspaceId !== user.workspaceId) throw new Error("Job not found.");
    if (!job.deletedAt) throw new Error("Job is not deleted.");
    if (Date.now() - job.deletedAt.getTime() > RESTORE_WINDOW_MS) {
      throw new Error("This job is past its recovery window.");
    }

    await db
      .update(schema.jobs)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(eq(schema.jobs.id, job.id));
    await writeAudit({
      workspaceId: job.workspaceId,
      actorUserId: user.id,
      action: "job.restore",
      entityType: "job",
      entityId: job.id,
    });
    return { ok: true };
  });
