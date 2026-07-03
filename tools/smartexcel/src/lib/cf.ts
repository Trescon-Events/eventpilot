// Access Cloudflare bindings (R2, Queues) from the `cloudflare:workers` env.
// Server functions and the queue consumer read bindings through here. Text vars
// and secrets continue to come from process.env via src/lib/env.ts.
import { env } from "cloudflare:workers";
import type { Operation } from "./operations";

// Message enqueued for the Python worker to process a job stage. The queue
// consumer (src/worker.ts) dispatches these to WORKER_URL/process.
export interface QueueJobMessage {
  jobId: string;
  planId: string | null;
  stage: "sample" | "full";
  inputObjectKey: string;
  operations: Operation[];
  options?: Record<string, unknown>;
}

interface CfBindings {
  FILES: R2Bucket;
  JOB_QUEUE: Queue<QueueJobMessage>;
}

function bindings(): CfBindings {
  return env as unknown as CfBindings;
}

export function filesBucket(): R2Bucket {
  return bindings().FILES;
}

export function jobQueue(): Queue<QueueJobMessage> {
  return bindings().JOB_QUEUE;
}
