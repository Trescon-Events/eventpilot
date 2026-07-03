import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Plus } from "lucide-react";
import { createJob, listJobs } from "@/server/jobs.functions";
import { JOB_STATUS_LABELS, type JobStatus } from "@/lib/job-states";

export const Route = createFileRoute("/_app/jobs/")({
  loader: async () => listJobs(),
  component: JobsPage,
});

function JobsPage() {
  const { jobs, canSeeAll } = Route.useLoaderData();
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createNamedJob() {
    const title = name.trim();
    if (!title) return;
    setBusy(true);
    setError(null);
    try {
      const { id } = await createJob({ data: { title } });
      await router.navigate({ to: "/jobs/$jobId", params: { jobId: id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create job.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-5">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-100">Job history</h1>
        <p className="text-sm text-zinc-400">
          {canSeeAll
            ? "All jobs run in this workspace."
            : "Your jobs. Admins see everyone's history."}
        </p>
      </div>

      {/* New job — requires a name */}
      <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <label className="block text-xs font-medium text-zinc-400">Start a new job</label>
        <div className="mt-2 flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void createNamedJob();
              }
            }}
            placeholder="Name this job (e.g. Clean April leads list)"
            className="flex-1 rounded-md border border-zinc-800 px-3 py-1.5 text-sm outline-none focus:border-indigo-400"
          />
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={() => void createNamedJob()}
            className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            <Plus size={14} /> {busy ? "Creating…" : "Create job"}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </div>

      {jobs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900 py-16 text-center text-sm text-zinc-400">
          No jobs yet. Name your first one above to begin.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-left text-xs uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Status</th>
                {canSeeAll && <th className="px-4 py-2 font-medium">Created by</th>}
                <th className="px-4 py-2 font-medium">Created</th>
                <th className="px-4 py-2 font-medium">Updated</th>
                <th className="px-4 py-2 text-right font-medium">AI tokens</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {jobs.map((j) => (
                <tr key={j.id} className="hover:bg-zinc-900">
                  <td className="px-4 py-2">
                    <Link
                      to="/jobs/$jobId"
                      params={{ jobId: j.id }}
                      className="font-medium text-indigo-300 hover:underline"
                    >
                      {j.title}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-medium text-zinc-400">
                      {JOB_STATUS_LABELS[j.status as JobStatus] ?? j.status}
                    </span>
                  </td>
                  {canSeeAll && (
                    <td className="px-4 py-2 text-xs text-zinc-400">
                      {j.creatorName ?? j.creatorEmail ?? "—"}
                    </td>
                  )}
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-zinc-400">
                    {new Date(j.createdAt).toLocaleString()}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-zinc-400">
                    {new Date(j.updatedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right text-xs font-mono text-zinc-400">
                    {j.aiTokens.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
