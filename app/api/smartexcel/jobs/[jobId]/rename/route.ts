import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/app/lib/smartexcel/db/client";
import { getSmartExcelUser, ensurePermission, PERMISSIONS } from "@/app/lib/smartexcel/auth";
import { loadJobForUser } from "@/app/lib/smartexcel/lib/jobs-helpers";

const bodySchema = z.object({ title: z.string().trim().min(1).max(200) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const user = await getSmartExcelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { jobId } = await params;
  const { title } = bodySchema.parse(await req.json());
  const db = getDb();

  try {
    const job = await loadJobForUser(db, jobId, user);
    if (job.createdBy !== user.id) ensurePermission(user, PERMISSIONS.WORKSPACE_MANAGE);
    await db.update(schema.jobs).set({ title, updatedAt: new Date() }).where(eq(schema.jobs.id, job.id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 400 });
  }
}
