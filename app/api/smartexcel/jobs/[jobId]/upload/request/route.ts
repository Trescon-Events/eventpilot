import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/app/lib/smartexcel/db/client";
import { getSmartExcelUser } from "@/app/lib/smartexcel/auth";
import { loadJobForUser, ACCEPTED_EXTENSIONS, fileExtension, safeName } from "@/app/lib/smartexcel/lib/jobs-helpers";
import { presignPut } from "@/app/lib/smartexcel/lib/storage";

const bodySchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().max(255).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const user = await getSmartExcelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { jobId } = await params;
  const data = bodySchema.parse(await req.json());
  const db = getDb();

  try {
    const job = await loadJobForUser(db, jobId, user);
    const ext = fileExtension(data.fileName);
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { error: `Unsupported file type ".${ext}". Accepted: ${ACCEPTED_EXTENSIONS.join(", ")}.` },
        { status: 400 },
      );
    }

    const artifactId = crypto.randomUUID();
    const storageKey = `jobs/${job.id}/input/${artifactId}-${safeName(data.fileName)}`;
    await db.insert(schema.fileArtifacts).values({
      id: artifactId,
      jobId: job.id,
      kind: "input",
      fileName: data.fileName,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      storageKey,
      createdBy: user.id,
    });

    const uploadUrl = await presignPut(storageKey);
    return NextResponse.json({ artifactId, uploadUrl });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 400 });
  }
}
