// Dispatches a queued job stage to the Python processing worker. The worker
// returns 202 and processes in the background, then POSTs results to the
// callback route (src/routes/api/worker-callback.ts). Throwing here lets the
// queue retry the message.
import { getConfig } from "./env";
import type { QueueJobMessage } from "./cf";

export async function dispatchJob(msg: QueueJobMessage): Promise<void> {
  const c = getConfig();
  if (!c.WORKER_URL) throw new Error("WORKER_URL is not configured.");

  const res = await fetch(`${c.WORKER_URL.replace(/\/$/, "")}/process`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(c.WORKER_SHARED_SECRET ? { authorization: `Bearer ${c.WORKER_SHARED_SECRET}` } : {}),
    },
    body: JSON.stringify({
      job_id: msg.jobId,
      plan_id: msg.planId,
      stage: msg.stage,
      input_object_key: msg.inputObjectKey,
      operations: msg.operations ?? [],
      options: msg.options ?? {},
    }),
  });

  if (!res.ok) {
    throw new Error(`Worker dispatch failed (${res.status}) for job ${msg.jobId} [${msg.stage}].`);
  }
}

export interface FileInspection {
  sheets: string[];
  headers: string[];
  sampleRows: string[][];
}

export interface ValidationIssue {
  index: number;
  op: string;
  description: string | null;
  error: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

// Pre-flight check for AI-emitted custom_transform code. Reuses the worker's
// own sandbox validator + unflattener so what passes here will pass at runtime.
// Best-effort: if the worker is unconfigured/unreachable, returns ok=true so
// the sample run still proceeds (worker will surface any errors there).
export async function validateOperations(
  operations: unknown[],
): Promise<ValidationResult> {
  const c = getConfig();
  if (!c.WORKER_URL) return { ok: true, issues: [] };
  try {
    const res = await fetch(`${c.WORKER_URL.replace(/\/$/, "")}/validate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(c.WORKER_SHARED_SECRET ? { authorization: `Bearer ${c.WORKER_SHARED_SECRET}` } : {}),
      },
      body: JSON.stringify({ operations }),
    });
    if (!res.ok) return { ok: true, issues: [] };
    return (await res.json()) as ValidationResult;
  } catch {
    return { ok: true, issues: [] };
  }
}

// Synchronously ask the worker to read column/sheet/sample context from an
// uploaded file (the worker can parse xlsx; Workers can't). Best-effort: returns
// null if the worker is unconfigured or unreachable so clarification can still run.
export async function inspectFile(inputObjectKey: string): Promise<FileInspection | null> {
  const c = getConfig();
  if (!c.WORKER_URL) return null;
  try {
    const res = await fetch(`${c.WORKER_URL.replace(/\/$/, "")}/inspect`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(c.WORKER_SHARED_SECRET ? { authorization: `Bearer ${c.WORKER_SHARED_SECRET}` } : {}),
      },
      body: JSON.stringify({ input_object_key: inputObjectKey }),
    });
    if (!res.ok) return null;
    return (await res.json()) as FileInspection;
  } catch {
    return null;
  }
}
