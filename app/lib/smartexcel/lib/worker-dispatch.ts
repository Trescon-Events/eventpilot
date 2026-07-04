// Dispatches a job stage to the Python processing worker (unchanged, separate
// Railway service). The worker returns 202 and processes in the background,
// then POSTs results back to /api/smartexcel/worker-callback.
import { getConfig } from "./env";
import type { Operation } from "./operations";

export interface QueueJobMessage {
  jobId: string;
  planId: string | null;
  stage: "sample" | "full";
  inputObjectKey: string;
  operations: Operation[];
  options?: Record<string, unknown>;
}

export async function dispatchJob(msg: QueueJobMessage): Promise<void> {
  const c = getConfig();
  if (!c.WORKER_URL) throw new Error("SMARTEXCEL_WORKER_URL is not configured.");

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

export async function validateOperations(operations: unknown[]): Promise<ValidationResult> {
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

// Direct HTTP call — mirrors the confirmed-live production setup (no paid
// Cloudflare Queues plan; the worker returns 202 and calls back).
export async function enqueueJob(message: QueueJobMessage): Promise<void> {
  await dispatchJob(message);
}
