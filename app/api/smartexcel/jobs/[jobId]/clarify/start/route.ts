// POST /api/smartexcel/jobs/:jobId/clarify/start — ported from startClarification
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, schema, type DB } from "@/app/lib/smartexcel/db/client";
import { getSmartExcelUser } from "@/app/lib/smartexcel/auth";
import { loadJobForUser, addAiTokens, latestInputArtifact } from "@/app/lib/smartexcel/lib/jobs-helpers";
import { inspectFile } from "@/app/lib/smartexcel/lib/worker-dispatch";
import {
  buildStructuredUnderstanding,
  classifyComplexity,
  nextQuestion,
  type AnsweredQuestion,
  type ClarifyingQuestion,
  type FileContext,
  type NextQuestionResult,
  type StructuredUnderstanding,
} from "@/app/lib/smartexcel/lib/ai";

async function buildContext(db: DB, jobId: string): Promise<FileContext> {
  const artifact = await latestInputArtifact(db, jobId);
  const inspection = artifact ? await inspectFile(artifact.storageKey) : null;
  const userMessages = await db
    .select({ content: schema.jobMessages.content })
    .from(schema.jobMessages)
    .where(and(eq(schema.jobMessages.jobId, jobId), eq(schema.jobMessages.role, "user")))
    .orderBy(schema.jobMessages.createdAt);
  return {
    fileName: artifact?.fileName ?? "uploaded file",
    sheets: inspection?.sheets,
    headers: inspection?.headers,
    sampleRows: inspection?.sampleRows,
    userNotes: userMessages.map((m) => m.content),
  };
}

function understandingSummary(u: StructuredUnderstanding): string {
  return (
    `Here's what I understand:\n\n**Goal:** ${u.goal}\n\n` +
    `**What I'll do:** ${u.operations.join("; ")}\n\n` +
    `**Expected output:** ${u.outputExpectation}\n\n` +
    `Does this look right? Chat to refine, or click **Run sample** in the preview pane to try it on the first ~100 rows.`
  );
}

async function storeQuestion(db: DB, jobId: string, order: number, q: ClarifyingQuestion) {
  await db.insert(schema.clarificationQuestions).values({
    jobId,
    order,
    question: q.question,
    options: q.options,
    allowOther: q.allowOther,
  });
  await db.insert(schema.jobMessages).values({ jobId, role: "assistant", content: q.question });
}

async function finalize(db: DB, jobId: string, ctx: FileContext, answered: AnsweredQuestion[]): Promise<number> {
  const { result: understanding, tokens } = await buildStructuredUnderstanding(ctx, answered);
  await db
    .update(schema.jobs)
    .set({ structuredUnderstanding: understanding, updatedAt: new Date() })
    .where(eq(schema.jobs.id, jobId));
  await db.insert(schema.jobMessages).values({
    jobId,
    role: "assistant",
    content: understandingSummary(understanding),
  });
  return tokens;
}

export async function POST(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const user = await getSmartExcelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { jobId } = await params;
  const db = getDb();

  try {
    const job = await loadJobForUser(db, jobId, user);

    if (job.structuredUnderstanding) {
      await db.insert(schema.jobMessages).values({
        jobId: job.id,
        role: "assistant",
        content: understandingSummary(job.structuredUnderstanding as StructuredUnderstanding),
      });
      return NextResponse.json({ status: "understanding" });
    }
    const existing = await db
      .select({ id: schema.clarificationQuestions.id })
      .from(schema.clarificationQuestions)
      .where(eq(schema.clarificationQuestions.jobId, job.id))
      .limit(1);
    if (existing.length) return NextResponse.json({ status: "in_progress" });

    const ctx = await buildContext(db, job.id);
    let tokens = 0;
    const classify = await classifyComplexity(ctx);
    tokens += classify.tokens;

    let next: NextQuestionResult;
    if (classify.result.complexity === "simple") {
      next = { done: true };
    } else {
      const nq = await nextQuestion(ctx, []);
      tokens += nq.tokens;
      next = nq.result;
    }

    if (next.done) {
      tokens += await finalize(db, job.id, ctx, []);
      await addAiTokens(db, job.id, tokens);
      return NextResponse.json({ status: "understanding" });
    }
    await storeQuestion(db, job.id, 0, next.question);
    await addAiTokens(db, job.id, tokens);
    return NextResponse.json({ status: "clarifying" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 400 });
  }
}
