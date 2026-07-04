// POST /api/worker-callback — ported from tools/smartexcel/src/server/worker-callback.ts.
// Lives at the app root (not under /api/smartexcel/) because the Python
// worker's callback path is hardcoded to `{APP_CALLBACK_URL}/api/worker-callback`
// (tools/smartexcel/worker/app/main.py) — matching it here avoids touching the
// worker's own deployed code. Machine-to-machine: authenticated by
// SMARTEXCEL_WORKER_SHARED_SECRET, called directly by the Python worker
// (unchanged, separate Railway service) when a sample/full run finishes. Not a
// session/user route.
import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/app/lib/smartexcel/db/client";
import { getConfig } from "@/app/lib/smartexcel/lib/env";
import { writeAudit } from "@/app/lib/smartexcel/lib/audit";
import { canTransition, type JobStatus } from "@/app/lib/smartexcel/lib/job-states";

const callbackSchema = z.object({
  job_id: z.string().uuid(),
  stage: z.enum(["sample", "full"]),
  status: z.enum(["succeeded", "failed"]),
  output_object_key: z.string().nullish(),
  preview_object_key: z.string().nullish(),
  summary: z.string().default(""),
  rows_processed: z.number().int().nonnegative().default(0),
});

async function recordArtifact(
  db: ReturnType<typeof getDb>,
  jobId: string,
  kind: "sample_output" | "output" | "preview",
  storageKey: string,
  fileName: string,
  mimeType: string,
): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(schema.fileArtifacts).values({ id, jobId, kind, fileName, mimeType, storageKey });
  return id;
}

export async function POST(request: NextRequest) {
  const secret = getConfig().WORKER_SHARED_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: z.infer<typeof callbackSchema>;
  try {
    payload = callbackSchema.parse(await request.json());
  } catch (err) {
    console.error("worker-callback: invalid payload", err);
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const db = getDb();
  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, payload.job_id));
  if (!job) return NextResponse.json({ error: "job not found" }, { status: 404 });

  const succeeded = payload.status === "succeeded";
  const previewId =
    succeeded && payload.preview_object_key
      ? await recordArtifact(db, job.id, "preview", payload.preview_object_key, "preview.json", "application/json")
      : null;
  const outputKind = payload.stage === "sample" ? "sample_output" : "output";
  const outputId =
    succeeded && payload.output_object_key
      ? await recordArtifact(
          db,
          job.id,
          outputKind,
          payload.output_object_key,
          payload.stage === "sample" ? "sample-output.xlsx" : "output.xlsx",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
      : null;

  if (payload.stage === "sample") {
    const [run] = await db
      .select()
      .from(schema.sampleRuns)
      .where(eq(schema.sampleRuns.jobId, job.id))
      .orderBy(desc(schema.sampleRuns.createdAt))
      .limit(1);
    if (run) {
      await db
        .update(schema.sampleRuns)
        .set({
          status: succeeded ? "succeeded" : "failed",
          rowsSampled: payload.rows_processed,
          previewArtifactId: previewId ?? outputId,
          summary: payload.summary,
          error: succeeded ? null : payload.summary,
          finishedAt: new Date(),
        })
        .where(eq(schema.sampleRuns.id, run.id));
    }
  } else {
    const [run] = await db
      .select()
      .from(schema.fullRuns)
      .where(eq(schema.fullRuns.jobId, job.id))
      .orderBy(desc(schema.fullRuns.createdAt))
      .limit(1);
    if (run) {
      await db
        .update(schema.fullRuns)
        .set({
          status: succeeded ? "succeeded" : "failed",
          progress: 100,
          outputArtifactId: outputId,
          summary: payload.summary,
          error: succeeded ? null : payload.summary,
          finishedAt: new Date(),
        })
        .where(eq(schema.fullRuns.id, run.id));
    }
  }

  const target: JobStatus = !succeeded ? "failed" : payload.stage === "sample" ? "sample_pending" : "completed";
  if (canTransition(job.status as JobStatus, target)) {
    await db.update(schema.jobs).set({ status: target, updatedAt: new Date() }).where(eq(schema.jobs.id, job.id));
  }

  const message = !succeeded
    ? `The ${payload.stage} run failed: ${payload.summary || "unknown error"}.`
    : payload.stage === "sample"
      ? `Sample ready. ${payload.summary} Review the preview — chat to refine, re-run the sample, or click **Run full job** when happy.`
      : `Full run complete. ${payload.summary} Your output is ready to download.`;
  await db.insert(schema.jobMessages).values({ jobId: job.id, role: "assistant", content: message });
  await db.insert(schema.notifications).values({
    userId: job.createdBy,
    type: succeeded ? `job.${payload.stage}_ready` : "job.failed",
    title: succeeded ? `Job "${job.title}" — ${payload.stage} ready` : `Job "${job.title}" failed`,
    body: payload.summary,
    jobId: job.id,
  });
  await writeAudit({
    workspaceId: job.workspaceId,
    action: `run.${payload.stage}.${payload.status}`,
    entityType: "job",
    entityId: job.id,
    details: { rowsProcessed: payload.rows_processed },
  });

  return NextResponse.json({ ok: true });
}
