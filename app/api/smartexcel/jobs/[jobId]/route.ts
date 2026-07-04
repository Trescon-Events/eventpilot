// GET /api/smartexcel/jobs/:jobId — ported from getJob
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/app/lib/smartexcel/db/client";
import { getSmartExcelUser, userCan, PERMISSIONS } from "@/app/lib/smartexcel/auth";
import { loadJobForUser } from "@/app/lib/smartexcel/lib/jobs-helpers";

export async function GET(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const user = await getSmartExcelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { jobId } = await params;
  const db = getDb();

  let job;
  try {
    job = await loadJobForUser(db, jobId, user);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Job not found." }, { status: 404 });
  }

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

  const permissions = {
    canDelete: userCan(user, PERMISSIONS.JOBS_DELETE),
    canSetVisibility: job.createdBy === user.id || userCan(user, PERMISSIONS.WORKSPACE_MANAGE),
    canSaveRecipe: userCan(user, PERMISSIONS.RECIPES_CREATE),
  };

  return NextResponse.json({ job, messages, activeQuestion, currentPlan, permissions });
}
