// Conversational clarification (PRD §6.3). Classifies job complexity, asks
// structured questions one at a time, and produces a durable structured
// understanding before handing off to planning.
import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema, type DB } from "@/db";
import { requireUser } from "@/lib/session";
import { addAiTokens, loadJobForUser, latestInputArtifact } from "@/server/jobs.functions";
import { inspectFile } from "@/lib/worker-dispatch";
import {
  buildStructuredUnderstanding,
  chatTurn,
  classifyComplexity,
  nextQuestion,
  type AnsweredQuestion,
  type ClarifyingQuestion,
  type FileContext,
  type NextQuestionResult,
  type StructuredUnderstanding,
} from "@/lib/ai";

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

function understandingSummary(u: StructuredUnderstanding): string {
  return (
    `Here's what I understand:\n\n**Goal:** ${u.goal}\n\n` +
    `**What I'll do:** ${u.operations.join("; ")}\n\n` +
    `**Expected output:** ${u.outputExpectation}\n\n` +
    `Does this look right? Chat to refine, or click **Run sample** in the preview pane to try it on the first ~100 rows.`
  );
}

// Build (or rebuild) the structured understanding and present it for the user's
// confirmation. Stays in "clarifying" — the plan is only generated once the user
// explicitly proceeds (PRD §6.3). Returns Gemini tokens spent in this call.
async function finalize(
  db: DB,
  jobId: string,
  ctx: FileContext,
  answered: AnsweredQuestion[],
): Promise<number> {
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

export const startClarification = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const db = getDb();
    const job = await loadJobForUser(db, data.jobId, user);

    // Understanding already set (e.g. seeded from a recipe): present it for
    // confirmation. The plan itself is generated lazily on the first Run
    // sample, so we don't burn tokens before the user has signed off in chat.
    if (job.structuredUnderstanding) {
      await db.insert(schema.jobMessages).values({
        jobId: job.id,
        role: "assistant",
        content: understandingSummary(job.structuredUnderstanding as StructuredUnderstanding),
      });
      return { status: "understanding" as const };
    }
    const existing = await db
      .select({ id: schema.clarificationQuestions.id })
      .from(schema.clarificationQuestions)
      .where(eq(schema.clarificationQuestions.jobId, job.id))
      .limit(1);
    if (existing.length) return { status: "in_progress" as const };

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
      return { status: "understanding" as const };
    }
    await storeQuestion(db, job.id, 0, next.question);
    await addAiTokens(db, job.id, tokens);
    return { status: "clarifying" as const };
  });

export const answerQuestion = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        jobId: z.string().uuid(),
        questionId: z.string().uuid(),
        answer: z.string().trim().min(1).max(2000),
        isOther: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const user = await requireUser();
    const db = getDb();
    const job = await loadJobForUser(db, data.jobId, user);

    const [question] = await db
      .select()
      .from(schema.clarificationQuestions)
      .where(
        and(
          eq(schema.clarificationQuestions.id, data.questionId),
          eq(schema.clarificationQuestions.jobId, job.id),
        ),
      );
    if (!question) throw new Error("Question not found.");

    const [already] = await db
      .select({ id: schema.clarificationAnswers.id })
      .from(schema.clarificationAnswers)
      .where(eq(schema.clarificationAnswers.questionId, question.id));
    if (already) throw new Error("This question has already been answered.");

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
      return { status: "understanding" as const };
    }
    await storeQuestion(db, job.id, answered.length, nq.result.question);
    await addAiTokens(db, job.id, tokens);
    return { status: "clarifying" as const };
  });

// React to a user chat turn. Two modes (one AI call decides which):
//   - "refine" — user changed the requirement. Update structured understanding,
//                post a short confirmation of what changed.
//   - "reply"  — user asked a question / requested suggestions / chit-chat.
//                Don't touch the understanding; just post the answer.
export const refineUnderstanding = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const db = getDb();
    const job = await loadJobForUser(db, data.jobId, user);
    if (!job.structuredUnderstanding) throw new Error("There's no understanding to refine yet.");

    const ctx = await buildContext(db, job.id);
    const recent = await db
      .select({ role: schema.jobMessages.role, content: schema.jobMessages.content })
      .from(schema.jobMessages)
      .where(eq(schema.jobMessages.jobId, job.id))
      .orderBy(schema.jobMessages.createdAt);
    const dialog = recent.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    }));

    const { result, tokens } = await chatTurn(
      ctx,
      job.structuredUnderstanding as StructuredUnderstanding,
      dialog,
    );
    await addAiTokens(db, job.id, tokens);

    if (result.mode === "refine") {
      await db
        .update(schema.jobs)
        .set({ structuredUnderstanding: result.understanding, updatedAt: new Date() })
        .where(eq(schema.jobs.id, job.id));
    }
    await db.insert(schema.jobMessages).values({
      jobId: job.id,
      role: "assistant",
      content: result.reply,
    });
    return { ok: true, mode: result.mode };
  });
