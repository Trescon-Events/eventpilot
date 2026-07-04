// GET /api/smartexcel/jobs — list (ported from listJobs)
// POST /api/smartexcel/jobs — create (ported from createJob)
import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/app/lib/smartexcel/db/client";
import { getSmartExcelUser } from "@/app/lib/smartexcel/auth";

export async function GET() {
  const user = await getSmartExcelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.workspaceId) return NextResponse.json({ jobs: [], canSeeAll: false });

  const db = getDb();
  const canSeeAll = user.isSuperAdmin || user.roleKey === "admin";
  const scope = canSeeAll
    ? eq(schema.jobs.workspaceId, user.workspaceId)
    : and(eq(schema.jobs.workspaceId, user.workspaceId), eq(schema.jobs.createdBy, user.id));
  const rows = await db
    .select({
      id: schema.jobs.id,
      title: schema.jobs.title,
      status: schema.jobs.status,
      visibility: schema.jobs.visibility,
      createdAt: schema.jobs.createdAt,
      updatedAt: schema.jobs.updatedAt,
      createdBy: schema.jobs.createdBy,
      aiTokens: schema.jobs.aiTokens,
      creatorEmail: schema.users.email,
      creatorName: schema.users.name,
    })
    .from(schema.jobs)
    .leftJoin(schema.users, eq(schema.jobs.createdBy, schema.users.id))
    .where(and(scope, isNull(schema.jobs.deletedAt)))
    .orderBy(desc(schema.jobs.updatedAt));
  return NextResponse.json({ jobs: rows, canSeeAll });
}

const createJobInput = z.object({ title: z.string().trim().min(1).optional() });

export async function POST(req: NextRequest) {
  const user = await getSmartExcelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.workspaceId) {
    return NextResponse.json({ error: "No workspace assigned to this user." }, { status: 400 });
  }

  const data = createJobInput.parse(await req.json().catch(() => ({})));
  const db = getDb();
  const [job] = await db
    .insert(schema.jobs)
    .values({
      workspaceId: user.workspaceId,
      createdBy: user.id,
      title: data.title ?? "Untitled job",
      status: "draft",
    })
    .returning({ id: schema.jobs.id });
  await db.insert(schema.jobMessages).values({
    jobId: job.id,
    role: "system",
    content: "Job created. Upload a file and describe what you need to get started.",
  });
  return NextResponse.json({ id: job.id });
}
