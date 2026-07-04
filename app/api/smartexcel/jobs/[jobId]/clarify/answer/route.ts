// POST /api/smartexcel/jobs/:jobId/clarify/answer — ported from answerQuestion
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema, type DB } from "@/app/lib/smartexcel/db/client";
import { getSmartExcelUser } from "@/app/lib/smartexcel/auth";
import { loadJobForUser, addAiTokens, latestInputArtifact } from "@/app/lib/smartexcel/lib/jobs-helpers";
import { inspectFile } from "@/app/lib/smartexcel/lib/worker-dispatch";
import {
  buildStructuredUnderstanding,
  nextQuestion,
  type AnsweredQuestion,
  type FileContext,
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

async function answeredQuestions(db: DB, jobId: string): Promise<AnsweredQuestion[]> {
  return db
    .select({
      question: schema.clarificationQuestions.question,
      answer: schema.clarificationAnswers.answer,
    })
    .from(schema.clarificationAnswers)
    .innerJoin(
      schema.clarificationQuestions,
      eq(schema.clarificationAnswers.questionId, schema.clarificationQuestions.id),
    )
    .where(eq(schema.clarificationAnswers.jobId, jobId))
    .orderBy(schema.clarificationQuestions.order);
}

function understandingSummary(u: StructuredUnderstanding): string {
  return (
    `Here's what I understand:\n\n**Goal:** ${u.goal}\n\n` +
    `**What I'll do:** ${u.operations.join("; ")}\n\n` +
    `**Expected output:** ${u.outputExpectation}\n\n` +
    `Does this look right? Chat to refine, or click **Run sample** in the preview pane to try it on the first ~100 rows.`
  );
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

const bodySchema = z.object({
  questionId: z.string().uuid(),
  answer: z.string().trim().min(1).max(2000),
  isOther: z.boolean().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const user = await getSmartExcelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { jobId } = await params;
  const data = bodySchema.parse(await req.json());
  const db = getDb();

  try {
    const job = await loadJobForUser(db, jobId, user);

    const [question] = await db
      .select()
      .from(schema.clarificationQuestions)
      .where(and(eq(schema.clarificationQuestions.id, data.questionId), eq(schema.clarificationQuestions.jobId, job.id)));
    if (!question) return NextResponse.json({ error: "Question not found." }, { status: 404 });

    const [already] = await db
      .select({ id: schema.clarificationAnswers.id })
      .from(schema.clarificationAnswers)
      .where(eq(schema.clarificationAnswers.questionId, question.id));
    if (already) return NextResponse.json({ error: "This question has already been answered." }, { status: 400 });

    await db.insert(schema.clarificationAnswers).values({
      questionId: question.id,
      jobId: job.id,
      answer: data.answer,
      isOther: data.isOther ?? false,
    });
    await db.insert(schema.jobMessages).values({ jobId: job.id, role: "user", content: data.answer });

    const ctx = await buildContext(db, job.id);
    const answered = await answeredQuestions(db, job.id);
    let tokens = 0;
    const nq = await nextQuestion(ctx, answered);
    tokens += nq.tokens;
    if (nq.result.done) {
      tokens += await finalize(db, job.id, ctx, answered);
      await addAiTokens(db, job.id, tokens);
      return NextResponse.json({ status: "understanding" });
    }
    await db.insert(schema.clarificationQuestions).values({
      jobId: job.id,
      order: answered.length,
      question: nq.result.question.question,
      options: nq.result.question.options,
      allowOther: nq.result.question.allowOther,
    });
    await db.insert(schema.jobMessages).values({ jobId: job.id, role: "assistant", content: nq.result.question.question });
    await addAiTokens(db, job.id, tokens);
    return NextResponse.json({ status: "clarifying" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 400 });
  }
}
