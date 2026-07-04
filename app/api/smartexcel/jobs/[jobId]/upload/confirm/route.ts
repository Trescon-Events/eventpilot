import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/app/lib/smartexcel/db/client";
import { getSmartExcelUser } from "@/app/lib/smartexcel/auth";
import { loadJobForUser } from "@/app/lib/smartexcel/lib/jobs-helpers";
import { canTransition, type JobStatus } from "@/app/lib/smartexcel/lib/job-states";

const bodySchema = z.object({ artifactId: z.string().uuid() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const user = await getSmartExcelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { jobId } = await params;
  const { artifactId } = bodySchema.parse(await req.json());
  const db = getDb();

  try {
    const job = await loadJobForUser(db, jobId, user);
    const [artifact] = await db
      .select()
      .from(schema.fileArtifacts)
      .where(and(eq(schema.fileArtifacts.id, artifactId), eq(schema.fileArtifacts.jobId, job.id)));
    if (!artifact) return NextResponse.json({ error: "Upload not found." }, { status: 404 });

    await db.insert(schema.jobMessages).values({
      jobId: job.id,
      role: "system",
      content: `Uploaded \`${artifact.fileName}\`.`,
    });

    if (canTransition(job.status as JobStatus, "clarifying")) {
      await db.update(schema.jobs).set({ status: "clarifying", updatedAt: new Date() }).where(eq(schema.jobs.id, job.id));
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 400 });
  }
}
