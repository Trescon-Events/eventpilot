// GET /api/smartexcel/jobs/:jobId/preview — ported from getPreview
import { NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/app/lib/smartexcel/db/client";
import { getSmartExcelUser } from "@/app/lib/smartexcel/auth";
import { loadJobForUser } from "@/app/lib/smartexcel/lib/jobs-helpers";
import { getObjectText, presignGet } from "@/app/lib/smartexcel/lib/storage";

export async function GET(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const user = await getSmartExcelUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { jobId } = await params;
  const db = getDb();

  try {
    const job = await loadJobForUser(db, jobId, user);

    const [preview] = await db
      .select()
      .from(schema.fileArtifacts)
      .where(and(eq(schema.fileArtifacts.jobId, job.id), eq(schema.fileArtifacts.kind, "preview")))
      .orderBy(desc(schema.fileArtifacts.createdAt))
      .limit(1);

    let columns: string[] = [];
    let rows: string[][] = [];
    if (preview) {
      const text = await getObjectText(preview.storageKey);
      if (text) {
        try {
          const parsed = JSON.parse(text) as { columns?: string[]; rows?: string[][] };
          columns = parsed.columns ?? [];
          rows = parsed.rows ?? [];
        } catch {
          // Malformed preview — fall through to empty grid.
        }
      }
    }

    const [output] = await db
      .select()
      .from(schema.fileArtifacts)
      .where(and(eq(schema.fileArtifacts.jobId, job.id), inArray(schema.fileArtifacts.kind, ["output", "sample_output"])))
      .orderBy(desc(schema.fileArtifacts.createdAt))
      .limit(1);

    let download: { fileName: string; url: string } | null = null;
    if (output) {
      try {
        download = { fileName: output.fileName, url: await presignGet(output.storageKey) };
      } catch {
        // R2 not configured for presigning — show the grid without a download link.
      }
    }

    return NextResponse.json({ columns, rows, download });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 400 });
  }
}
