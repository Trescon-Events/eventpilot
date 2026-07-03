// Dispatch a job stage to the Python worker. We POST directly (the worker returns
// 202 and processes in the background, then calls back) — this works in local dev
// and avoids requiring the paid Cloudflare Queues plan. The JOB_QUEUE binding +
// consumer in src/worker.ts remain available if managed retries are wanted later.
import { dispatchJob } from "./worker-dispatch";
import type { QueueJobMessage } from "./cf";

export async function enqueueJob(message: QueueJobMessage): Promise<void> {
  await dispatchJob(message);
}
