// GET /api/smartexcel/recipes/:recipeId — ported from getRecipe
import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/app/lib/smartexcel/db/client";
import { getSmartExcelUser, userCan, PERMISSIONS } from "@/app/lib/smartexcel/auth";

export async function GET(_req: Request, { params }: { params: Promise<{ recipeId: string }> }) {
  const user = await getSmartExcelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { recipeId } = await params;
  const db = getDb();

  const [recipe] = await db.select().from(schema.recipes).where(eq(schema.recipes.id, recipeId));
  if (!recipe || recipe.workspaceId !== user.workspaceId) {
    return NextResponse.json({ error: "Recipe not found." }, { status: 404 });
  }
  if (recipe.status !== "published" && !userCan(user, PERMISSIONS.RECIPES_REVIEW)) {
    return NextResponse.json({ error: "Recipe not found." }, { status: 404 });
  }
  const versions = await db
    .select()
    .from(schema.recipeVersions)
    .where(eq(schema.recipeVersions.recipeId, recipe.id))
    .orderBy(desc(schema.recipeVersions.version));
  return NextResponse.json({
    recipe,
    versions,
    canPublish: userCan(user, PERMISSIONS.RECIPES_PUBLISH),
    canApply: userCan(user, PERMISSIONS.RECIPES_APPLY),
  });
}
