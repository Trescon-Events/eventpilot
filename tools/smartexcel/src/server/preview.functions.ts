// Result preview + download (PRD §6.2, §7.2). Reads the small preview JSON the
// worker emits next to each output (so we never parse xlsx in the Worker) and
// mints a presigned download URL for the full output file.
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { loadJobForUser } from "@/server/jobs.functions";
import { getObjectText, presignGet } from "@/lib/storage";

export interface PreviewData {
  columns: string[];
  rows: string[][];
  download: { fileName: string; url: string } | null;
}

export const getPreview = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<PreviewData> => {
    const user = await requireUser();
    const db = getDb();
    const job = await loadJobForUser(db, data.jobId, user);

    const [preview] = await db
      .select()
      .from(schema.fileArtifacts)
      .where(
        and(eq(schema.fileArtifacts.jobId, job.id), eq(schema.fileArtifacts.kind, "preview")),
      )
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
      .where(
        and(
          eq(schema.fileArtifacts.jobId, job.id),
          inArray(schema.fileArtifacts.kind, ["output", "sample_output"]),
        ),
      )
      .orderBy(desc(schema.fileArtifacts.createdAt))
      .limit(1);

    let download: PreviewData["download"] = null;
    if (output) {
      try {
        download = { fileName: output.fileName, url: await presignGet(output.storageKey) };
      } catch {
        // R2 not configured for presigning — show the grid without a download link.
      }
    }

    return { columns, rows, download };
  });
