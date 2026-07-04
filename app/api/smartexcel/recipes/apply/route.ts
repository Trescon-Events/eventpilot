// POST /api/smartexcel/recipes/apply — ported from applyRecipe
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/app/lib/smartexcel/db/client";
import { getSmartExcelUser, ensurePermission, PERMISSIONS } from "@/app/lib/smartexcel/auth";
import { writeAudit } from "@/app/lib/smartexcel/lib/audit";
import type { Json } from "@/app/lib/smartexcel/db/schema";

const bodySchema = z.object({ recipeId: z.string().uuid(), title: z.string().trim().max(255).optional() });

interface RecipeLogic {
  understanding: Json | null;
}

export async function POST(req: NextRequest) {
  const user = await getSmartExcelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    ensurePermission(user, PERMISSIONS.RECIPES_APPLY);
    const workspaceId = user.workspaceId;
    if (!workspaceId) return NextResponse.json({ error: "No workspace assigned to this user." }, { status: 400 });
    const data = bodySchema.parse(await req.json());
    const db = getDb();

    const [recipe] = await db.select().from(schema.recipes).where(eq(schema.recipes.id, data.recipeId));
    if (!recipe || recipe.workspaceId !== workspaceId) {
      return NextResponse.json({ error: "Recipe not found." }, { status: 404 });
    }
    if (recipe.status !== "published") {
      return NextResponse.json({ error: "Only published recipes can be applied." }, { status: 400 });
    }

    let understanding: Json | null = null;
    if (recipe.currentVersionId) {
      const [version] = await db.select().from(schema.recipeVersions).where(eq(schema.recipeVersions.id, recipe.currentVersionId));
      const logic = (version?.structuredLogic ?? null) as RecipeLogic | null;
      understanding = logic?.understanding ?? null;
    }

    const [job] = await db
      .insert(schema.jobs)
      .values({
        workspaceId,
        createdBy: user.id,
        title: data.title || `${recipe.title} (applied)`,
        status: "draft",
        recipeId: recipe.id,
        structuredUnderstanding: understanding,
      })
      .returning({ id: schema.jobs.id });
    await db.insert(schema.jobMessages).values({
      jobId: job.id,
      role: "system",
      content: `Started from recipe "${recipe.title}". Upload a file to run it.`,
    });
    await writeAudit({
      workspaceId,
      actorUserId: user.id,
      action: "recipe.apply",
      entityType: "recipe",
      entityId: recipe.id,
      details: { jobId: job.id },
    });
    return NextResponse.json({ jobId: job.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 400 });
  }
}
