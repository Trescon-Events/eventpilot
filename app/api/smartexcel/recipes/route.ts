// GET /api/smartexcel/recipes — ported from listRecipes
import { NextResponse } from "next/server";
import { and, desc, eq, ne } from "drizzle-orm";
import { getDb, schema } from "@/app/lib/smartexcel/db/client";
import { getSmartExcelUser, userCan, PERMISSIONS } from "@/app/lib/smartexcel/auth";

export async function GET() {
  const user = await getSmartExcelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.workspaceId) return NextResponse.json({ recipes: [], canReview: false, canApply: false });

  const db = getDb();
  const canReview = userCan(user, PERMISSIONS.RECIPES_REVIEW);

  const recipes = await db
    .select()
    .from(schema.recipes)
    .where(
      and(
        eq(schema.recipes.workspaceId, user.workspaceId),
        ne(schema.recipes.status, "archived"),
        canReview ? undefined : eq(schema.recipes.status, "published"),
      ),
    )
    .orderBy(desc(schema.recipes.updatedAt));
  return NextResponse.json({ recipes, canReview, canApply: userCan(user, PERMISSIONS.RECIPES_APPLY) });
}
