"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RotateCcw, Trash2 } from "lucide-react";

interface DeletedJob {
  id: string;
  title: string;
  deletedAt: string | null;
  daysRemaining: number;
  recoverable: boolean;
}

export default function DeletedJobsPage() {
  const [jobs, setJobs] = useState<DeletedJob[]>([]);
  const [retentionDays, setRetentionDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/smartexcel/admin/deleted");
    const d = await res.json();
    setJobs(d.jobs ?? []);
    setRetentionDays(d.retentionDays ?? 30);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function restore(id: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/smartexcel/jobs/${id}/restore`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Could not restore.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not restore.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="p-6 text-sm text-zinc-400">Loading…</div>;

  return (
    <div className="mx-auto max-w-7xl px-6 py-5">
      <Link href="/smartexcel/admin" className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200">
        <ArrowLeft size={15} /> Admin
      </Link>
      <div className="flex items-center gap-2">
        <Trash2 size={18} className="text-indigo-400" />
        <h1 className="text-xl font-semibold text-zinc-100">Deleted jobs</h1>
      </div>
      <p className="mt-1 text-sm text-zinc-400">
        Recoverable for {retentionDays} days from deletion. After that, they remain in the audit log but the
        workspace can no longer restore them.
      </p>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      {jobs.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-zinc-700 bg-zinc-900 py-16 text-center text-sm text-zinc-400">
          No deleted jobs.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-left text-xs uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="px-4 py-2 font-medium">Title</th>
                <th className="px-4 py-2 font-medium">Deleted</th>
                <th className="px-4 py-2 font-medium">Recoverable for</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td className="px-4 py-2 font-medium text-zinc-300">{j.title}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-zinc-400">
                    {j.deletedAt ? new Date(j.deletedAt).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {j.recoverable ? (
                      <span className="text-zinc-400">{j.daysRemaining} day(s) left</span>
                    ) : (
                      <span className="text-red-400">Past window</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      disabled={!j.recoverable || busy === j.id}
                      onClick={() => void restore(j.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2.5 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-900 disabled:opacity-50"
                    >
                      <RotateCcw size={12} /> {busy === j.id ? "Restoring…" : "Restore"}
                    </button>
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
