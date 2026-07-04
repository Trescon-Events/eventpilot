// POST /api/smartexcel/jobs/:jobId/clarify/refine — ported from refineUnderstanding
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/app/lib/smartexcel/db/client";
import { getSmartExcelUser } from "@/app/lib/smartexcel/auth";
import { loadJobForUser, addAiTokens, latestInputArtifact } from "@/app/lib/smartexcel/lib/jobs-helpers";
import { inspectFile } from "@/app/lib/smartexcel/lib/worker-dispatch";
import { chatTurn, type FileContext, type StructuredUnderstanding } from "@/app/lib/smartexcel/lib/ai";

export async function POST(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const user = await getSmartExcelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { jobId } = await params;
  const db = getDb();

  try {
    const job = await loadJobForUser(db, jobId, user);
    if (!job.structuredUnderstanding) {
      return NextResponse.json({ error: "There's no understanding to refine yet." }, { status: 400 });
    }

    const artifact = await latestInputArtifact(db, job.id);
    const inspection = artifact ? await inspectFile(artifact.storageKey) : null;
    const ctx: FileContext = {
      fileName: artifact?.fileName ?? "uploaded file",
      sheets: inspection?.sheets,
      headers: inspection?.headers,
      sampleRows: inspection?.sampleRows,
      userNotes: [],
    };
    const recent = await db
      .select({ role: schema.jobMessages.role, content: schema.jobMessages.content })
      .from(schema.jobMessages)
      .where(eq(schema.jobMessages.jobId, job.id))
      .orderBy(schema.jobMessages.createdAt);
    const dialog = recent.map((m) => ({ role: m.role as "user" | "assistant" | "system", content: m.content }));

    const { result, tokens } = await chatTurn(ctx, job.structuredUnderstanding as StructuredUnderstanding, dialog);
    await addAiTokens(db, job.id, tokens);

    if (result.mode === "refine") {
      await db
        .update(schema.jobs)
        .set({ structuredUnderstanding: result.understanding, updatedAt: new Date() })
        .where(eq(schema.jobs.id, job.id));
    }
    await db.insert(schema.jobMessages).values({ jobId: job.id, role: "assistant", content: result.reply });
    return NextResponse.json({ ok: true, mode: result.mode });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 400 });
  }
}
