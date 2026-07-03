// Reusable recipes (PRD §6.9, Phase 2). A successful job can be promoted to a
// candidate recipe, an admin reviews + publishes it with a layman title and
// description, and it can then be applied to a new file. Versions are retained.
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { ensurePermission, loadJobForUser, userCan } from "@/server/jobs.functions";
import { PERMISSIONS } from "@/lib/roles";
import { writeAudit } from "@/lib/audit";
import type { Json } from "@/db/schema";
import type { StructuredUnderstanding } from "@/lib/ai";

interface RecipeLogic {
  understanding: StructuredUnderstanding | null;
  planSummary: string;
  planSteps: string[];
  expectedOutput: string;
}

function requireWorkspace(workspaceId: string | null): string {
  if (!workspaceId) throw new Error("No workspace assigned to this user.");
  return workspaceId;
}

export const createRecipeFromJob = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const user = await requireUser();
    ensurePermission(user, PERMISSIONS.RECIPES_CREATE);
    const db = getDb();
    const job = await loadJobForUser(db, data.jobId, user);
    if (job.status !== "completed") {
      throw new Error("Only completed jobs can be saved as a recipe.");
    }
    const workspaceId = requireWorkspace(job.workspaceId);

    let plan: { summary: string; steps: string[] | null; expectedOutput: string | null } | null =
      null;
    if (job.currentPlanId) {
      const [p] = await db
        .select()
        .from(schema.executionPlans)
        .where(eq(schema.executionPlans.id, job.currentPlanId));
      plan = p ?? null;
    }

    const understanding = (job.structuredUnderstanding as StructuredUnderstanding | null) ?? null;
    const logic: RecipeLogic = {
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
    return { recipeId };
  });

export const listRecipes = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser();
  if (!user.workspaceId) return { recipes: [], canReview: false, canApply: false };
  const db = getDb();
  const canReview = userCan(user, PERMISSIONS.RECIPES_REVIEW);

  const recipes = await db
    .select()
    .from(schema.recipes)
    .where(
      and(
        eq(schema.recipes.workspaceId, user.workspaceId),
        ne(schema.recipes.status, "archived"),
        // Reviewers see candidates too; everyone sees published recipes.
        canReview ? undefined : eq(schema.recipes.status, "published"),
      ),
    )
    .orderBy(desc(schema.recipes.updatedAt));
  return { recipes, canReview, canApply: userCan(user, PERMISSIONS.RECIPES_APPLY) };
});

export const getRecipe = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ recipeId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const db = getDb();
    const [recipe] = await db
      .select()
      .from(schema.recipes)
      .where(eq(schema.recipes.id, data.recipeId));
    if (!recipe || recipe.workspaceId !== user.workspaceId) throw new Error("Recipe not found.");
    if (recipe.status !== "published" && !userCan(user, PERMISSIONS.RECIPES_REVIEW)) {
      throw new Error("Recipe not found.");
    }
    const versions = await db
      .select()
      .from(schema.recipeVersions)
      .where(eq(schema.recipeVersions.recipeId, recipe.id))
      .orderBy(desc(schema.recipeVersions.version));
    return {
      recipe,
      versions,
      canPublish: userCan(user, PERMISSIONS.RECIPES_PUBLISH),
      canApply: userCan(user, PERMISSIONS.RECIPES_APPLY),
    };
  });

export const publishRecipe = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        recipeId: z.string().uuid(),
        title: z.string().trim().min(1).max(120),
        description: z.string().trim().min(1).max(1000),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const user = await requireUser();
    ensurePermission(user, PERMISSIONS.RECIPES_PUBLISH);
    const db = getDb();
    const [recipe] = await db
      .select()
      .from(schema.recipes)
      .where(eq(schema.recipes.id, data.recipeId));
    if (!recipe || recipe.workspaceId !== user.workspaceId) throw new Error("Recipe not found.");

    await db
      .update(schema.recipes)
      .set({
        status: "published",
        title: data.title,
        description: data.description,
        approvedBy: user.id,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.recipes.id, recipe.id));
    await writeAudit({
      workspaceId: recipe.workspaceId,
      actorUserId: user.id,
      action: "recipe.publish",
      entityType: "recipe",
      entityId: recipe.id,
    });
    return { ok: true };
  });

export const archiveRecipe = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ recipeId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const user = await requireUser();
    ensurePermission(user, PERMISSIONS.RECIPES_PUBLISH);
    const db = getDb();
    const [recipe] = await db
      .select()
      .from(schema.recipes)
      .where(eq(schema.recipes.id, data.recipeId));
    if (!recipe || recipe.workspaceId !== user.workspaceId) throw new Error("Recipe not found.");

    await db
      .update(schema.recipes)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(schema.recipes.id, recipe.id));
    await writeAudit({
      workspaceId: recipe.workspaceId,
      actorUserId: user.id,
      action: "recipe.archive",
      entityType: "recipe",
      entityId: recipe.id,
    });
    return { ok: true };
  });

export const applyRecipe = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ recipeId: z.string().uuid(), title: z.string().trim().max(255).optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const user = await requireUser();
    ensurePermission(user, PERMISSIONS.RECIPES_APPLY);
    const workspaceId = requireWorkspace(user.workspaceId);
    const db = getDb();
    const [recipe] = await db
      .select()
      .from(schema.recipes)
      .where(eq(schema.recipes.id, data.recipeId));
    if (!recipe || recipe.workspaceId !== workspaceId) throw new Error("Recipe not found.");
    if (recipe.status !== "published") throw new Error("Only published recipes can be applied.");

    let understanding: Json | null = null;
    if (recipe.currentVersionId) {
      const [version] = await db
        .select()
        .from(schema.recipeVersions)
        .where(eq(schema.recipeVersions.id, recipe.currentVersionId));
      const logic = (version?.structuredLogic ?? null) as RecipeLogic | null;
      understanding = (logic?.understanding ?? null) as Json | null;
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
    return { jobId: job.id };
  });
