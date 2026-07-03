// Cloudflare Worker entry. TanStack Start owns the HTTP `fetch` handler; we
// compose it with the Python-worker callback endpoint and a Cloudflare Queues
// `queue` consumer so all three live on one Worker. `main` in wrangler.jsonc
// points here.
import serverEntry from "@tanstack/react-start/server-entry";
import type { QueueJobMessage } from "./lib/cf";
import { dispatchJob } from "./lib/worker-dispatch";
import { handleWorkerCallback } from "./server/worker-callback";

const startFetch = serverEntry.fetch as (
  request: Request,
  ...rest: unknown[]
) => Response | Promise<Response>;

export default {
  ...serverEntry,
  async fetch(request: Request, ...rest: unknown[]): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/api/worker-callback") {
      return handleWorkerCallback(request);
    }
    return startFetch(request, ...rest);
  },
  async queue(batch: MessageBatch<QueueJobMessage>): Promise<void> {
    for (const message of batch.messages) {
      try {
        await dispatchJob(message.body);
        message.ack();
      } catch (err) {
        console.error("job queue dispatch failed", err);
        message.retry();
      }
    }
  },
};
