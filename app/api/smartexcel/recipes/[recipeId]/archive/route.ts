import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/app/lib/smartexcel/db/client";
import { getSmartExcelUser, ensurePermission, PERMISSIONS } from "@/app/lib/smartexcel/auth";
import { writeAudit } from "@/app/lib/smartexcel/lib/audit";

export async function POST(_req: Request, { params }: { params: Promise<{ recipeId: string }> }) {
  const user = await getSmartExcelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    ensurePermission(user, PERMISSIONS.RECIPES_PUBLISH);
    const { recipeId } = await params;
    const db = getDb();
    const [recipe] = await db.select().from(schema.recipes).where(eq(schema.recipes.id, recipeId));
    if (!recipe || recipe.workspaceId !== user.workspaceId) {
      return NextResponse.json({ error: "Recipe not found." }, { status: 404 });
    }

    await db.update(schema.recipes).set({ status: "archived", updatedAt: new Date() }).where(eq(schema.recipes.id, recipe.id));
    await writeAudit({
      workspaceId: recipe.workspaceId,
      actorUserId: user.id,
      action: "recipe.archive",
      entityType: "recipe",
      entityId: recipe.id,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 400 });
  }
}
