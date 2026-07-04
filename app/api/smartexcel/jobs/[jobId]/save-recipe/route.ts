// POST /api/smartexcel/jobs/:jobId/save-recipe — ported from createRecipeFromJob
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/app/lib/smartexcel/db/client";
import { getSmartExcelUser, ensurePermission, PERMISSIONS } from "@/app/lib/smartexcel/auth";
import { loadJobForUser } from "@/app/lib/smartexcel/lib/jobs-helpers";
import { writeAudit } from "@/app/lib/smartexcel/lib/audit";
import type { Json } from "@/app/lib/smartexcel/db/schema";
import type { StructuredUnderstanding } from "@/app/lib/smartexcel/lib/ai";

export async function POST(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const user = await getSmartExcelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    ensurePermission(user, PERMISSIONS.RECIPES_CREATE);
    const { jobId } = await params;
    const db = getDb();
    const job = await loadJobForUser(db, jobId, user);
    if (job.status !== "completed") {
      return NextResponse.json({ error: "Only completed jobs can be saved as a recipe." }, { status: 400 });
    }
    const workspaceId = job.workspaceId;
    if (!workspaceId) return NextResponse.json({ error: "No workspace assigned to this user." }, { status: 400 });

    let plan: { summary: string; steps: string[] | null; expectedOutput: string | null } | null = null;
    if (job.currentPlanId) {
      const [p] = await db.select().from(schema.executionPlans).where(eq(schema.executionPlans.id, job.currentPlanId));
      plan = p ?? null;
    }

    const understanding = (job.structuredUnderstanding as StructuredUnderstanding | null) ?? null;
    const logic = {
      understanding,
      planSummary: plan?.summary ?? "",
      planSteps: plan?.steps ?? [],
      expectedOutput: plan?.expectedOutput ?? "",
    };

    const recipeId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    await db.insert(schema.recipes).values({
      id: recipeId,
      workspaceId,
      title: understanding?.goal?.slice(0, 120) || job.title,
      description: understanding?.goal || "Reusable spreadsheet operation.",
      status: "candidate",
      currentVersionId: versionId,
      createdFromJobId: job.id,
      createdBy: user.id,
    });
    await db.insert(schema.recipeVersions).values({
      id: versionId,
      recipeId,
      version: 1,
      structuredLogic: logic as unknown as Json,
      outputExpectations: plan?.expectedOutput ?? null,
      createdBy: user.id,
    });
    await writeAudit({
      workspaceId,
      actorUserId: user.id,
      action: "recipe.create",
      entityType: "recipe",
      entityId: recipeId,
      details: { jobId: job.id },
    });
    return NextResponse.json({ recipeId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 400 });
  }
}
