import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/app/lib/smartexcel/db/client";
import { getSmartExcelUser, ensurePermission, PERMISSIONS } from "@/app/lib/smartexcel/auth";
import { writeAudit } from "@/app/lib/smartexcel/lib/audit";

const bodySchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(1000),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ recipeId: string }> }) {
  const user = await getSmartExcelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    ensurePermission(user, PERMISSIONS.RECIPES_PUBLISH);
    const { recipeId } = await params;
    const data = bodySchema.parse(await req.json());
    const db = getDb();
    const [recipe] = await db.select().from(schema.recipes).where(eq(schema.recipes.id, recipeId));
    if (!recipe || recipe.workspaceId !== user.workspaceId) {
      return NextResponse.json({ error: "Recipe not found." }, { status: 404 });
    }

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
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 400 });
  }
}
